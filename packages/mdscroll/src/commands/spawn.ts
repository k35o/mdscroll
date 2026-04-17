import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Where the detached start-up child's stdout/stderr is written so that
// push can surface it if the spawn didn't make it to the point of
// writing a lockfile.
const spawnLogPath = (name: string): string => join(homedir(), '.mdscroll', `${name}.log`);

export type SpawnOptions = {
  name: string;
  port: number;
  host: string;
};

export type SpawnResult = {
  /** Path of the log file the child's stdout/stderr is redirected to. */
  logPath: string;
};

/**
 * Spawn a detached `mdscroll start` process so the parent CLI can
 * return immediately while the server takes over. Any output from the
 * child goes to a per-instance log file that callers can `tailLog`
 * after a timeout for diagnostics.
 */
export const spawnDetachedServer = async (opts: SpawnOptions): Promise<SpawnResult> => {
  const logPath = spawnLogPath(opts.name);
  await mkdir(join(logPath, '..'), { recursive: true });
  // Truncate prior logs each time we spawn so users only see the
  // current attempt's output.
  const fd = openSync(logPath, 'w');
  const cliPath = fileURLToPath(import.meta.url);
  const child = spawn(
    process.execPath,
    [cliPath, 'start', '--name', opts.name, '--host', opts.host, '--port', String(opts.port)],
    { detached: true, stdio: ['ignore', fd, fd] },
  );
  child.unref();
  return { logPath };
};

/**
 * Return the last `lines` lines of `path`, trimmed. null when the file
 * is absent or empty. Used to surface spawn errors when poll times out.
 */
export const tailLog = async (path: string, lines = 10): Promise<string | null> => {
  try {
    const content = await readFile(path, 'utf-8');
    if (!content.trim()) return null;
    const parts = content.split(/\r?\n/);
    return parts.slice(-lines).join('\n').trim();
  } catch {
    return null;
  }
};
