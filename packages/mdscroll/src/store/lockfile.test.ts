import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_INSTANCE_NAME,
  listLocks,
  newIdentity,
  readLock,
  removeLock,
  writeLock,
  writeLockExclusive,
} from './lockfile.js';

describe('lockfile', () => {
  let dir: string;

  const baseLock = (overrides: Partial<Parameters<typeof writeLock>[0]> = {}) => ({
    name: DEFAULT_INSTANCE_NAME,
    pid: process.pid,
    port: 1234,
    host: '127.0.0.1',
    startedAt: 1000,
    identity: 'test-identity',
    ...overrides,
  });

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mdscroll-lock-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe('readLock', () => {
    it('returns null when the file does not exist', async () => {
      const result = await readLock(DEFAULT_INSTANCE_NAME, dir);
      expect(result).toBeNull();
    });

    it('returns null when the JSON is malformed', async () => {
      await writeFile(join(dir, 'default.lock'), 'not-json');
      const result = await readLock(DEFAULT_INSTANCE_NAME, dir);
      expect(result).toBeNull();
    });

    it('returns the lock when the pid is alive', async () => {
      await writeLock(baseLock(), dir);
      const result = await readLock(DEFAULT_INSTANCE_NAME, dir);
      expect(result).toEqual(baseLock());
    });

    it('deletes the lock and returns null when the pid is dead', async () => {
      await writeLock(baseLock({ pid: 999999 }), dir);

      const first = await readLock(DEFAULT_INSTANCE_NAME, dir);
      expect(first).toBeNull();

      const second = await readLock(DEFAULT_INSTANCE_NAME, dir);
      expect(second).toBeNull();
    });

    it('reads instances by name independently', async () => {
      await writeLock(baseLock({ name: 'plan', port: 5001 }), dir);
      await writeLock(baseLock({ name: 'review', port: 5002 }), dir);

      const plan = await readLock('plan', dir);
      const review = await readLock('review', dir);

      expect(plan?.port).toBe(5001);
      expect(review?.port).toBe(5002);
    });
  });

  describe('writeLock', () => {
    it('creates the target directory if it does not exist', async () => {
      const nested = join(dir, 'new-sub');
      await writeLock(baseLock({ port: 1 }), nested);
      const result = await readLock(DEFAULT_INSTANCE_NAME, nested);
      expect(result?.port).toBe(1);
    });
  });

  describe('removeLock', () => {
    it('deletes an existing lock', async () => {
      await writeLock(baseLock({ port: 1 }), dir);
      await removeLock(DEFAULT_INSTANCE_NAME, dir);
      expect(await readLock(DEFAULT_INSTANCE_NAME, dir)).toBeNull();
    });

    it('does not throw when the file is already gone', async () => {
      await expect(removeLock(DEFAULT_INSTANCE_NAME, dir)).resolves.toBeUndefined();
    });

    it('only removes the named instance', async () => {
      await writeLock(baseLock({ name: 'plan', port: 1 }), dir);
      await writeLock(baseLock({ name: 'review', port: 2 }), dir);

      await removeLock('plan', dir);

      expect(await readLock('plan', dir)).toBeNull();
      expect(await readLock('review', dir)).not.toBeNull();
    });
  });

  describe('listLocks', () => {
    it('returns [] for a missing directory', async () => {
      const result = await listLocks(join(dir, 'does-not-exist'));
      expect(result).toEqual([]);
    });

    it('returns [] when no .lock files exist', async () => {
      const result = await listLocks(dir);
      expect(result).toEqual([]);
    });

    it('returns every alive instance', async () => {
      await writeLock(baseLock({ name: 'plan', port: 1 }), dir);
      await writeLock(baseLock({ name: 'review', port: 2 }), dir);

      const result = await listLocks(dir);
      const names = result.map((l) => l.name).sort();
      expect(names).toEqual(['plan', 'review']);
    });

    it('skips dead instances and cleans them up', async () => {
      await writeLock(baseLock({ name: 'alive', port: 1 }), dir);
      await writeLock(baseLock({ name: 'dead', port: 2, pid: 999999 }), dir);

      const result = await listLocks(dir);
      const names = result.map((l) => l.name);
      expect(names).toEqual(['alive']);
    });
  });

  describe('validation', () => {
    it('rejects a write with pid <= 0', async () => {
      await expect(writeLock(baseLock({ pid: 0 }), dir)).rejects.toThrow(/invalid lock/);
      await expect(writeLock(baseLock({ pid: -1 }), dir)).rejects.toThrow(/invalid lock/);
    });

    it('rejects a write with out-of-range port', async () => {
      await expect(writeLock(baseLock({ port: 0 }), dir)).rejects.toThrow(/invalid lock/);
      await expect(writeLock(baseLock({ port: 70000 }), dir)).rejects.toThrow(/invalid lock/);
    });

    it('drops a corrupt lockfile and returns null', async () => {
      await writeFile(join(dir, 'default.lock'), JSON.stringify({ pid: 0 }));
      const result = await readLock(DEFAULT_INSTANCE_NAME, dir);
      expect(result).toBeNull();
      // It was also cleared from disk
      expect(await readLock(DEFAULT_INSTANCE_NAME, dir)).toBeNull();
    });
  });

  describe('writeLockExclusive', () => {
    it('returns true when no lock exists', async () => {
      const ok = await writeLockExclusive(baseLock(), dir);
      expect(ok).toBe(true);
    });

    it('returns false when a lock already exists', async () => {
      await writeLock(baseLock(), dir);
      const ok = await writeLockExclusive(baseLock({ pid: 12345 }), dir);
      expect(ok).toBe(false);
    });
  });

  describe('newIdentity', () => {
    it('produces unique non-empty strings', () => {
      const a = newIdentity();
      const b = newIdentity();
      expect(a).toBeTypeOf('string');
      expect(a.length).toBeGreaterThan(0);
      expect(a).not.toBe(b);
    });
  });
});
