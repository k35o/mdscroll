import { DEFAULT_INSTANCE_NAME, type Lock, readLock, removeLock } from '../store/lockfile.js';

export type StopOptions = {
  name?: string | undefined;
  dir?: string | undefined;
};

const verifyIdentity = async (lock: Lock): Promise<boolean> => {
  try {
    const response = await fetch(`http://${lock.host}:${lock.port}/identity`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { identity?: unknown };
    return typeof body.identity === 'string' && body.identity === lock.identity;
  } catch {
    return false;
  }
};

export const runStop = async (opts: StopOptions = {}): Promise<void> => {
  const name = opts.name ?? DEFAULT_INSTANCE_NAME;
  const lock = await readLock(name, opts.dir);
  if (!lock) {
    process.stdout.write(`mdscroll[${name}]: not running\n`);
    return;
  }

  if (!(await verifyIdentity(lock))) {
    process.stderr.write(
      `mdscroll[${name}]: refusing to SIGTERM pid ${lock.pid} — cannot confirm the process is still our server (pid may have been recycled). ` +
        `Inspect manually or remove the lockfile at ~/.mdscroll/${name}.lock and retry.\n`,
    );
    process.exitCode = 1;
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
