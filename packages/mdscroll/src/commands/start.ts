import { resolvePort } from '../port.js';
import { startServer } from '../server/app.js';
import { warmup } from '../server/render.js';
import { DEFAULT_INSTANCE_NAME, readLock, removeLock, writeLock } from '../store/lockfile.js';

export type StartOptions = {
  name?: string | undefined;
  port: number;
  host: string;
};

export const runStart = async (opts: StartOptions): Promise<void> => {
  const name = opts.name ?? DEFAULT_INSTANCE_NAME;

  const existing = await readLock(name);
  if (existing) {
    const url = `http://${existing.host}:${existing.port}`;
    process.stdout.write(`mdscroll[${name}] already running at ${url}\n`);
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

  process.stdout.write(`mdscroll[${name}] running at ${handle.url}\n`);

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
