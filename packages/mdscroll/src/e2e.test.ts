import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer, type Server } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

/**
 * End-to-end suite: spawns the real built CLI as subprocesses and drives
 * it the way a user (or agent) would — serve, push, ls, rm, the default
 * push-or-serve command, stdin pipes, SSE live reload, and shutdown.
 *
 * Requires the package to be built (`pnpm -F mdscroll build`; the
 * `test:e2e` script does this) and a host shell: the tests bind
 * localhost ports and fork child processes, which fail under Claude
 * Code's default sandbox (EPERM / EMFILE).
 */

const CLI = fileURLToPath(new URL('../dist/cli.mjs', import.meta.url));
const HOST = '127.0.0.1';

const kids: ChildProcess[] = [];
const squatters: Server[] = [];
const tempDirs: string[] = [];
const sseStreams: SseStream[] = [];

const getFreePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once('error', reject);
    probe.listen(0, HOST, () => {
      const address = probe.address();
      if (address === null || typeof address === 'string') {
        probe.close(() => reject(new Error('could not determine a free port')));
        return;
      }
      probe.close(() => resolve(address.port));
    });
  });

type Needle = string | RegExp;

const matches = (buffer: string, needle: Needle): boolean =>
  typeof needle === 'string' ? buffer.includes(needle) : needle.test(buffer);

type Cli = {
  child: ChildProcess;
  stdout: () => string;
  stderr: () => string;
  waitFor: (source: 'stdout' | 'stderr', needle: Needle, timeoutMs?: number) => Promise<void>;
  waitForExit: (timeoutMs?: number) => Promise<number | null>;
};

const spawnCli = (args: string[], opts: { stdin?: string } = {}): Cli => {
  const child = spawn(process.execPath, [CLI, ...args], {
    stdio: [opts.stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
  });
  kids.push(child);
  if (opts.stdin !== undefined) child.stdin?.end(opts.stdin);

  let out = '';
  let err = '';
  type Waiter = { source: 'stdout' | 'stderr'; needle: Needle; settle: () => void };
  const waiters = new Set<Waiter>();
  const check = () => {
    for (const waiter of waiters) {
      if (matches(waiter.source === 'stdout' ? out : err, waiter.needle)) {
        waiters.delete(waiter);
        waiter.settle();
      }
    }
  };
  child.stdout?.setEncoding('utf-8');
  child.stderr?.setEncoding('utf-8');
  child.stdout?.on('data', (chunk: string) => {
    out += chunk;
    check();
  });
  child.stderr?.on('data', (chunk: string) => {
    err += chunk;
    check();
  });

  return {
    child,
    stdout: () => out,
    stderr: () => err,
    waitFor: (source, needle, timeoutMs = 10_000) =>
      new Promise<void>((resolve, reject) => {
        if (matches(source === 'stdout' ? out : err, needle)) {
          resolve();
          return;
        }
        const timer = setTimeout(() => {
          waiters.delete(waiter);
          reject(
            new Error(
              `no match for ${String(needle)} on ${source} within ${timeoutMs}ms.\nstdout: ${out}\nstderr: ${err}`,
            ),
          );
        }, timeoutMs);
        const waiter: Waiter = {
          source,
          needle,
          settle: () => {
            clearTimeout(timer);
            resolve();
          },
        };
        waiters.add(waiter);
      }),
    waitForExit: (timeoutMs = 10_000) =>
      new Promise<number | null>((resolve, reject) => {
        if (child.exitCode !== null) {
          resolve(child.exitCode);
          return;
        }
        const timer = setTimeout(() => {
          reject(
            new Error(
              `process ${child.pid} did not exit within ${timeoutMs}ms.\nstdout: ${out}\nstderr: ${err}`,
            ),
          );
        }, timeoutMs);
        child.once('exit', (code) => {
          clearTimeout(timer);
          resolve(code);
        });
      }),
  };
};

type SseStream = {
  buffer: () => string;
  waitFor: (needle: string, timeoutMs?: number) => Promise<void>;
  close: () => void;
};

const subscribeSSE = async (port: number): Promise<SseStream> => {
  const controller = new AbortController();
  const res = await fetch(`http://${HOST}:${port}/events`, { signal: controller.signal });
  const reader = res.body?.getReader();
  if (!reader) throw new Error('no SSE body');
  const decoder = new TextDecoder();
  let buf = '';
  type Waiter = { needle: string; resolve: () => void; timer: NodeJS.Timeout };
  const waiters: Waiter[] = [];

  void (async () => {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        for (let i = waiters.length - 1; i >= 0; i--) {
          const waiter = waiters[i];
          if (waiter && buf.includes(waiter.needle)) {
            clearTimeout(waiter.timer);
            waiters.splice(i, 1);
            waiter.resolve();
          }
        }
      }
    } catch {
      // stream aborted — expected on close(), or the server shut down
    }
  })();

  const stream: SseStream = {
    buffer: () => buf,
    waitFor: (needle, timeoutMs = 8_000) =>
      new Promise((resolve, reject) => {
        if (buf.includes(needle)) {
          resolve();
          return;
        }
        const timer = setTimeout(() => {
          const i = waiters.findIndex((w) => w.needle === needle);
          if (i >= 0) waiters.splice(i, 1);
          reject(
            new Error(
              `did not observe '${needle}' in SSE within ${timeoutMs}ms. buffer tail: ${buf.slice(-500)}`,
            ),
          );
        }, timeoutMs);
        waiters.push({ needle, resolve, timer });
      }),
    close: () => controller.abort(),
  };
  sseStreams.push(stream);
  return stream;
};

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'mdscroll-e2e-'));
  tempDirs.push(dir);
  return dir;
};

