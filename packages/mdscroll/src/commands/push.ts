import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { DEFAULT_INSTANCE_NAME, readLock, removeLock } from '../store/lockfile.js';

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

const spawnLogPath = (name: string): string => join(homedir(), '.mdscroll', `${name}.log`);

export type PostResult =
  | { kind: 'ok' }
  | { kind: 'rejected'; status: number; detail?: string }
  | { kind: 'unreachable' };

export const tryPost = async (url: string, body: string, source: string): Promise<PostResult> => {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Mdscroll-Source': source,
      },
      body,
    });
  } catch {
    // Connection refused, DNS failure, socket reset — the server is
    // not answering at all, so it is reasonable to treat this as a
    // stale lock.
    return { kind: 'unreachable' };
  }
  if (response.ok) return { kind: 'ok' };
  // The server was reached and returned an error. The instance is
  // alive and should NOT be treated as stale — leave its lock in
  // place. Try to surface a body snippet for diagnostics.
  let detail: string | undefined;
  try {
    detail = (await response.text()).slice(0, 200);
  } catch {
    detail = undefined;
  }
  return { kind: 'rejected', status: response.status, detail };
};

const spawnServer = async (name: string, port: number, host: string): Promise<string> => {
  const logPath = spawnLogPath(name);
  await mkdir(join(logPath, '..'), { recursive: true });
  // Truncate prior logs each time we spawn so users only see the
  // current attempt's output.
  const fd = openSync(logPath, 'w');
  const cliPath = fileURLToPath(import.meta.url);
  const args = [cliPath, 'start', '--name', name, '--host', host, '--port', String(port)];
  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: ['ignore', fd, fd],
  });
  child.unref();
  return logPath;
};

// Poll the lockfile after spawning the server to learn the port it
// actually bound to. 30 × 150ms = ~4.5s, which covers Shiki warmup on
// a cold cache while staying well under a typical CLI timeout budget.
const POLL_ATTEMPTS = 30;
const POLL_INTERVAL_MS = 150;

const tailLog = async (path: string, lines = 10): Promise<string | null> => {
  try {
    const content = await readFile(path, 'utf-8');
    if (!content.trim()) return null;
    const parts = content.split(/\r?\n/);
    return parts.slice(-lines).join('\n').trim();
  } catch {
    return null;
  }
};

export const runPush = async (opts: PushOptions): Promise<void> => {
  const name = opts.name ?? DEFAULT_INSTANCE_NAME;
  const content = opts.file ? await readFile(opts.file, 'utf-8') : await readStdin();

  if (!content.trim()) {
    process.stderr.write('mdscroll: no content to push (stdin empty and no file given)\n');
    process.exitCode = 1;
    return;
  }

  const source = sourceFor(opts.file);

  const existing = await readLock(name);
  if (existing) {
    const result = await tryPost(pushEndpoint(existing.host, existing.port), content, source);
    if (result.kind === 'ok') {
      process.stdout.write(
        `mdscroll[${name}]: pushed to ${browserUrl(existing.host, existing.port)}\n`,
      );
      return;
    }
    if (result.kind === 'rejected') {
      // Server answered with a 4xx/5xx — it is alive and intentionally
      // refusing this push. Keep the lock, surface the status, and exit 1.
      process.stderr.write(
        `mdscroll[${name}]: server rejected push with ${result.status}${
          result.detail ? `: ${result.detail}` : ''
        }\n`,
      );
      process.exitCode = 1;
      return;
    }
    // unreachable — server is gone. Clean up and fall through to spawn.
    await removeLock(name);
  }

  const logPath = await spawnServer(name, opts.port, opts.host);

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    await sleep(POLL_INTERVAL_MS);
    const lock = await readLock(name);
    if (!lock) continue;
    const result = await tryPost(pushEndpoint(lock.host, lock.port), content, source);
    if (result.kind === 'ok') {
      process.stdout.write(
        `mdscroll[${name}]: started server and pushed to ${browserUrl(lock.host, lock.port)}\n`,
      );
      return;
    }
    if (result.kind === 'rejected') {
      // Freshly-spawned server is live but rejecting — no point in polling.
      process.stderr.write(
        `mdscroll[${name}]: spawned server rejected push with ${result.status}${
          result.detail ? `: ${result.detail}` : ''
        }\n`,
      );
      process.exitCode = 1;
      return;
    }
  }

  const tail = await tailLog(logPath);
  process.stderr.write(
    `mdscroll[${name}]: failed to reach the spawned server within ${(POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s\n`,
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
