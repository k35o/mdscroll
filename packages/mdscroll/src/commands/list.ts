import { listLocks } from '../store/lockfile.js';

export type ListOptions = {
  dir?: string | undefined;
};

const formatRelative = (ms: number): string => {
  const delta = Math.max(0, Date.now() - ms);
  const sec = Math.floor(delta / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
};

export const runList = async (opts: ListOptions = {}): Promise<void> => {
  const locks = await listLocks(opts.dir);

  if (locks.length === 0) {
    process.stdout.write('mdscroll: no instances running\n');
    return;
  }

  const sorted = [...locks].sort((a, b) => a.name.localeCompare(b.name));
  const nameWidth = Math.max(4, ...sorted.map((l) => l.name.length));

  process.stdout.write(`${'NAME'.padEnd(nameWidth)}  PID      URL                       STARTED\n`);
  for (const lock of sorted) {
    const url = `http://${lock.host}:${lock.port}`.padEnd(25);
    const pid = String(lock.pid).padEnd(7);
    const started = formatRelative(lock.startedAt);
    process.stdout.write(`${lock.name.padEnd(nameWidth)}  ${pid}  ${url} ${started}\n`);
  }
};
