import { DEFAULT_INSTANCE_NAME, readLock, removeLock } from '../store/lockfile.js';

export type StopOptions = {
  name?: string | undefined;
  dir?: string | undefined;
};

export const runStop = async (opts: StopOptions = {}): Promise<void> => {
  const name = opts.name ?? DEFAULT_INSTANCE_NAME;
  const lock = await readLock(name, opts.dir);
  if (!lock) {
    process.stdout.write(`mdscroll[${name}]: not running\n`);
    return;
  }

  try {
    process.kill(lock.pid, 'SIGTERM');
    process.stdout.write(`mdscroll[${name}]: stopped (pid ${lock.pid})\n`);
  } catch {
    await removeLock(name, opts.dir);
    process.stdout.write(`mdscroll[${name}]: cleared stale lockfile (pid ${lock.pid})\n`);
  }
};
