import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import getPort from 'get-port';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

/**
 * End-to-end suite: spawns the real built CLI as subprocesses and drives
 * them the way a user would. Covers the discovery + push + liveness flow
 * that unit tests only exercise piecemeal.
 *
 * Requires the package to be built (`pnpm -F mdscroll build`) and a host
 * shell: the tests bind localhost ports and fork child processes, which
 * fail under Claude Code's default sandbox (EPERM / EMFILE).
 */

const CLI = fileURLToPath(new URL('../dist/cli.mjs', import.meta.url));
const HOST = '127.0.0.1';

type Banner = 'running' | 'attached';

type CliChild = {
  process: ChildProcess;
  stdout: string[];
  stderr: string[];
  waitForBanner: (kind: Banner, timeoutMs?: number) => Promise<void>;
  exit: () => Promise<number | null>;
};

type SseStream = {
  /** Everything received so far, concatenated. */
  buffer: () => string;
  /** Resolve when `needle` appears in the buffer; reject on timeout. */
  waitFor: (needle: string, timeoutMs?: number) => Promise<void>;
  close: () => void;
};

const spawnCli = (args: string[], stdin?: string): CliChild => {
  const child = spawn(process.execPath, [CLI, ...args], {
    stdio: [stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
  });
  if (stdin !== undefined) {
    child.stdin?.end(stdin);
  }
  const stdout: string[] = [];
  const stderr: string[] = [];
  const waiters: Array<{ kind: Banner; resolve: () => void; reject: (e: Error) => void }> = [];
  const notify = (line: string) => {
    for (let i = waiters.length - 1; i >= 0; i--) {
      const w = waiters[i];
      if (!w) continue;
      if (
        (w.kind === 'running' && /mdscroll running at http:\/\//.test(line)) ||
        (w.kind === 'attached' && /mdscroll attached to http:\/\//.test(line))
      ) {
        waiters.splice(i, 1);
        w.resolve();
      }
    }
  };
  child.stdout?.setEncoding('utf-8');
  child.stderr?.setEncoding('utf-8');
  child.stdout?.on('data', (chunk: string) => {
    stdout.push(chunk);
    for (const line of chunk.split('\n')) notify(line);
  });
  child.stderr?.on('data', (chunk: string) => {
    stderr.push(chunk);
  });
  return {
    process: child,
    stdout,
    stderr,
    waitForBanner: (kind, timeoutMs = 10_000) =>
      new Promise((resolve, reject) => {
        const existing = stdout.join('');
        if (
          (kind === 'running' && /mdscroll running at http:\/\//.test(existing)) ||
          (kind === 'attached' && /mdscroll attached to http:\/\//.test(existing))
        ) {
          resolve();
          return;
        }
        const w = { kind, resolve, reject };
        waiters.push(w);
        setTimeout(() => {
          const i = waiters.indexOf(w);
          if (i >= 0) {
            waiters.splice(i, 1);
            reject(
              new Error(
                `CLI did not print '${kind}' banner within ${timeoutMs}ms. stdout so far: ${stdout.join('')}`,
              ),
            );
          }
        }, timeoutMs);
      }),
    exit: () =>
      new Promise<number | null>((resolve) => {
        if (child.exitCode !== null) {
          resolve(child.exitCode);
          return;
        }
        child.once('exit', (code) => resolve(code));
      }),
  };
};

const subscribeSSE = async (port: number): Promise<SseStream> => {
  const controller = new AbortController();
  const res = await fetch(`http://${HOST}:${port}/events`, {
    signal: controller.signal,
  });
  const reader = res.body?.getReader();
  if (!reader) throw new Error('no SSE body');
  const decoder = new TextDecoder();
  let buf = '';
  const waiters: Array<{
    needle: string;
    resolve: () => void;
    reject: (e: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];

  void (async () => {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        for (let i = waiters.length - 1; i >= 0; i--) {
          const w = waiters[i];
          if (w && buf.includes(w.needle)) {
            clearTimeout(w.timer);
            waiters.splice(i, 1);
            w.resolve();
          }
        }
      }
    } catch {
      // stream aborted — expected on close()
    }
  })();

  return {
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
              `did not observe '${needle}' in SSE within ${timeoutMs}ms. buffer: ${buf.slice(-500)}`,
            ),
          );
        }, timeoutMs);
        waiters.push({ needle, resolve, reject, timer });
      }),
    close: () => controller.abort(),
  };
};

const waitForExit = (child: ChildProcess, timeoutMs = 5_000): Promise<number | null> =>
  new Promise((resolve, reject) => {
    if (child.exitCode !== null) {
      resolve(child.exitCode);
      return;
    }
    const timer = setTimeout(
      () => reject(new Error(`process ${child.pid} did not exit within ${timeoutMs}ms`)),
      timeoutMs,
    );
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });

type Workspace = {
  dir: string;
  files: { a: string; b: string; c: string };
};

