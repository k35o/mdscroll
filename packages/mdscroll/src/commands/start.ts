import { readFile } from 'node:fs/promises';
import open from 'open';
import { resolvePort } from '../port.js';
import { startServer } from '../server/app.js';
import { warmup } from '../server/render.js';
import { DEFAULT_INSTANCE_NAME, readLock, removeLock, writeLock } from '../store/lockfile.js';

export type StartOptions = {
  name?: string | undefined;
  port: number;
  host: string;
  open: boolean;
  file?: string | undefined;
};

const pushToRunning = async (host: string, port: number, content: string): Promise<void> => {
  await fetch(`http://${host}:${port}/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: content,
  });
};

export const runStart = async (opts: StartOptions): Promise<void> => {
  const name = opts.name ?? DEFAULT_INSTANCE_NAME;
  const initial = opts.file ? await readFile(opts.file, 'utf-8') : null;

  const existing = await readLock(name);
  if (existing) {
    const url = `http://${existing.host}:${existing.port}`;
    process.stdout.write(`mdscroll[${name}] already running at ${url}\n`);
    if (initial !== null) {
      await pushToRunning(existing.host, existing.port, initial);
      process.stdout.write(`mdscroll[${name}]: pushed ${opts.file}\n`);
    }
    if (opts.open) await open(url);
    return;
  }

  await warmup();

  const port = await resolvePort(opts.port);
  const handle = await startServer({ port, host: opts.host });

  await writeLock({
    name,
    pid: process.pid,
    port,
    host: opts.host,
    startedAt: Date.now(),
  });

  if (initial !== null) handle.store.set(initial);

  process.stdout.write(`mdscroll[${name}] running at ${handle.url}\n`);

  if (opts.open) await open(handle.url);

  const shutdown = async (): Promise<never> => {
    await removeLock(name);
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