const makeDoc = (name: string, markdown: string): { file: string; key: string } => {
  const file = join(makeTempDir(), name);
  writeFileSync(file, markdown);
  return { file, key: realpathSync(file) };
};

const startServer = async (port: number): Promise<Cli> => {
  const server = spawnCli(['serve', '--port', String(port)]);
  await server.waitFor('stdout', `mdscroll running at http://${HOST}:${port}`);
  return server;
};

const startSquatter = async (port: number): Promise<void> => {
  const squatter = createHttpServer((_req, res) => {
    res.statusCode = 200;
    res.end('hi');
  });
  await new Promise<void>((resolve, reject) => {
    squatter.once('error', reject);
    squatter.listen(port, HOST, () => resolve());
  });
  squatters.push(squatter);
};

const lastJsonLine = <T>(text: string): T => {
  const line = text
    .split('\n')
    .filter((candidate) => candidate.trim().length > 0)
    .at(-1);
  if (line === undefined) throw new Error(`expected a JSON line, got: ${JSON.stringify(text)}`);
  return JSON.parse(line) as T;
};

type PushJson = { url: string; key: string; replaced: boolean };
type ServeJson = { url: string; pid: number | null; existing: boolean };
type RmJson = { key: string | null; removed: boolean };
type LsJson = {
  docs: Array<{
    key: string;
    label: string;
    kind: string;
    watched: boolean;
    stale: boolean;
    updatedAt: number;
  }>;
};

