import { existsSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const LOCK_DIR = join(homedir(), '.mdscroll');
const LOCK_FILE = join(LOCK_DIR, 'server.lock');

export type Lock = {
  pid: number;
  port: number;
  host: string;
  startedAt: number;
};

const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

export const readLock = async (): Promise<Lock | null> => {
  if (!existsSync(LOCK_FILE)) return null;
  try {
    const raw = await readFile(LOCK_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Lock;
    if (!isProcessAlive(parsed.pid)) {
      await removeLock();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const writeLock = async (lock: Lock): Promise<void> => {
  await mkdir(LOCK_DIR, { recursive: true });
  await writeFile(LOCK_FILE, JSON.stringify(lock, null, 2));
};

export const removeLock = async (): Promise<void> => {
  try {
    await unlink(LOCK_FILE);
  } catch {
    // already gone
  }
};
