import { resolvePort } from '../port.js';
import { startServer } from '../server/app.js';
import { warmup } from '../server/render.js';
import {
  DEFAULT_INSTANCE_NAME,
  newIdentity,
  readLock,
  removeLock,
  writeLockExclusive,
} from '../store/lockfile.js';

export type StartOptions = {
  name?: string | undefined;
  port: number;
  host: string;
};

const PLACEHOLDER_PID_MAX = 2_147_483_647; // os pid ceiling

// Try to claim the lockfile atomically. If another live server already
// owns it, return null so the caller can fall back to "already running".
// If the file exists but the owner is dead or its contents are corrupt,
// readLock will have already removed it — we retry a small number of
// times to handle that race.
const claimLock = async (
  name: string,
  port: number,
  host: string,
  identity: string,
): Promise<'claimed' | 'already-running'> => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const claimed = await writeLockExclusive({
      name,
      pid: process.pid,
      port,
      host,
      startedAt: Date.now(),
      identity,
    });
    if (claimed) return 'claimed';

    // Someone else holds the file. If they are alive we yield; if not,
    // readLock will drop the stale entry and we loop.
    const existing = await readLock(name);
    if (existing) return 'already-running';
  }
  // Extremely unlikely: three straight EEXISTs with no live owner.
  return 'already-running';
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

  const identity = newIdentity();
  const port = await resolvePort(opts.port);

  // Reserve the lockfile BEFORE binding the port so two same-name
  // starts racing here can't both spawn a server. The PID we write
  // here is our own; the actual server hasn't bound yet, but stop
  // will verify via /identity once it's up.
  if (port > PLACEHOLDER_PID_MAX) {
    // sanity guard — should be unreachable
    throw new Error(`mdscroll: unexpected port ${port}`);
  }
  const claim = await claimLock(name, port, opts.host, identity);
  if (claim === 'already-running') {
    const existingNow = await readLock(name);
    if (existingNow) {
      const url = `http://${existingNow.host}:${existingNow.port}`;
      process.stdout.write(`mdscroll[${name}] already running at ${url}\n`);
    } else {
      process.stderr.write(`mdscroll[${name}]: another process is starting up; try again\n`);
      process.exitCode = 1;
    }
    return;
  }

  let handle: Awaited<ReturnType<typeof startServer>>;
  try {
    handle = await startServer({ port, host: opts.host, identity });
  } catch (err) {
    // Binding failed — release the lockfile so future attempts can proceed.
    await removeLock(name);
    throw err;
  }

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
