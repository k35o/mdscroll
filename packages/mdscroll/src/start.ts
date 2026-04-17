import open from 'open';
import { readLock, removeLock, writeLock } from './lockfile.js';
import { warmup } from './render.js';
import { startServer } from './server.js';

export type StartOptions = {
  port: number;
  host: string;
  open: boolean;
};

export const runStart = async (opts: StartOptions): Promise<void> => {
  const existing = await readLock();
  if (existing) {
    const url = `http://${existing.host}:${existing.port}`;
    process.stdout.write(`mdscroll already running at ${url}\n`);
    if (opts.open) await open(url);
    return;
  }

  await warmup();

  const handle = await startServer({ port: opts.port, host: opts.host });

  await writeLock({
    pid: process.pid,
    port: opts.port,
    host: opts.host,
    startedAt: Date.now(),
  });

  process.stdout.write(`mdscroll running at ${handle.url}\n`);

  if (opts.open) await open(handle.url);

  const shutdown = async (): Promise<never> => {
    await removeLock();
    await handle.close().catch(() => undefined);
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
};