describe('e2e: built CLI', () => {
  beforeAll(() => {
    if (!existsSync(CLI)) {
      throw new Error(
        `Built CLI not found at ${CLI}. Run 'pnpm -F mdscroll build' before the e2e suite.`,
      );
    }
  });

  afterEach(async () => {
    while (sseStreams.length > 0) sseStreams.pop()?.close();
    while (kids.length > 0) {
      const kid = kids.pop();
      if (kid && kid.exitCode === null) {
        kid.kill('SIGKILL');
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 5_000);
          kid.once('exit', () => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
    }
    while (squatters.length > 0) {
      const squatter = squatters.pop();
      if (squatter) await new Promise<void>((resolve) => squatter.close(() => resolve()));
    }
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    for (const kid of kids) if (kid.exitCode === null) kid.kill('SIGKILL');
  });

  describe('doc lifecycle against a running server', () => {
    it('serve accepts a push, ls shows the doc, rm removes it, ls is empty again', async () => {
      const port = await getFreePort();
      const { file, key } = makeDoc('doc.md', '# Round Trip\n\nbody\n');
      await startServer(port);

      const push = spawnCli(['push', file, '--port', String(port), '--json']);
      expect(await push.waitForExit()).toBe(0);
      expect(lastJsonLine<PushJson>(push.stdout())).toEqual({
        url: `http://${HOST}:${port}/#${encodeURIComponent(key)}`,
        key,
        replaced: false,
      });

      const ls = spawnCli(['ls', '--port', String(port), '--json']);
      expect(await ls.waitForExit()).toBe(0);
      const listed = lastJsonLine<LsJson>(ls.stdout());
      expect(listed.docs.map((doc) => doc.key)).toEqual([key]);
      expect(listed.docs[0]).toMatchObject({ kind: 'file', watched: true, stale: false });

      const rm = spawnCli(['rm', file, '--port', String(port), '--json']);
      expect(await rm.waitForExit()).toBe(0);
      expect(lastJsonLine<RmJson>(rm.stdout())).toEqual({ key, removed: true });

      const lsAfter = spawnCli(['ls', '--port', String(port), '--json']);
      expect(await lsAfter.waitForExit()).toBe(0);
      expect(lastJsonLine<LsJson>(lsAfter.stdout())).toEqual({ docs: [] });
    });
  });

  describe('push without a server', () => {
    it('exits 2 quickly with the serve hint', async () => {
      const port = await getFreePort();
      const { file } = makeDoc('doc.md', '# Orphan\n');

      const started = Date.now();
      const push = spawnCli(['push', file, '--port', String(port), '--json']);
      expect(await push.waitForExit(5_000)).toBe(2);

      expect(Date.now() - started).toBeLessThan(2_000);
      expect(push.stderr()).toContain(`no server running on port ${port}`);
      expect(push.stderr()).toContain('mdscroll serve');
      expect(push.stdout()).toBe('');
    });
  });

  describe('default command auto-serve', () => {
    it('becomes the server, prints the doc URL, and a later push of the same file replaces', async () => {
      const port = await getFreePort();
      const { file, key } = makeDoc('doc.md', '# Default\n\nbody\n');
      const url = `http://${HOST}:${port}/#${encodeURIComponent(key)}`;

      const server = spawnCli([file, '--port', String(port)]);
      await server.waitFor('stdout', url, 15_000);
      expect(server.stderr()).toContain(`serving at http://${HOST}:${port}`);

      const health = (await fetch(`http://${HOST}:${port}/_/health`).then((res) => res.json())) as {
        agent: string;
        pid: number;
      };
      expect(health.agent).toBe('mdscroll');
      expect(health.pid).toBe(server.child.pid);

      const push = spawnCli(['push', file, '--port', String(port), '--json']);
      expect(await push.waitForExit()).toBe(0);
      expect(lastJsonLine<PushJson>(push.stdout())).toEqual({ url, key, replaced: true });
      expect(server.child.exitCode).toBeNull();
    });
  });

  describe('live reload through the server', () => {
    it('a file edit reaches an open SSE consumer as an updated event within ~2s', async () => {
      const port = await getFreePort();
      const { file } = makeDoc('doc.md', '# Live\n\nfirst revision\n');
      await startServer(port);

      const push = spawnCli(['push', file, '--port', String(port), '--json']);
      expect(await push.waitForExit()).toBe(0);

      const sse = await subscribeSSE(port);
      await sse.waitFor('event: init');
      expect(sse.buffer()).toContain('first revision');

      writeFileSync(file, '# Live\n\nsecond revision\n');
      await sse.waitFor('second revision', 2_000);
      expect(sse.buffer()).toContain('event: updated');
    });
  });

  describe('server shutdown', () => {
    it('SIGINT with an open SSE consumer exits promptly with code 0', async () => {
      const port = await getFreePort();
      const server = await startServer(port);
      const sse = await subscribeSSE(port);
      await sse.waitFor('event: init');

      const started = Date.now();
      server.child.kill('SIGINT');
      const code = await server.waitForExit(1_500);

      expect(code).toBe(0);
      expect(Date.now() - started).toBeLessThan(1_500);
    });
  });

  describe('a non-mdscroll squatter on the port', () => {
    const expectSquatterError = async (makeArgs: (file: string) => string[]): Promise<void> => {
      const port = await getFreePort();
      await startSquatter(port);
      const { file } = makeDoc('doc.md', '# Squat\n');

      const cli = spawnCli([...makeArgs(file), '--port', String(port)]);
      expect(await cli.waitForExit()).toBe(1);

      expect(cli.stderr()).toContain(`port ${port} is held by a non-mdscroll process`);
      expect(cli.stdout()).not.toContain('http://');
    };

    it('ls exits 1 with the squatter message', async () => {
      await expectSquatterError(() => ['ls']);
    });

    it('push exits 1 with the squatter message (not 2 — serve would not fix it)', async () => {
      await expectSquatterError((file) => ['push', file]);
    });

    it('serve exits 1 with the squatter message instead of falling back', async () => {
      await expectSquatterError(() => ['serve']);
    });

    it('the default command exits 1 with the squatter message instead of falling back', async () => {
      await expectSquatterError((file) => [file]);
    });
  });

  describe('serve idempotence', () => {
    it('a second serve against a running server exits 0 and reports the existing URL', async () => {
      const port = await getFreePort();
      const first = await startServer(port);

      const second = spawnCli(['serve', '--port', String(port), '--json']);
      expect(await second.waitForExit()).toBe(0);

      expect(lastJsonLine<ServeJson>(second.stdout())).toEqual({
        url: `http://${HOST}:${port}`,
        pid: first.child.pid,
        existing: true,
      });
      expect(first.child.exitCode).toBeNull();
    });
  });

  describe('stdin push', () => {
    it('pipes create a named doc and re-piping the same name replaces it', async () => {
      const port = await getFreePort();
      await startServer(port);
      const url = `http://${HOST}:${port}/#x`;

      const first = spawnCli(['push', '--name', 'x', '--port', String(port), '--json'], {
        stdin: '# T\n',
      });
      expect(await first.waitForExit()).toBe(0);
      expect(lastJsonLine<PushJson>(first.stdout())).toEqual({ url, key: 'x', replaced: false });

      const second = spawnCli(['push', '--name', 'x', '--port', String(port), '--json'], {
        stdin: '# T\n\nsecond pipe\n',
      });
      expect(await second.waitForExit()).toBe(0);
      expect(lastJsonLine<PushJson>(second.stdout())).toEqual({ url, key: 'x', replaced: true });

      const ls = spawnCli(['ls', '--port', String(port), '--json']);
      expect(await ls.waitForExit()).toBe(0);
      const listed = lastJsonLine<LsJson>(ls.stdout());
      expect(listed.docs.map((doc) => doc.key)).toEqual(['x']);
      expect(listed.docs[0]).toMatchObject({ kind: 'static', watched: false });
    });
  });
});
