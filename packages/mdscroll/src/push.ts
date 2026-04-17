import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { readLock, removeLock } from './lockfile.js';

export type PushOptions = {
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

const tryPost = async (url: string, body: string): Promise<boolean> => {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body,
    });
    return response.ok;
  } catch {
    return false;
  }
};

const spawnServer = (port: number, host: string): void => {
  const cliPath = fileURLToPath(import.meta.url);
  const args = [cliPath, 'start', '--no-open', '--host', host, '--port', String(port)];
  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
};

const POLL_ATTEMPTS = 30;
const POLL_INTERVAL_MS = 150;

export const runPush = async (opts: PushOptions): Promise<void> => {
  const content = opts.file ? await readFile(opts.file, 'utf-8') : await readStdin();

  if (!content.trim()) {
    process.stderr.write('mdscroll: no content to push (stdin empty and no file given)\n');
    process.exitCode = 1;
    return;
  }

  const existing = await readLock();
  if (existing) {
    const url = pushUrl(existing.host, existing.port);
    if (await tryPost(url, content)) {
      process.stdout.write(`mdscroll: pushed to ${url}\n`);
      return;
    }
    // Stale lockfile — server is gone. Clean up and fall through to spawn.
    await removeLock();
  }

  spawnServer(opts.port, opts.host);

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    await sleep(POLL_INTERVAL_MS);
    const lock = await readLock();
    if (!lock) continue;
    const url = pushUrl(lock.host, lock.port);
    if (await tryPost(url, content)) {
      process.stdout.write(`mdscroll: started server and pushed to ${url}\n`);
      return;
    }
  }

  process.stderr.write('mdscroll: failed to reach the spawned server\n');
  process.exitCode = 1;
};
