import { spawn } from 'node:child_process';
import { basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { DEFAULT_INSTANCE_NAME, readLock, removeLock } from '../store/lockfile.js';

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

const pushUrl = (host: string, port: number): string => `http://${host}:${port}/push`;

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

const spawnServer = (name: string, port: number, host: string): void => {
  const cliPath = fileURLToPath(import.meta.url);
  const args = [cliPath, 'start', '--name', name, '--host', host, '--port', String(port)];
  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
};

const POLL_ATTEMPTS = 30;
const POLL_INTERVAL_MS = 150;

export const runPush = async (opts: PushOptions): Promise<void> => {
  const name = opts.name ?? DEFAULT_INSTANCE_NAME;
  const content = opts.file ? await readFile(opts.file, 'utf-8') : await readStdin();

  if (!content.trim()) {
    process.stderr.write('mdscroll: no content to push (stdin empty and no file given)\n');
    process.exitCode = 1;
    return;
  }

  const source = opts.file ? basename(opts.file) : 'stdin';

  const existing = await readLock(name);
  if (existing) {
    const url = pushUrl(existing.host, existing.port);
    if (await tryPost(url, content, source)) {
      process.stdout.write(`mdscroll[${name}]: pushed to ${url}\n`);
      return;
    }
    // Stale lockfile — server is gone. Clean up and fall through to spawn.
    await removeLock(name);
  }

  spawnServer(name, opts.port, opts.host);

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    await sleep(POLL_INTERVAL_MS);
    const lock = await readLock(name);
    if (!lock) continue;
    const url = pushUrl(lock.host, lock.port);
    if (await tryPost(url, content, source)) {
      process.stdout.write(`mdscroll[${name}]: started server and pushed to ${url}\n`);
      return;
    }
  }

  process.stderr.write(`mdscroll[${name}]: failed to reach the spawned server\n`);
  process.exitCode = 1;
};
