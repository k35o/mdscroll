import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { readLock } from './lockfile.js';

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
  const child = spawn(
    process.execPath,
    [cliPath, 'start', '--no-open', '--port', String(port), '--host', host],
    { detached: true, stdio: 'ignore' },
  );
  child.unref();
};

export const runPush = async (opts: PushOptions): Promise<void> => {
  const content = opts.file ? await readFile(opts.file, 'utf-8') : await readStdin();

  if (!content.trim()) {
    process.stderr.write('mdscroll: no content to push (stdin empty and no file given)\n');
    process.exitCode = 1;
    return;
  }

  const existing = await readLock();
  const port = existing?.port ?? opts.port;
  const host = existing?.host ?? opts.host;
  const url = `http://${host}:${port}/push`;

  if (await tryPost(url, content)) {
    process.stdout.write(`mdscroll: pushed to ${url}\n`);
    return;
  }

  spawnServer(port, host);

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await sleep(150);
    if (await tryPost(url, content)) {
      process.stdout.write(`mdscroll: started server and pushed to ${url}\n`);
      return;
    }
  }

  process.stderr.write(`mdscroll: failed to reach server at ${url}\n`);
  process.exitCode = 1;
};
