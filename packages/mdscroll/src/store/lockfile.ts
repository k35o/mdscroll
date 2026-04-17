import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_LOCK_DIR = join(homedir(), '.mdscroll');
const LOCK_SUFFIX = '.lock';

export const DEFAULT_INSTANCE_NAME = 'default';

export type Lock = {
  name: string;
  pid: number;
  port: number;
  host: string;
  startedAt: number;
};

const lockPath = (dir: string, name: string): string => join(dir, `${name}${LOCK_SUFFIX}`);

const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

export const readLock = async (
  name: string = DEFAULT_INSTANCE_NAME,
  dir: string = DEFAULT_LOCK_DIR,
): Promise<Lock | null> => {
  const file = lockPath(dir, name);
  if (!existsSync(file)) return null;
  try {
    const raw = await readFile(file, 'utf-8');
    const parsed = JSON.parse(raw) as Lock;
    if (!isProcessAlive(parsed.pid)) {
      await removeLock(name, dir);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const writeLock = async (lock: Lock, dir: string = DEFAULT_LOCK_DIR): Promise<void> => {
  await mkdir(dir, { recursive: true });
  await writeFile(lockPath(dir, lock.name), JSON.stringify(lock, null, 2));
};

export const removeLock = async (
  name: string = DEFAULT_INSTANCE_NAME,
  dir: string = DEFAULT_LOCK_DIR,
): Promise<void> => {
  try {
    await unlink(lockPath(dir, name));
  } catch {
    // already gone
  }
};

export const listLocks = async (dir: string = DEFAULT_LOCK_DIR): Promise<Lock[]> => {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  const names = entries
    .filter((e) => e.endsWith(LOCK_SUFFIX))
    .map((e) => e.slice(0, -LOCK_SUFFIX.length));
  const locks = await Promise.all(names.map((n) => readLock(n, dir)));
  return locks.filter((l): l is Lock => l !== null);
};