const makeWorkspace = (): Workspace => {
  const dir = mkdtempSync(join(tmpdir(), 'mdscroll-e2e-'));
  const files = {
    a: join(dir, 'a.md'),
    b: join(dir, 'b.md'),
    c: join(dir, 'c.md'),
  };
  writeFileSync(files.a, '# Alpha\n\nInitial alpha.\n');
  writeFileSync(files.b, '# Bravo\n\nInitial bravo.\n');
  writeFileSync(files.c, '# Charlie\n\nInitial charlie.\n');
  return { dir, files };
};

describe('E2E: mdscroll CLI (push + tabs)', () => {
  beforeAll(() => {
    if (!existsSync(CLI)) {
      throw new Error(
        `Built CLI not found at ${CLI}. Run 'pnpm -F mdscroll build' before the e2e suite.`,
      );
    }
  });

  // Tracks children spawned inside a test so afterEach can reap them.
  const kids: ChildProcess[] = [];
  let workspace: Workspace | null = null;
  const squatters: Server[] = [];

  afterEach(async () => {
    while (kids.length > 0) {
      const kid = kids.pop();
      if (kid && kid.exitCode === null) {
        kid.kill('SIGKILL');
        await waitForExit(kid).catch(() => undefined);
      }
    }
    while (squatters.length > 0) {
      const s = squatters.pop();
      if (s) await new Promise<void>((resolve) => s.close(() => resolve()));
    }
    if (workspace) {
      rmSync(workspace.dir, { recursive: true, force: true });
      workspace = null;
    }
  });

  afterAll(() => {
    // Belt-and-suspenders cleanup if any test left processes behind.
    for (const kid of kids) if (kid.exitCode === null) kid.kill('SIGKILL');
  });

  it('first invocation serves, second and third attach, /_/health identifies, SSE carries all docs', async () => {
    const port = await getPort();
    workspace = makeWorkspace();

    const server = spawnCli(['--port', String(port), workspace.files.a]);
    kids.push(server.process);
    await server.waitForBanner('running');

    const clientB = spawnCli(['--port', String(port), workspace.files.b]);
    kids.push(clientB.process);
    await clientB.waitForBanner('attached');

    const clientC = spawnCli(['--port', String(port), workspace.files.c]);
    kids.push(clientC.process);
    await clientC.waitForBanner('attached');

    const health = (await fetch(`http://${HOST}:${port}/_/health`).then((r) => r.json())) as {
      agent: string;
      version: string;
      pid: number;
    };
    expect(health.agent).toBe('mdscroll');
    expect(typeof health.version).toBe('string');
    expect(health.pid).toBe(server.process.pid);

    const sse = await subscribeSSE(port);
    try {
      await sse.waitFor('event: init');
      const init = sse.buffer();
      expect(init).toMatch(/<h1>Alpha<\/h1>/);
      expect(init).toMatch(/<h1>Bravo<\/h1>/);
      expect(init).toMatch(/<h1>Charlie<\/h1>/);
    } finally {
      sse.close();
    }
  }, 20_000);

  it('a file edit in server mode produces an SSE updated event', async () => {
    const port = await getPort();
    workspace = makeWorkspace();

    const server = spawnCli(['--port', String(port), workspace.files.a]);
    kids.push(server.process);
    await server.waitForBanner('running');

    const sse = await subscribeSSE(port);
    try {
      await sse.waitFor('event: init');
      writeFileSync(workspace.files.a, '# Alpha\n\nEdited alpha body.\n');
      await sse.waitFor('event: updated');
      await sse.waitFor('Edited alpha body');
    } finally {
      sse.close();
    }
  }, 15_000);

  it('a file edit in client mode reaches the server and is broadcast over SSE', async () => {
    const port = await getPort();
    workspace = makeWorkspace();

    const server = spawnCli(['--port', String(port), workspace.files.a]);
    kids.push(server.process);
    await server.waitForBanner('running');

    const client = spawnCli(['--port', String(port), workspace.files.b]);
    kids.push(client.process);
    await client.waitForBanner('attached');

    const sse = await subscribeSSE(port);
    try {
      await sse.waitFor('event: init');
      writeFileSync(workspace.files.b, '# Bravo\n\nClient-side edit.\n');
      await sse.waitFor('Client-side edit');
    } finally {
      sse.close();
    }
  }, 15_000);

  it('stdin attached as a client stays alive until SIGINT', async () => {
    const port = await getPort();
    workspace = makeWorkspace();

    const server = spawnCli(['--port', String(port), workspace.files.a]);
    kids.push(server.process);
    await server.waitForBanner('running');

    const client = spawnCli(['--port', String(port)], '# Piped Doc\n\nFrom stdin.\n');
    kids.push(client.process);
    await client.waitForBanner('attached');

    // Give the client a generous moment to exit prematurely if it's
    // going to — the bug this guards against was "process dies right
    // after POST because nothing keeps the event loop alive".
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(client.process.exitCode).toBeNull();

    // Doc survives in the store, i.e. was not GC'd because the owner
    // is still alive.
    const sse = await subscribeSSE(port);
    try {
      await sse.waitFor('event: init');
      expect(sse.buffer()).toMatch(/<h1>Piped Doc<\/h1>/);
      // Now Ctrl+C should cleanly remove it.
      client.process.kill('SIGINT');
      await waitForExit(client.process);
      await sse.waitFor('event: removed');
    } finally {
      sse.close();
    }
  }, 15_000);

  it('client re-registers its doc after the server restarts (DocMissingError path)', async () => {
    const port = await getPort();
    workspace = makeWorkspace();

    // First server + client to establish the attach.
    let server = spawnCli(['--port', String(port), workspace.files.a]);
    kids.push(server.process);
    await server.waitForBanner('running');

    const client = spawnCli(['--port', String(port), workspace.files.b]);
    kids.push(client.process);
    await client.waitForBanner('attached');

    // Kill the server; client survives and stays in foreground.
    server.process.kill('SIGINT');
    await waitForExit(server.process);

    // Bring a fresh server up on the same port — with --port explicit
    // so we fail loudly if the OS keeps the port in TIME_WAIT (and not
    // rebind on a random fallback, which would make the client
    // unreachable from the test's SSE subscription below).
    server = spawnCli(['--port', String(port), workspace.files.a]);
    kids.push(server.process);
    await server.waitForBanner('running');
    expect(server.stdout.join('')).toContain(`http://127.0.0.1:${port}`);

    // Subscribe first so we don't miss the added/updated events that
    // fire as soon as the client's next PUT hits 404 → re-POST.
    const sse = await subscribeSSE(port);
    try {
      await sse.waitFor('event: init');
      // Edit the client's file. The client's PUT hits the new (empty)
      // server, gets 404, re-POSTs with the edited body. We should see
      // an added event carrying "After restart".
      writeFileSync(workspace.files.b, '# Bravo\n\nAfter restart.\n');
      await sse.waitFor('After restart', 12_000);
    } finally {
      sse.close();
    }
  }, 30_000);

  it('SIGINT on a client DELETEs its doc (SSE removed event)', async () => {
    const port = await getPort();
    workspace = makeWorkspace();

    const server = spawnCli(['--port', String(port), workspace.files.a]);
    kids.push(server.process);
    await server.waitForBanner('running');

    const client = spawnCli(['--port', String(port), workspace.files.b]);
    kids.push(client.process);
    await client.waitForBanner('attached');

    const sse = await subscribeSSE(port);
    try {
      await sse.waitFor('event: init');
      client.process.kill('SIGINT');
      await waitForExit(client.process);
      await sse.waitFor('event: removed');
    } finally {
      sse.close();
    }
  }, 15_000);

  it('hard-killing a client (SIGKILL) triggers liveness GC within ~6s', async () => {
    const port = await getPort();
    workspace = makeWorkspace();

    const server = spawnCli(['--port', String(port), workspace.files.a]);
    kids.push(server.process);
    await server.waitForBanner('running');

    const client = spawnCli(['--port', String(port), workspace.files.b]);
    kids.push(client.process);
    await client.waitForBanner('attached');

    const sse = await subscribeSSE(port);
    try {
      await sse.waitFor('event: init');
      client.process.kill('SIGKILL');
      await waitForExit(client.process);
      // Default liveness interval is 5000ms; allow 8s of slack.
      await sse.waitFor('event: removed', 10_000);
    } finally {
      sse.close();
    }
  }, 20_000);

  it('explicit --port + non-mdscroll squatter is a hard error (no silent fallback)', async () => {
    const squattedPort = await getPort();
    workspace = makeWorkspace();

    const squatter = createServer((_req, res) => {
      res.statusCode = 200;
      res.end('hi');
    });
    await new Promise<void>((resolve, reject) => {
      squatter.once('listening', resolve);
      squatter.once('error', reject);
      squatter.listen(squattedPort, HOST);
    });
    squatters.push(squatter);

    const mdscroll = spawnCli(['--port', String(squattedPort), workspace.files.a]);
    kids.push(mdscroll.process);
    const exitCode = await waitForExit(mdscroll.process, 10_000);
    expect(exitCode).toBe(1);
    const stderr = mdscroll.stderr.join('');
    expect(stderr).toMatch(new RegExp(`port ${squattedPort}`));
    expect(stderr).toMatch(/non-mdscroll/);
    // And nothing claimed to be running.
    expect(mdscroll.stdout.join('')).not.toMatch(/mdscroll running at/);
  }, 15_000);

  it('SIGINT on the server shuts it down cleanly', async () => {
    const port = await getPort();
    workspace = makeWorkspace();

    const server = spawnCli(['--port', String(port), workspace.files.a]);
    kids.push(server.process);
    await server.waitForBanner('running');

    server.process.kill('SIGINT');
    await waitForExit(server.process);

    const probe = await fetch(`http://${HOST}:${port}/_/health`, {
      signal: AbortSignal.timeout(1_000),
    }).catch((err: Error) => err);
    expect(probe).toBeInstanceOf(Error);
  }, 15_000);
});
