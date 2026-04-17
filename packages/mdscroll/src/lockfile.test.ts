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
    it('ファイルが存在しない場合は null を返す', async () => {
      const result = await readLock(dir);
      expect(result).toBeNull();
    });

    it('JSON が壊れている場合は null を返す', async () => {
      await writeFile(join(dir, 'server.lock'), 'not-json');
      const result = await readLock(dir);
      expect(result).toBeNull();
    });

    it('生存中のプロセスの lock を返す', async () => {
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

    it('死んでいるプロセスの lock は削除して null を返す', async () => {
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
    it('ディレクトリが無くても作成して書き込む', async () => {
      const nested = join(dir, 'new-sub');
      await writeLock({ pid: process.pid, port: 1, host: 'h', startedAt: 0 }, nested);
      const result = await readLock(nested);
      expect(result?.port).toBe(1);
    });
  });

  describe('removeLock', () => {
    it('存在する lock を削除する', async () => {
      await writeLock({ pid: process.pid, port: 1, host: 'h', startedAt: 0 }, dir);
      await removeLock(dir);
      expect(await readLock(dir)).toBeNull();
    });

    it('ファイルが無くてもエラーにならない', async () => {
      await expect(removeLock(dir)).resolves.toBeUndefined();
    });
  });
});
