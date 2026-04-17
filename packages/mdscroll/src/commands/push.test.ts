import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readLock, writeLock } from '../store/lockfile.js';
import { runPush, sourceFor, tryPost } from './push.js';

describe('sourceFor', () => {
  let originalCwd: string;
  let dir: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    dir = await mkdtemp(join(tmpdir(), 'mdscroll-source-'));
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    await rm(dir, { recursive: true, force: true });
  });

  it('returns "stdin" when no file is given', () => {
    expect(sourceFor(undefined)).toBe('stdin');
  });

  it('returns the basename when the file is in cwd', () => {
    expect(sourceFor('README.md')).toBe('README.md');
  });

  it('strips ./ prefix to a plain filename', () => {
    expect(sourceFor('./README.md')).toBe('README.md');
  });

  it('preserves a relative subdirectory path', () => {
    expect(sourceFor('./packages/mdscroll/README.md')).toBe(
      join('packages', 'mdscroll', 'README.md'),
    );
  });

  it('uses ../ for files above cwd', () => {
    const above = join(dir, '..', 'sibling.md');
    expect(sourceFor(above)).toBe(relative(dir, above));
  });

  it('absolute path inside cwd becomes relative', () => {
    const absolute = join(dir, 'inside', 'doc.md');
    expect(sourceFor(absolute)).toBe(join('inside', 'doc.md'));
  });
});

type FakeServer = {
  pid: number;
  port: number;
  close: () => void;
};

// Spawn a tiny HTTP child whose POST responses are scripted by the caller.
const spawnStubServer = async (status: number): Promise<FakeServer> => {
  const script = `
    const http = require('node:http');
    const server = http.createServer((req, res) => {
      if (req.method === 'POST') {
        res.writeHead(${status}, { 'Content-Type': 'text/plain' });
        res.end('rejected by stub');
        return;
      }
      res.writeHead(404); res.end();
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      process.stdout.write('PORT=' + port + '\\n');
    });
  `;
  const child: ChildProcess = spawn(process.execPath, ['-e', script], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const port = await new Promise<number>((resolveReady, rejectReady) => {
    child.stdout?.setEncoding('utf-8');
    const onData = (chunk: string) => {
      const match = chunk.match(/PORT=(\d+)/);
      if (match?.[1]) {
        child.stdout?.off('data', onData);
        resolveReady(Number(match[1]));
      }
    };
    child.stdout?.on('data', onData);
    child.once('error', rejectReady);
  });
  return {
    pid: child.pid as number,
    port,
    close: () => {
      try {
        child.kill('SIGTERM');
      } catch {
        // already gone
      }
    },
  };
};

describe('tryPost', () => {
  const fakes: FakeServer[] = [];
  afterEach(() => {
    for (const fake of fakes.splice(0)) fake.close();
  });

  it('returns { kind: "ok" } on 2xx', async () => {
    const script = `
      const http = require('node:http');
      http.createServer((req, res) => { res.writeHead(200); res.end(); })
        .listen(0, '127.0.0.1', function () {
          process.stdout.write('PORT=' + this.address().port + '\\n');
        });
    `;
    const child = spawn(process.execPath, ['-e', script], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const port = await new Promise<number>((resolveReady) => {
      child.stdout?.setEncoding('utf-8');
      child.stdout?.on('data', (chunk: string) => {
        const match = chunk.match(/PORT=(\d+)/);
        if (match?.[1]) resolveReady(Number(match[1]));
      });
    });
    fakes.push({
      pid: child.pid as number,
      port,
      close: () => {
        try {
          child.kill('SIGTERM');
        } catch {
          // already gone
        }
      },
    });

    const result = await tryPost(`http://127.0.0.1:${port}/push`, 'hi', 'test');
    expect(result.kind).toBe('ok');
  });

  it('returns { kind: "rejected", status } on 4xx/5xx', async () => {
    const fake = await spawnStubServer(413);
    fakes.push(fake);
    const result = await tryPost(`http://127.0.0.1:${fake.port}/push`, 'hi', 'test');
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') {
      expect(result.status).toBe(413);
      expect(result.detail).toContain('rejected by stub');
    }
  });

  it('returns { kind: "unreachable" } when the connection fails', async () => {
    // Port 1 is privileged; fetch will refuse.
    const result = await tryPost('http://127.0.0.1:1/push', 'hi', 'test');
    expect(result.kind).toBe('unreachable');
  });
});

describe('runPush lock behavior on rejection', () => {
  let dir: string;
  const fakes: FakeServer[] = [];

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mdscroll-push-'));
  });

  afterEach(async () => {
    for (const fake of fakes.splice(0)) fake.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('runPush leaves the lockfile in place when a live server responds with 413', async () => {
    const fake = await spawnStubServer(413);
    fakes.push(fake);

    await writeLock(
      {
        name: 'stubby',
        pid: fake.pid,
        port: fake.port,
        host: '127.0.0.1',
        startedAt: Date.now(),
        identity: 'stub-identity',
      },
      dir,
    );

    // Give runPush real content via a tempfile so stdin is irrelevant.
    const contentPath = join(dir, 'content.md');
    await writeFile(contentPath, '# rejected push');

    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const previousExit = process.exitCode;
    process.exitCode = 0;

    await runPush({
      name: 'stubby',
      file: contentPath,
      port: fake.port,
      host: '127.0.0.1',
      dir,
    });

    // runPush must have surfaced the rejection and set exit code 1.
    expect(process.exitCode).toBe(1);
    const stderrOutput = stderr.mock.calls.map((c) => String(c[0])).join('');
    expect(stderrOutput).toContain('rejected push with 413');

    process.exitCode = previousExit;
    stderr.mockRestore();

    // Core invariant: a rejected (live) response must NOT wipe the lock.
    expect(await readLock('stubby', dir)).not.toBeNull();
  });
});
