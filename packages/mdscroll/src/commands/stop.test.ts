import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readLock, writeLock } from '../store/lockfile.js';
import { runStop } from './stop.js';

describe('runStop', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mdscroll-stop-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reports "not running" when no lockfile exists', async () => {
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runStop({ dir });

    expect(out).toHaveBeenCalledWith('mdscroll: not running\n');
    out.mockRestore();
  });

  it('clears a stale lockfile (dead pid) and reports not running', async () => {
    await writeLock({ pid: 999999, port: 1, host: '127.0.0.1', startedAt: 0 }, dir);

    await runStop({ dir });

    // readLock auto-cleared the stale lock; runStop saw null and reported "not running"
    expect(await readLock(dir)).toBeNull();
  });

  it('sends SIGTERM to the live pid in the lockfile', async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
    expect(child.pid).toBeDefined();

    await writeLock(
      {
        pid: child.pid as number,
        port: 1,
        host: '127.0.0.1',
        startedAt: 0,
      },
      dir,
    );

    const exited = new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
    });

    await runStop({ dir });
    await exited;

    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
  });
});
