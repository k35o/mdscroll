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

const tryPost = async (url: string, body: string, source: string): Promise<boolean> => {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Mdscroll-Source': source,
      },
      body,
    });
    return response.ok;
  } catch {
    return false;
  }
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
    if (await tryPost(pushEndpoint(existing.host, existing.port), content, source)) {
      process.stdout.write(
        `mdscroll[${name}]: pushed to ${browserUrl(existing.host, existing.port)}\n`,
      );
      return;
    }
    // Stale lockfile — server is gone. Clean up and fall through to spawn.
    await removeLock(name);
  }

  const logPath = await spawnServer(name, opts.port, opts.host);

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    await sleep(POLL_INTERVAL_MS);
    const lock = await readLock(name);
    if (!lock) continue;
    if (await tryPost(pushEndpoint(lock.host, lock.port), content, source)) {
      process.stdout.write(
        `mdscroll[${name}]: started server and pushed to ${browserUrl(lock.host, lock.port)}\n`,
      );
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
