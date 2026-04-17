import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_INSTANCE_NAME } from '../constants.js';
import { isValidInstanceName } from '../instance-name.js';

export { DEFAULT_INSTANCE_NAME };

const DEFAULT_LOCK_DIR = join(homedir(), '.mdscroll');
const LOCK_SUFFIX = '.lock';

export type Lock = {
  name: string;
  pid: number;
  port: number;
  host: string;
  startedAt: number;
  /**
   * Random token written when the server takes the lock and included in
   * `GET /identity` on that server. `stop` re-fetches the token before
   * sending SIGTERM; if it does not match, we refuse to kill because the
   * pid may have been recycled by the OS into an unrelated process.
   */
  identity: string;
};

const lockPath = (dir: string, name: string): string => join(dir, `${name}${LOCK_SUFFIX}`);

const isFiniteInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value);

const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

const validateLock = (value: unknown): Lock | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (!isValidInstanceName(candidate.name)) return null;
  if (!isFiniteInteger(candidate.pid) || candidate.pid <= 0) return null;
  if (!isFiniteInteger(candidate.port) || candidate.port <= 0 || candidate.port > 65535) {
    return null;
  }
  if (!isString(candidate.host)) return null;
  if (!isFiniteInteger(candidate.startedAt) || candidate.startedAt < 0) {
    return null;
  }
  if (!isString(candidate.identity)) return null;
  return {
    name: candidate.name,
    pid: candidate.pid,
    port: candidate.port,
    host: candidate.host,
    startedAt: candidate.startedAt,
    identity: candidate.identity,
  };
};

const isProcessAlive = (pid: number): boolean => {
  if (!isFiniteInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

export const newIdentity = (): string => randomUUID();

export const readLock = async (
  name: string = DEFAULT_INSTANCE_NAME,
  dir: string = DEFAULT_LOCK_DIR,
): Promise<Lock | null> => {
  if (!isValidInstanceName(name)) return null;
  const file = lockPath(dir, name);
  if (!existsSync(file)) return null;
  let parsed: unknown;
  try {
    const raw = await readFile(file, 'utf-8');
    parsed = JSON.parse(raw);
  } catch {
    await removeLock(name, dir);
    return null;
  }
  const lock = validateLock(parsed);
  if (!lock) {
    // Corrupt or malicious content — drop it rather than trust the PID.
    await removeLock(name, dir);
    return null;
  }
  if (!isProcessAlive(lock.pid)) {
    await removeLock(name, dir);
    return null;
  }
  return lock;
};

export const writeLock = async (lock: Lock, dir: string = DEFAULT_LOCK_DIR): Promise<void> => {
  const validated = validateLock(lock);
  if (!validated) {
    throw new Error('mdscroll: refusing to write an invalid lock');
  }
  await mkdir(dir, { recursive: true });
  await writeFile(lockPath(dir, validated.name), JSON.stringify(validated, null, 2));
};

export const writeLockExclusive = async (
  lock: Lock,
  dir: string = DEFAULT_LOCK_DIR,
): Promise<boolean> => {
  const validated = validateLock(lock);
  if (!validated) {
    throw new Error('mdscroll: refusing to write an invalid lock');
  }
  await mkdir(dir, { recursive: true });
  try {
    await writeFile(lockPath(dir, validated.name), JSON.stringify(validated, null, 2), {
      flag: 'wx',
    });
    return true;
  } catch (err) {
    if (isErrnoException(err) && err.code === 'EEXIST') return false;
    throw err;
  }
};

const isErrnoException = (value: unknown): value is NodeJS.ErrnoException =>
  value instanceof Error && 'code' in value;

export const removeLock = async (
  name: string = DEFAULT_INSTANCE_NAME,
  dir: string = DEFAULT_LOCK_DIR,
): Promise<void> => {
  if (!isValidInstanceName(name)) return;
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
