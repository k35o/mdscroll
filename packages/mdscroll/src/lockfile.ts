import { existsSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_LOCK_DIR = join(homedir(), '.mdscroll');
const LOCK_FILE_NAME = 'server.lock';

export type Lock = {
  pid: number;
  port: number;
  host: string;
  startedAt: number;
};

const lockPath = (dir: string): string => join(dir, LOCK_FILE_NAME);

const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

export const readLock = async (dir: string = DEFAULT_LOCK_DIR): Promise<Lock | null> => {
  const file = lockPath(dir);
  if (!existsSync(file)) return null;
  try {
    const raw = await readFile(file, 'utf-8');
    const parsed = JSON.parse(raw) as Lock;
    if (!isProcessAlive(parsed.pid)) {
      await removeLock(dir);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const writeLock = async (lock: Lock, dir: string = DEFAULT_LOCK_DIR): Promise<void> => {
  await mkdir(dir, { recursive: true });
  await writeFile(lockPath(dir), JSON.stringify(lock, null, 2));
};

export const removeLock = async (dir: string = DEFAULT_LOCK_DIR): Promise<void> => {
  try {
    await unlink(lockPath(dir));
  } catch {
    // already gone
  }
};
