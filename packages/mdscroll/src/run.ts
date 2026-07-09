import { readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { bindApp } from './bind.js';
import { deleteDoc, listDocs, type PushBody, putDoc, ServerRejectionError } from './client-http.js';
import { UNTITLED_KEY } from './constants.js';
import { isConnectionRefused, probePort } from './probe.js';
import { createApp, registerDoc, type ServerHandle } from './server/app.js';
import { warmup } from './server/render.js';
import { createWatchers, type Watchers } from './server/watcher.js';
import { fileSourceLabel, stdinSourceLabel } from './source.js';
import { Store } from './store/state.js';

export type CommonOptions = {
  port: number;
  json: boolean;
  version: string;
  stdin?: (NodeJS.ReadableStream & { isTTY?: boolean }) | undefined;
  stdout?: NodeJS.WritableStream | undefined;
  stderr?: NodeJS.WritableStream | undefined;
};

/**
 * Exit codes are a contract, not an accident:
 * - 0 success
 * - 1 error (bad input, squatted port, server rejection, ...)
 * - 2 strictly "nothing is listening" — i.e. `mdscroll serve` would fix it
 */
const EXIT_ERROR = 1;
const EXIT_NO_SERVER = 2;

/** How many probe/bind rounds before giving up on a flapping port. */
const DISCOVERY_ATTEMPTS = 3;

type Io = {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  stdin: NodeJS.ReadableStream & { isTTY?: boolean };
};

const ioFrom = (opts: CommonOptions): Io => ({
  stdout: opts.stdout ?? process.stdout,
  stderr: opts.stderr ?? process.stderr,
  stdin: opts.stdin ?? process.stdin,
});

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const fail = (stderr: NodeJS.WritableStream, msg: string, code: number): void => {
  stderr.write(`mdscroll: ${msg}\n`);
  process.exitCode = code;
};

const noServerMessage = (port: number): string =>
  `no server running on port ${port} — start one with \`mdscroll serve\``;

const squatterMessage = (port: number): string =>
  `port ${port} is held by a non-mdscroll process; stop it or pick another with --port`;

export const docUrl = (baseUrl: string, key: string): string =>
  `${baseUrl}/#${encodeURIComponent(key)}`;

const isAddrInUse = (err: unknown): boolean =>
  err !== null &&
  typeof err === 'object' &&
  'code' in err &&
  (err as { code?: unknown }).code === 'EADDRINUSE';

type FileInput = {
  kind: 'file';
  key: string;
  path: string;
  label: string;
  markdown: string;
};
type StaticInput = { kind: 'static'; key: string; label: string; markdown: string };
type Input = FileInput | StaticInput;

type LoadResult =
  | { kind: 'ready'; input: Input }
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
 * Doc identity: file docs are keyed by realpath (the same file is the
 * same tab from any cwd or symlink); stdin docs by `--name`, falling
 * back to the fixed `untitled` key so anonymous re-pipes replace one
 * tab instead of accumulating.
 */
export const loadInput = async (opts: {
  file?: string | undefined;
  name?: string | undefined;
  stdin: NodeJS.ReadableStream & { isTTY?: boolean };
}): Promise<LoadResult> => {
  if (opts.file !== undefined) {
    let path: string;
    let markdown: string;
    try {
      path = await realpath(resolve(opts.file));
      markdown = await readFile(path, 'utf-8');
    } catch (err) {
      return { kind: 'error', message: `cannot read ${opts.file}: ${message(err)}` };
    }
    return {
      kind: 'ready',
      input: { kind: 'file', key: path, path, label: fileSourceLabel(opts.file), markdown },
    };
  }
  if (!opts.stdin.isTTY) {
    const markdown = await readAll(opts.stdin);
    if (markdown.trim().length === 0) return { kind: 'no-input' };
    return {
      kind: 'ready',
      input: {
        kind: 'static',
        key: opts.name ?? UNTITLED_KEY,
        label: opts.name ?? stdinSourceLabel(markdown),
        markdown,
      },
    };
  }
  return { kind: 'no-input' };
};

const USAGE = [
  'mdscroll: no input.',
  '',
  '  mdscroll <file>          preview a file (starts the session server if needed)',
  '  cat file.md | mdscroll   preview piped markdown',
  '  mdscroll serve           start an empty session server',
  '  mdscroll push <file>     push to a running server; never blocks (exit 2 when none)',
  '  mdscroll ls / rm <doc>   list / remove docs',
  '',
  'See mdscroll --help for flags.',
  '',
].join('\n');

// File pushes send only the path — the server reads and watches the file
// itself. Shipping the (already-read) markdown too would double the bytes on
// the wire for a body the server discards on a successful read, and a 10 MiB
// payload is exactly what pushes the PUT past its request timeout. If the
// server genuinely cannot read the path it returns 422, surfaced as an error.
const pushBody = (input: Input): PushBody =>
  input.kind === 'file'
    ? { path: input.path, watch: true, label: input.label }
    : { markdown: input.markdown, label: input.label };

const emitPushResult = (
  io: Io,
  json: boolean,
  baseUrl: string,
  input: Input,
  created: boolean,
): void => {
  const url = docUrl(baseUrl, input.key);
  if (json) {
    io.stdout.write(`${JSON.stringify({ url, key: input.key, replaced: !created })}\n`);
    return;
  }
  io.stdout.write(`${url}\n`);
  // Replacing a re-pushed file is the expected loop; replacing a derived
  // stdin key may clobber an unrelated one-shot, so say it happened.
  if (!created && input.kind === 'static') {
    io.stderr.write(`mdscroll: replaced existing doc '${input.key}'\n`);
  }
};

type Session = { store: Store; watchers: Watchers; handle: ServerHandle };

const startSession = async (port: number, version: string): Promise<Session> => {
  const store = new Store();
  const watchers = createWatchers(store);
  const app = createApp(store, watchers, { version });
  const handle = await bindApp(app, port);
  return { store, watchers, handle };
};

const installSignalHandlers = (shutdown: () => Promise<void>): void => {
  let tearingDown = false;
  const run = () => {
    // A second Ctrl+C means "I mean it" — never swallow it.
    if (tearingDown) process.exit(130);
    tearingDown = true;
    void shutdown()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  };
  process.on('SIGINT', run);
  process.on('SIGTERM', run);
};

/**
 * Turn this process into the session server. The terminal narrates the
 * session so its owner always knows why the process is still running:
 * one line per doc pushed or removed under it, and a discard count on
 * shutdown when the session still held other people's docs.
 */
const runAsServer = (
  session: Session,
  ctx: { stderr: NodeJS.WritableStream; foundingKey: string | null },
): void => {
  // Warm the renderer right away so the first render is fast. Bind has
  // already happened — /_/health never waits on this.
  void warmup().catch((err) => {
    ctx.stderr.write(`mdscroll: renderer failed to start: ${message(err)}\n`);
    process.exit(1);
  });

  const labels = new Map<string, string>();
  for (const doc of session.store.list()) labels.set(doc.key, doc.label);
  session.store.subscribe((event) => {
    if (event.kind === 'added') {
      labels.set(event.doc.key, event.doc.label);
      ctx.stderr.write(`+ ${event.doc.label}\n`);
    } else if (event.kind === 'updated') {
      labels.set(event.doc.key, event.doc.label);
    } else {
      const label = labels.get(event.key) ?? event.key;
      labels.delete(event.key);
      ctx.stderr.write(`- ${label}\n`);
    }
  });

  installSignalHandlers(async () => {
    session.watchers.close();
    const discarded = session.store.list().filter((doc) => doc.key !== ctx.foundingKey).length;
    if (discarded > 0) {
      ctx.stderr.write(
        `mdscroll: session ended — discarded ${discarded} doc${discarded === 1 ? '' : 's'}\n`,
      );
    }
    await session.handle.close().catch(() => undefined);
  });
};

/** `mdscroll serve` — idempotent "make a server exist". */
export const runServe = async (opts: CommonOptions): Promise<void> => {
  const io = ioFrom(opts);
  for (let attempt = 0; attempt < DISCOVERY_ATTEMPTS; attempt += 1) {
    let session: Session;
    try {
      session = await startSession(opts.port, opts.version);
    } catch (err) {
      if (!isAddrInUse(err)) return fail(io.stderr, message(err), EXIT_ERROR);
      const probe = await probePort(opts.port);
      if (probe.kind === 'mdscroll') {
        // The desired state (a server on this port) already holds.
        if (opts.json) {
          io.stdout.write(
            `${JSON.stringify({ url: probe.baseUrl, pid: probe.pid ?? null, existing: true })}\n`,
          );
        } else {
          io.stdout.write(`mdscroll already running at ${probe.baseUrl}\n`);
        }
        return;
      }
      if (probe.kind === 'squatter') return fail(io.stderr, squatterMessage(opts.port), EXIT_ERROR);
      continue; // whoever held the port just died — retry the bind
    }
    if (opts.json) {
      io.stdout.write(
        `${JSON.stringify({ url: session.handle.url, pid: process.pid, existing: false })}\n`,
      );
    } else {
      io.stdout.write(`mdscroll running at ${session.handle.url}\n`);
    }
    runAsServer(session, { stderr: io.stderr, foundingKey: null });
    return;
  }
  fail(io.stderr, `could not bind port ${opts.port}; it keeps changing hands`, EXIT_ERROR);
};

/** `mdscroll push [file]` — strict push; never becomes the server. */
export const runPush = async (
  opts: CommonOptions & { file?: string | undefined; name?: string | undefined },
): Promise<void> => {
  const io = ioFrom(opts);
  const load = await loadInput({ file: opts.file, name: opts.name, stdin: io.stdin });
  if (load.kind === 'error') return fail(io.stderr, load.message, EXIT_ERROR);
  if (load.kind === 'no-input') {
    io.stderr.write(USAGE);
    process.exitCode = EXIT_ERROR;
    return;
  }
  const probe = await probePort(opts.port);
  if (probe.kind === 'free') return fail(io.stderr, noServerMessage(opts.port), EXIT_NO_SERVER);
  if (probe.kind === 'squatter') return fail(io.stderr, squatterMessage(opts.port), EXIT_ERROR);
  try {
    const { created } = await putDoc(probe.baseUrl, load.input.key, pushBody(load.input));
    emitPushResult(io, opts.json, probe.baseUrl, load.input, created);
  } catch (err) {
    if (err instanceof ServerRejectionError) {
      return fail(io.stderr, `server rejected the doc: ${err.message}`, EXIT_ERROR);
    }
    // Connection refused means the server that answered the probe has since
    // vanished — exit 2 so the caller knows `mdscroll serve` would fix it.
    // A timeout or other transport error is a live-but-unhealthy server
    // (e.g. mid-render of a huge doc): report it honestly, not as "no server".
    if (isConnectionRefused(err)) {
      return fail(io.stderr, noServerMessage(opts.port), EXIT_NO_SERVER);
    }
    return fail(io.stderr, `server did not respond: ${message(err)}`, EXIT_ERROR);
  }
};

/**
 * Default command — push-or-serve. A bounded discovery loop covers the
 * races: a server that dies between probe and PUT sends us back to the
 * bind attempt; losing the bind race sends us back to the probe.
 */
export const runDefault = async (
  opts: CommonOptions & { file?: string | undefined; name?: string | undefined },
): Promise<void> => {
  const io = ioFrom(opts);
  const load = await loadInput({ file: opts.file, name: opts.name, stdin: io.stdin });
  if (load.kind === 'error') return fail(io.stderr, load.message, EXIT_ERROR);
  if (load.kind === 'no-input') {
    io.stderr.write(USAGE);
    process.exitCode = EXIT_ERROR;
    return;
  }
  const input = load.input;

  for (let attempt = 0; attempt < DISCOVERY_ATTEMPTS; attempt += 1) {
    const probe = await probePort(opts.port);
    if (probe.kind === 'squatter') return fail(io.stderr, squatterMessage(opts.port), EXIT_ERROR);

    if (probe.kind === 'mdscroll') {
      try {
        const { created } = await putDoc(probe.baseUrl, input.key, pushBody(input));
        emitPushResult(io, opts.json, probe.baseUrl, input, created);
        return;
      } catch (err) {
        if (err instanceof ServerRejectionError) {
          return fail(io.stderr, `server rejected the doc: ${err.message}`, EXIT_ERROR);
        }
        // Only a vanished server (connection refused) sends us back to the
        // bind attempt; a timeout means the server is alive but slow, so
        // re-electing would just fight it — report and stop.
        if (isConnectionRefused(err)) continue;
        return fail(io.stderr, `server did not respond: ${message(err)}`, EXIT_ERROR);
      }
    }

    let session: Session;
    try {
      session = await startSession(opts.port, opts.version);
    } catch (err) {
      if (isAddrInUse(err)) continue; // lost the bind race — re-probe and push
      return fail(io.stderr, message(err), EXIT_ERROR);
    }

    let registered: Awaited<ReturnType<typeof registerDoc>>;
    try {
      registered = await registerDoc(session.store, session.watchers, {
        key: input.key,
        label: input.label,
        markdown: input.markdown,
        ...(input.kind === 'file' ? { path: input.path, watch: true } : {}),
      });
    } catch (err) {
      // A render/highlighter failure here would otherwise leave the freshly
      // bound server holding the event loop open with no signal handlers —
      // the process would hang instead of exiting. Tear it down and fail.
      session.watchers.close();
      await session.handle.close().catch(() => undefined);
      return fail(io.stderr, message(err), EXIT_ERROR);
    }
    if (!registered.ok) {
      session.watchers.close();
      await session.handle.close().catch(() => undefined);
      return fail(io.stderr, registered.error, EXIT_ERROR);
    }
    const url = docUrl(session.handle.url, input.key);
    if (opts.json) {
      io.stdout.write(
        `${JSON.stringify({ url, key: input.key, pid: process.pid, serving: true })}\n`,
      );
    } else {
      io.stderr.write(
        `mdscroll: no server found — serving at ${session.handle.url} (Ctrl+C ends the session)\n`,
      );
      io.stdout.write(`${url}\n`);
    }
    runAsServer(session, { stderr: io.stderr, foundingKey: input.key });
    return;
  }
  fail(
    io.stderr,
    `could not reach or start a server on port ${opts.port} after ${DISCOVERY_ATTEMPTS} attempts`,
    EXIT_ERROR,
  );
};

/**
 * `mdscroll rm <doc>` — resolve the argument against the server's actual
 * keys (realpath, cwd-resolved path, then literal name) so removing a
 * doc whose file was already deleted still works, and report the
 * outcome either way.
 */
export const runRm = async (opts: CommonOptions & { target: string }): Promise<void> => {
  const io = ioFrom(opts);
  const probe = await probePort(opts.port);
  if (probe.kind === 'free') return fail(io.stderr, noServerMessage(opts.port), EXIT_NO_SERVER);
  if (probe.kind === 'squatter') return fail(io.stderr, squatterMessage(opts.port), EXIT_ERROR);

  let keys: Set<string>;
  try {
    keys = new Set((await listDocs(probe.baseUrl)).map((doc) => doc.key));
  } catch (err) {
    if (err instanceof ServerRejectionError) return fail(io.stderr, err.message, EXIT_ERROR);
    return fail(io.stderr, noServerMessage(opts.port), EXIT_NO_SERVER);
  }

  const candidates: string[] = [];
  try {
    candidates.push(await realpath(resolve(opts.target)));
  } catch {
    // Not an existing file — the resolved path and literal name below
    // still match docs whose file has since been deleted.
  }
  candidates.push(resolve(opts.target));
  candidates.push(opts.target);
  const match = candidates.find((candidate) => keys.has(candidate));

  if (match === undefined) {
    // Absent is the desired end state — exit 0 — but never silently:
    // a typo or wrong-cwd miss must be distinguishable from a removal.
    if (opts.json) {
      io.stdout.write(`${JSON.stringify({ key: null, removed: false })}\n`);
    } else {
      io.stderr.write(`mdscroll: no such doc: ${opts.target}\n`);
    }
    return;
  }

  try {
    await deleteDoc(probe.baseUrl, match);
  } catch (err) {
    if (err instanceof ServerRejectionError) return fail(io.stderr, err.message, EXIT_ERROR);
    return fail(io.stderr, noServerMessage(opts.port), EXIT_NO_SERVER);
  }
  if (opts.json) {
    io.stdout.write(`${JSON.stringify({ key: match, removed: true })}\n`);
  } else {
    io.stdout.write(`removed ${match}\n`);
  }
};

/** `mdscroll ls` — list docs; doubles as the is-a-server-up probe. */
export const runLs = async (opts: CommonOptions): Promise<void> => {
  const io = ioFrom(opts);
  const probe = await probePort(opts.port);
  if (probe.kind === 'free') return fail(io.stderr, noServerMessage(opts.port), EXIT_NO_SERVER);
  if (probe.kind === 'squatter') return fail(io.stderr, squatterMessage(opts.port), EXIT_ERROR);
  try {
    const docs = await listDocs(probe.baseUrl);
    if (opts.json) {
      io.stdout.write(`${JSON.stringify({ docs })}\n`);
      return;
    }
    if (docs.length === 0) {
      io.stdout.write(`no docs at ${probe.baseUrl}\n`);
      return;
    }
    for (const doc of docs) {
      const state = doc.stale ? 'stale' : doc.watched ? 'watched' : 'static';
      io.stdout.write(`${doc.key}\t${state}\t${doc.label}\n`);
    }
  } catch (err) {
    if (err instanceof ServerRejectionError) return fail(io.stderr, err.message, EXIT_ERROR);
    return fail(io.stderr, noServerMessage(opts.port), EXIT_NO_SERVER);
  }
};
