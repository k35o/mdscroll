import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { discover } from './discover.js';
import { attachLiveness } from './liveness.js';
import { DocMissingError, deleteDoc, postDoc, putDoc, type RemoteDoc } from './push-client.js';
import { createApp } from './server/app.js';
import { warmup } from './server/render.js';
import { fileSourceLabel, stdinSourceLabel } from './source.js';
import { Store } from './store/state.js';
import { watchFile } from './watch.js';

export type RunOptions = {
  file?: string | undefined;
  port: number;
  /** True when the port came from `--port` rather than the default. */
  portExplicit?: boolean;
  host: string;
  version: string;
  stdin?: NodeJS.ReadableStream & { isTTY?: boolean };
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
};

type Payload = { source: string; markdown: string };

type Feed = {
  initial: Payload;
  /** Attach a watcher that fires with fresh content. Noop for stdin. */
  attach: (onUpdate: (p: Payload) => void) => { close: () => void };
  /** True when this feed produces no further events (stdin mode). */
  isStatic: boolean;
};

type LoadResult =
  | { kind: 'ready'; feed: Feed }
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

export const loadSource = async (opts: Pick<RunOptions, 'file' | 'stdin'>): Promise<LoadResult> => {
  if (opts.file) {
    const file = opts.file;
    const label = fileSourceLabel(file);
    let initialMd: string;
    try {
      initialMd = await readFile(file, 'utf-8');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { kind: 'error', message: `cannot read ${file}: ${message}` };
    }
    return {
      kind: 'ready',
      feed: {
        initial: { source: label, markdown: initialMd },
        attach: (onUpdate) =>
          watchFile(file, async () => {
            try {
              const next = await readFile(file, 'utf-8');
              onUpdate({ source: label, markdown: next });
            } catch {
              // File is likely mid-save (ENOENT window on atomic replace).
              // The directory watcher will fire again with the final
              // contents; silently wait.
            }
          }),
        isStatic: false,
      },
    };
  }

  const stdin = opts.stdin ?? process.stdin;
  if (!stdin.isTTY) {
    const markdown = await readAll(stdin);
    return {
      kind: 'ready',
      feed: {
        initial: { source: stdinSourceLabel(markdown), markdown },
        attach: () => ({ close: () => undefined }),
        isStatic: true,
      },
    };
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

type ShutdownFn = () => Promise<void>;

const installSignalHandlers = (shutdown: ShutdownFn): void => {
  let tearingDown = false;
  const run = () => {
    if (tearingDown) return;
    tearingDown = true;
    void shutdown()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  };
  process.on('SIGINT', run);
  process.on('SIGTERM', run);
};

/**
 * Buffered watcher. The raw `feed.attach()` callback fires immediately,
 * but we may not have a consumer ready yet (server not bound, POST not
 * answered). Stash every update in `latest` so the consumer, when it
 * arrives, sees the most recent content. The initial value is seeded
 * from `feed.initial` so the first save — however racing with
 * discovery — never disappears.
 */
type WatchBuffer = {
  /** Current view of the source. Always non-null for ready feeds. */
  current: () => Payload;
  /**
   * Register a consumer. The caller must pass the Payload it has
   * already consumed downstream (typically the one returned by
   * `current()` just before POSTing / adding to the store). If `latest`
   * has advanced past `seen` — i.e. a save landed during the async gap
   * between `current()` and this call — the consumer is invoked
   * immediately with the latest value so the startup window cannot
   * drop updates.
   */
  onChange: (seen: Payload, cb: (p: Payload) => void) => void;
  /** Stop the underlying watcher. Safe to call multiple times. */
  close: () => void;
};

const bufferFeed = (feed: Feed): WatchBuffer => {
  let latest = feed.initial;
  let consumer: ((p: Payload) => void) | null = null;
  const handle = feed.attach((next) => {
    latest = next;
    consumer?.(next);
  });
  let closed = false;
  return {
    current: () => latest,
    onChange: (seen, cb) => {
      consumer = cb;
      // Replay if `latest` is newer than what the caller told us they
      // observed. Reference equality is enough: the feed produces a
      // fresh Payload object on every save, so `latest !== seen` means
      // at least one save landed in the gap.
      if (latest !== seen) cb(latest);
    },
    close: () => {
      if (closed) return;
      closed = true;
      consumer = null;
      handle.close();
    },
  };
};

const runServerMode = (opts: {
  watch: WatchBuffer;
  handle: Awaited<ReturnType<typeof import('./server/app.js').startServer>>;
  store: Store;
  stdout: NodeJS.WritableStream;
  note?: string;
}): void => {
  const { watch, handle, store, stdout } = opts;
  const initial = watch.current();
  const { doc } = store.add({
    source: initial.source,
    markdown: initial.markdown,
    ownerPid: process.pid,
  });
  watch.onChange(initial, (next) => {
    store.update(doc.id, next);
  });
  const liveness = attachLiveness(store);

  stdout.write(`mdscroll running at ${handle.url}\n`);
  if (opts.note) stdout.write(`mdscroll: ${opts.note}\n`);

  installSignalHandlers(async () => {
    watch.close();
    liveness.stop();
    await handle.close().catch(() => undefined);
  });
};

const REATTACH_BACKOFF_MS = 1000;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const runClientMode = async (opts: {
  baseUrl: string;
  watch: WatchBuffer;
  isStatic: boolean;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}): Promise<void> => {
  const { baseUrl, watch, isStatic, stdout, stderr } = opts;

  /**
   * A random per-process identifier. When the server sees the same id
   * twice it upserts rather than creating a new doc — that keeps
   * re-POST after a confused timeout/abort idempotent.
   */
  const instanceId = randomUUID();

  const registerFresh = async (): Promise<{ remote: RemoteDoc; seen: Payload }> => {
    const seen = watch.current();
    const remote = await postDoc(baseUrl, {
      source: seen.source,
      markdown: seen.markdown,
      ownerPid: process.pid,
      instanceId,
    });
    return { remote, seen };
  };

  let remote: RemoteDoc;
  let seen: Payload;
  try {
    const registered = await registerFresh();
    remote = registered.remote;
    seen = registered.seen;
  } catch (err) {
    throw new Error(
      `mdscroll: failed to attach to ${baseUrl}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Latest-wins push queue with bounded retry:
  // - `latest` holds the next payload to send; it is NOT cleared until
  //   the server confirms receipt, so a PUT failure doesn't lose data.
  // - On failure we wait `REATTACH_BACKOFF_MS` and retry from the top.
  // - On 404 (server forgot our doc — typically because it was
  //   restarted) we re-POST the current content so subsequent PUTs
  //   have a valid id/token again.
  let latest: Payload | null = null;
  let draining: Promise<void> | null = null;
  let closed = false;

  const drain = async (): Promise<void> => {
    while (!closed && latest) {
      const payload = latest;
      try {
        await putDoc(remote, payload);
        // Only clear `latest` if another tick hasn't already replaced
        // it with a newer value during the PUT. A fresh write wins.
        if (latest === payload) latest = null;
      } catch (err) {
        if (err instanceof DocMissingError) {
          stderr.write(`mdscroll: server forgot this doc; re-registering and retrying...\n`);
          try {
            // Idempotent on the server side — repeated POST with the
            // same instanceId upserts rather than duplicating the doc.
            const registered = await registerFresh();
            remote = registered.remote;
          } catch (reregErr) {
            stderr.write(
              `mdscroll: re-register failed: ${reregErr instanceof Error ? reregErr.message : String(reregErr)}; backing off\n`,
            );
            await delay(REATTACH_BACKOFF_MS);
          }
          continue;
        }
        stderr.write(
          `mdscroll: push failed (${err instanceof Error ? err.message : String(err)}); retrying in ${REATTACH_BACKOFF_MS}ms\n`,
        );
        await delay(REATTACH_BACKOFF_MS);
      }
    }
  };
  const schedule = () => {
    if (draining || closed) return;
    draining = drain().finally(() => {
      draining = null;
    });
  };

  watch.onChange(seen, (next) => {
    latest = next;
    schedule();
  });

  // Static (stdin) feeds produce no further updates. The CLI would
  // naturally exit because nothing is keeping the event loop alive —
  // no fs.watch handle, no HTTP server. Install a phantom timer so
  // the process stays foreground until the user Ctrl+Cs, at which
  // point the signal handler cleans up the remote doc.
  let heartbeat: NodeJS.Timeout | null = null;
  if (isStatic) {
    heartbeat = setInterval(() => undefined, 1 << 30);
  }

  stdout.write(`mdscroll attached to ${baseUrl} (${watch.current().source})\n`);

  installSignalHandlers(async () => {
    closed = true;
    watch.close();
    if (heartbeat) clearInterval(heartbeat);
    if (draining) {
      await draining.catch(() => undefined);
    }
    await deleteDoc(remote).catch(() => undefined);
  });
};

export const runMdscroll = async (opts: RunOptions): Promise<void> => {
  const stdout = opts.stdout ?? process.stdout;
  const stderr = opts.stderr ?? process.stderr;

  const load = await loadSource(opts);
  if (load.kind === 'error') {
    stderr.write(`mdscroll: ${load.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (load.kind === 'no-input') {
    stderr.write(USAGE);
    process.exitCode = 1;
    return;
  }

  // Attach the file watcher right now, before anything slow (renderer
  // warmup, port discovery, POST /_/docs). A save that lands during
  // warmup/discover/POST updates `watch.current()`; the consumer we
  // install later reads from that, so no edit is lost to the startup
  // window.
  const watch = bufferFeed(load.feed);

  try {
    await warmup();
  } catch (err) {
    watch.close();
    throw err;
  }

  // Build the server app up-front. In client mode the app is discarded.
  const store = new Store();
  const app = createApp(store, { version: opts.version }, { bindHost: opts.host });
  let decision: Awaited<ReturnType<typeof discover>>;
  try {
    decision = await discover({
      app,
      port: opts.port,
      host: opts.host,
      portExplicit: opts.portExplicit ?? false,
    });
  } catch (err) {
    watch.close();
    stderr.write(`mdscroll: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
    return;
  }

  if (decision.mode === 'client') {
    await runClientMode({
      baseUrl: decision.baseUrl,
      watch,
      isStatic: load.feed.isStatic,
      stdout,
      stderr,
    });
    return;
  }

  runServerMode({
    watch,
    handle: decision.handle,
    store,
    stdout,
    ...(decision.note ? { note: decision.note } : {}),
  });
};
