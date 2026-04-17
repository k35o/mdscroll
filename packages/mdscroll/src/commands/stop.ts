import { readLock, removeLock } from '../store/lockfile.js';

export type StopOptions = {
  dir?: string | undefined;
};

export const runStop = async (opts: StopOptions = {}): Promise<void> => {
  const lock = await readLock(opts.dir);
  if (!lock) {
    process.stdout.write('mdscroll: not running\n');
    return;
  }

  try {
    process.kill(lock.pid, 'SIGTERM');
    process.stdout.write(`mdscroll: stopped (pid ${lock.pid})\n`);
  } catch {
    await removeLock(opts.dir);
    process.stdout.write(`mdscroll: cleared stale lockfile (pid ${lock.pid})\n`);
  }
};
