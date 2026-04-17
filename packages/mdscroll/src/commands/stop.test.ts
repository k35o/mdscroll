import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_INSTANCE_NAME, readLock, writeLock } from '../store/lockfile.js';
import { runStop } from './stop.js';

type FakeServer = {
  pid: number;
  port: number;
  close: () => void;
};

const spawnFakeServer = async (identity: string): Promise<FakeServer> => {
  const script = `
    const http = require('node:http');
    const identity = ${JSON.stringify(identity)};
    const server = http.createServer((req, res) => {
      if (req.url === '/identity') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ identity }));
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

describe('runStop', () => {
  let dir: string;
  const fakes: FakeServer[] = [];

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mdscroll-stop-'));
  });

  afterEach(async () => {
    for (const fake of fakes.splice(0)) fake.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('reports "not running" when no lockfile exists', async () => {
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runStop({ dir });

    expect(out).toHaveBeenCalledWith(`mdscroll[${DEFAULT_INSTANCE_NAME}]: not running\n`);
    out.mockRestore();
  });

  it('clears a stale lockfile (dead pid) and reports not running', async () => {
    await writeLock(
      {
        name: DEFAULT_INSTANCE_NAME,
        pid: 999999,
        port: 1,
        host: '127.0.0.1',
        startedAt: 0,
        identity: 'test-identity',
      },
      dir,
    );

    await runStop({ dir });

    expect(await readLock(DEFAULT_INSTANCE_NAME, dir)).toBeNull();
  });

  it('refuses to SIGTERM when the server does not answer with the expected identity', async () => {
    const fake = await spawnFakeServer('different-identity');
    fakes.push(fake);

    await writeLock(
      {
        name: DEFAULT_INSTANCE_NAME,
        pid: fake.pid,
        port: fake.port,
        host: '127.0.0.1',
        startedAt: 0,
        identity: 'expected-identity',
      },
      dir,
    );

    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    process.exitCode = 0;
    await runStop({ dir });
    expect(err).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
    err.mockRestore();

    // Fake server still alive (we did not kill it).
    const stillAlive = (() => {
      try {
        process.kill(fake.pid, 0);
        return true;
      } catch {
        return false;
      }
    })();
    expect(stillAlive).toBe(true);
  });

  it('SIGTERMs the pid when identity matches', async () => {
    const fake = await spawnFakeServer('matching-identity');

    await writeLock(
      {
        name: DEFAULT_INSTANCE_NAME,
        pid: fake.pid,
        port: fake.port,
        host: '127.0.0.1',
        startedAt: 0,
        identity: 'matching-identity',
      },
      dir,
    );

    // We don't push to fakes[] — stop should kill the process itself.
    const exited = new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        try {
          process.kill(fake.pid, 0);
        } catch {
          clearInterval(interval);
          resolve();
        }
      }, 50);
    });

    await runStop({ dir });
    await exited;
  });

  it('targets the named instance only', async () => {
    const fake = await spawnFakeServer('plan-identity');

    await writeLock(
      {
        name: 'plan',
        pid: fake.pid,
        port: fake.port,
        host: '127.0.0.1',
        startedAt: 0,
        identity: 'plan-identity',
      },
      dir,
    );
    await writeLock(
      {
        name: 'review',
        pid: process.pid,
        port: 2,
        host: '127.0.0.1',
        startedAt: 0,
        identity: 'review-identity',
      },
      dir,
    );

    const exited = new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        try {
          process.kill(fake.pid, 0);
        } catch {
          clearInterval(interval);
          resolve();
        }
      }, 50);
    });

    await runStop({ name: 'plan', dir });
    await exited;

    expect(await readLock('review', dir)).not.toBeNull();
  });
});
