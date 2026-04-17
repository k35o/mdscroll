import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { DEFAULT_INSTANCE_NAME, readLock, removeLock } from '../store/lockfile.js';
import { postPush } from './http.js';
import { spawnDetachedServer, tailLog } from './spawn.js';

export const sourceFor = (file: string | undefined): string => {
  if (!file) return 'stdin';
  const rel = relative(process.cwd(), resolve(file));
  return rel === '' ? '.' : rel;
};

export type PushOptions = {
  name?: string | undefined;
  file?: string | undefined;
  port: number;
  host: string;
  /**
   * Override the lockfile directory. Intended for tests — production
   * always uses the default (~/.mdscroll).
   */
  dir?: string | undefined;
};

const readStdin = async (): Promise<string> => {
  if (process.stdin.isTTY) return '';
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
};

const browserUrl = (host: string, port: number): string => `http://${host}:${port}/`;
const pushEndpoint = (host: string, port: number): string => `http://${host}:${port}/push`;

// Poll the lockfile after spawning the server to learn the port it
// actually bound to. 30 × 150ms = ~4.5s, which covers Shiki warmup on
// a cold cache while staying well under a typical CLI timeout budget.
const POLL_ATTEMPTS = 30;
const POLL_INTERVAL_MS = 150;
const POLL_BUDGET_SECONDS = (POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000;

const formatRejection = (prefix: string, status: number, detail: string | undefined): string =>
  `${prefix} ${status}${detail ? `: ${detail}` : ''}\n`;

export const runPush = async (opts: PushOptions): Promise<void> => {
  const name = opts.name ?? DEFAULT_INSTANCE_NAME;
  const content = opts.file ? await readFile(opts.file, 'utf-8') : await readStdin();

  if (!content.trim()) {
    process.stderr.write('mdscroll: no content to push (stdin empty and no file given)\n');
    process.exitCode = 1;
    return;
  }

  const source = sourceFor(opts.file);

  const existing = await readLock(name, opts.dir);
  if (existing) {
    const result = await postPush(pushEndpoint(existing.host, existing.port), content, source);
    if (result.kind === 'ok') {
      process.stdout.write(
        `mdscroll[${name}]: pushed to ${browserUrl(existing.host, existing.port)}\n`,
      );
      return;
    }
    if (result.kind === 'rejected') {
      // Server answered with a 4xx/5xx — it is alive and intentionally
      // refusing this push. Keep the lock, surface the status, exit 1.
      process.stderr.write(
        formatRejection(
          `mdscroll[${name}]: server rejected push with`,
          result.status,
          result.detail,
        ),
      );
      process.exitCode = 1;
      return;
    }
    // unreachable — server is gone. Clean up and fall through to spawn.
    await removeLock(name, opts.dir);
  }

  const { logPath } = await spawnDetachedServer({
    name,
    port: opts.port,
    host: opts.host,
  });

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    await sleep(POLL_INTERVAL_MS);
    const lock = await readLock(name, opts.dir);
    if (!lock) continue;
    const result = await postPush(pushEndpoint(lock.host, lock.port), content, source);
    if (result.kind === 'ok') {
      process.stdout.write(
        `mdscroll[${name}]: started server and pushed to ${browserUrl(lock.host, lock.port)}\n`,
      );
      return;
    }
    if (result.kind === 'rejected') {
      process.stderr.write(
        formatRejection(
          `mdscroll[${name}]: spawned server rejected push with`,
          result.status,
          result.detail,
        ),
      );
      process.exitCode = 1;
      return;
    }
  }

  const tail = await tailLog(logPath);
  process.stderr.write(
    `mdscroll[${name}]: failed to reach the spawned server within ${POLL_BUDGET_SECONDS}s\n`,
  );
  if (tail) {
    process.stderr.write(
      `--- last lines of ${logPath} ---\n${tail}\n-----------------------------\n`,
    );
  } else {
    process.stderr.write(`See ${logPath} for spawn output.\n`);
  }
  process.exitCode = 1;
};
