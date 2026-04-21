import type { Store } from './store/state.js';

const DEFAULT_INTERVAL_MS = 5000;

export type LivenessHandle = { stop: () => void };

/**
 * `process.kill(pid, 0)` throws ESRCH when `pid` no longer names a
 * running process. We use it solely to check liveness — signal 0 delivers
 * no signal and is the standard way to probe a pid's existence on POSIX.
 * On Windows, Node translates this into a handle open attempt that fails
 * with the same ESRCH shape, so the same check works cross-platform.
 *
 * Only ESRCH is treated as "dead". EPERM (exists but we can't signal it)
 * and any other errno mean "cannot prove dead" — we bias towards keeping
 * the doc so we never GC a live process.
 */
const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException | undefined)?.code !== 'ESRCH';
  }
};

/**
 * Periodically scan the store for docs whose `ownerPid` process has
 * exited and remove them. This cleans up when a push client crashes
 * without a chance to DELETE its doc.
 */
export const attachLiveness = (
  store: Store,
  opts: {
    intervalMs?: number;
    selfPid?: number;
    isAlive?: (pid: number) => boolean;
  } = {},
): LivenessHandle => {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const selfPid = opts.selfPid ?? process.pid;
  const check = opts.isAlive ?? isAlive;
  const timer = setInterval(() => {
    for (const doc of store.list()) {
      const owner = doc.ownerPid;
      if (owner === undefined) continue;
      if (owner === selfPid) continue;
      // Defensive: only pass well-formed pids to isAlive. A bad pid here
      // would mean the server admitted a malformed POST body, but double-
      // guarding keeps isAlive honest.
      if (!Number.isSafeInteger(owner) || owner <= 0) continue;
      if (!check(owner)) store.remove(doc.id);
    }
  }, intervalMs);
  // Don't keep the event loop alive just to GC zombies.
  if (typeof timer.unref === 'function') timer.unref();
  return { stop: () => clearInterval(timer) };
};
