import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { resolvePort } from './port.js';
import { startServer } from './server/app.js';
import { warmup } from './server/render.js';
import { fileSourceLabel, stdinSourceLabel } from './source.js';
import { Store } from './store/state.js';
import { watchFile } from './watch.js';

export type RunOptions = {
  file?: string | undefined;
  port: number;
  host: string;
  stdin?: NodeJS.ReadableStream & { isTTY?: boolean };
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
};

export type IngestResult =
  | { kind: 'ready'; stop: () => void }
  | { kind: 'no-input' }
  | { kind: 'error'; message: string };

const readAll = async (stream: NodeJS.ReadableStream): Promise<string> => {
  const readable = Readable.from(stream);
  readable.setEncoding('utf-8');
  let buf = '';
  for await (const chunk of readable) {
    buf += chunk;
  }
  return buf;
};

/**
 * Load the initial markdown into the store and, in file-watch mode,
 * attach a watcher so later changes flow back in. Returns a disposable
 * stop function when content was produced, or a non-ready kind that the
 * caller should treat as "don't bind a server".
 */
export const ingestContent = async (
  opts: Pick<RunOptions, 'file' | 'stdin'>,
  store: Store,
): Promise<IngestResult> => {
  if (opts.file) {
    const label = fileSourceLabel(opts.file);
    let initial: string;
    try {
      initial = await readFile(opts.file, 'utf-8');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { kind: 'error', message: `cannot read ${opts.file}: ${message}` };
    }
    store.setCurrent(initial, label);

    const file = opts.file;
    const handle = watchFile(file, async () => {
      try {
        const next = await readFile(file, 'utf-8');
        store.setCurrent(next, label);
      } catch {
        // File is likely mid-save (ENOENT window on atomic replace). The
        // next event from the directory watcher will pick up the final
        // contents, so we quietly wait.
      }
    });
    return { kind: 'ready', stop: handle.close };
  }

  const stdin = opts.stdin ?? process.stdin;
  if (!stdin.isTTY) {
    const markdown = await readAll(stdin);
    store.setCurrent(markdown, stdinSourceLabel(markdown));
    return { kind: 'ready', stop: () => undefined };
  }

  return { kind: 'no-input' };
};

const USAGE = [
  'mdscroll: no input.',
  '',
  '  mdscroll <file>        watch a markdown file and serve it live',
  '  cat file.md | mdscroll serve piped markdown once',
  '',
  'See mdscroll --help for flags.',
  '',
].join('\n');

export const runMdscroll = async (opts: RunOptions): Promise<void> => {
  const stdout = opts.stdout ?? process.stdout;
  const stderr = opts.stderr ?? process.stderr;

  const store = new Store();
  const ingest = await ingestContent(opts, store);

  if (ingest.kind === 'error') {
    stderr.write(`mdscroll: ${ingest.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (ingest.kind === 'no-input') {
    stderr.write(USAGE);
    process.exitCode = 1;
    return;
  }

  await warmup();

  const port = await resolvePort(opts.port);

  let handle: Awaited<ReturnType<typeof startServer>>;
  try {
    handle = await startServer({ port, host: opts.host, store });
  } catch (err) {
    ingest.stop();
    throw err;
  }

  stdout.write(`mdscroll running at ${handle.url}\n`);

  const shutdown = async (): Promise<never> => {
    ingest.stop();
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
