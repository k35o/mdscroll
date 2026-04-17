import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readLock, removeLock, writeLock } from './lockfile.js';

describe('lockfile', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mdscroll-lock-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe('readLock', () => {
    it('returns null when the file does not exist', async () => {
      const result = await readLock(dir);
      expect(result).toBeNull();
    });

    it('returns null when the JSON is malformed', async () => {
      await writeFile(join(dir, 'server.lock'), 'not-json');
      const result = await readLock(dir);
      expect(result).toBeNull();
    });

    it('returns the lock when the pid is alive', async () => {
      await writeLock(
        {
          pid: process.pid,
          port: 1234,
          host: '127.0.0.1',
          startedAt: 1000,
        },
        dir,
      );
      const result = await readLock(dir);
      expect(result).toEqual({
        pid: process.pid,
        port: 1234,
        host: '127.0.0.1',
        startedAt: 1000,
      });
    });

    it('deletes the lock and returns null when the pid is dead', async () => {
      const deadPid = 999999;
      await writeLock(
        {
          pid: deadPid,
          port: 1234,
          host: '127.0.0.1',
          startedAt: 1000,
        },
        dir,
      );

      const result = await readLock(dir);
      expect(result).toBeNull();

      const second = await readLock(dir);
      expect(second).toBeNull();
    });
  });

  describe('writeLock', () => {
    it('creates the target directory if it does not exist', async () => {
      const nested = join(dir, 'new-sub');
      await writeLock({ pid: process.pid, port: 1, host: 'h', startedAt: 0 }, nested);
      const result = await readLock(nested);
      expect(result?.port).toBe(1);
    });
  });

  describe('removeLock', () => {
    it('deletes an existing lock', async () => {
      await writeLock({ pid: process.pid, port: 1, host: 'h', startedAt: 0 }, dir);
      await removeLock(dir);
      expect(await readLock(dir)).toBeNull();
    });

    it('does not throw when the file is already gone', async () => {
      await expect(removeLock(dir)).resolves.toBeUndefined();
    });
  });
});
