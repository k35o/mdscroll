import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { bindApp } from './bind.js';
import { docUrl, loadInput, runDefault, runLs, runPush, runRm } from './run.js';
import { createApp, registerDoc } from './server/app.js';
import { createWatchers, type Watchers } from './server/watcher.js';
import { Store } from './store/state.js';

// runServe and runDefault's become-server branch install process-wide
// signal handlers and keep the event loop alive; those paths belong to
// the e2e suite. This file exercises the client-side runners against a
// real in-process server.

const cleanups: Array<() => Promise<void>> = [];

const track = (fn: () => Promise<void>): void => {
  cleanups.push(fn);
};

afterEach(async () => {
  process.exitCode = undefined;
  while (cleanups.length > 0) {
    const fn = cleanups.pop();
    if (fn) await fn().catch(() => undefined);
  }
});

const getFreePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close(() => reject(new Error('no address info')));
        return;
      }
      const { port } = address;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });

const startApp = async (): Promise<{ port: number; store: Store; watchers: Watchers }> => {
  const store = new Store();
  const watchers = createWatchers(store);
  const port = await getFreePort();
  const handle = await bindApp(createApp(store, watchers, { version: 'test' }), port);
  track(async () => {
    watchers.close();
    await handle.close();
  });
  return { port, store, watchers };
};

const bindRaw = (
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<{ port: number; server: Server }> =>
  new Promise((resolve, reject) => {
    const server = createServer(handler);
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('no address info'));
        return;
      }
      resolve({ port: address.port, server });
    });
  });

const closeServer = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
    server.closeAllConnections();
  });

const makeTempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mdscroll-run-'));
  track(() => rm(dir, { recursive: true, force: true }));
  return dir;
};

type Sink = { stream: NodeJS.WritableStream; text: () => string };

const sink = (): Sink => {
  let text = '';
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      text += String(chunk);
      callback();
    },
  });
  return { stream, text: () => text };
};

type Stdin = NodeJS.ReadableStream & { isTTY?: boolean };

const ttyStdin = (): Stdin => Object.assign(Readable.from([]), { isTTY: true });

const pipedStdin = (text: string): Stdin => Readable.from([text]);

type Io = { out: Sink; err: Sink };

const makeIo = (): Io => ({ out: sink(), err: sink() });

const optsWith = (port: number, io: Io, extra?: { json?: boolean; stdin?: Stdin }) => ({
  port,
  json: extra?.json ?? false,
  version: 'test',
  stdin: extra?.stdin ?? ttyStdin(),
  stdout: io.out.stream,
  stderr: io.err.stream,
});

describe('loadInput', () => {
  it('keys a file doc by realpath so a symlink maps to the same doc', async () => {
    const dir = await makeTempDir();
    const target = join(dir, 'target.md');
    await writeFile(target, '# Target\n');
    await symlink(target, join(dir, 'alias.md'));

    const result = await loadInput({ file: join(dir, 'alias.md'), stdin: ttyStdin() });

    const expectedKey = await realpath(target);
    expect(result).toMatchObject({
      kind: 'ready',
      input: { kind: 'file', key: expectedKey, path: expectedKey, markdown: '# Target\n' },
    });
  });

  it('labels a file doc relative to the cwd', async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, 'docs'));
    await writeFile(join(dir, 'docs', 'plan.md'), '# Plan\n');
    const originalCwd = process.cwd();
    process.chdir(dir);
    track(async () => process.chdir(originalCwd));

    const result = await loadInput({ file: join('docs', 'plan.md'), stdin: ttyStdin() });

    expect(result).toMatchObject({ kind: 'ready', input: { label: 'docs/plan.md' } });
  });

  it('returns an error result for a missing file', async () => {
    const dir = await makeTempDir();

    const result = await loadInput({ file: join(dir, 'missing.md'), stdin: ttyStdin() });

    expect(result).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('cannot read'),
    });
  });

  it('treats whitespace-only piped stdin as no input', async () => {
    const result = await loadInput({ stdin: pipedStdin('  \n\t\n') });

    expect(result).toEqual({ kind: 'no-input' });
  });

  it('keys piped stdin by --name when one is given', async () => {
    const result = await loadInput({ name: 'review', stdin: pipedStdin('# Title\n\nbody\n') });

    expect(result).toEqual({
      kind: 'ready',
      input: { kind: 'static', key: 'review', label: 'review', markdown: '# Title\n\nbody\n' },
    });
  });

  it('keys anonymous piped stdin as untitled and labels it from the H1', async () => {
    const result = await loadInput({ stdin: pipedStdin('# Design Review\n\nbody\n') });

    expect(result).toEqual({
      kind: 'ready',
      input: {
        kind: 'static',
        key: 'untitled',
        label: 'Design Review',
        markdown: '# Design Review\n\nbody\n',
      },
    });
  });

  it('reports no input for a TTY stdin without a file argument', async () => {
    const result = await loadInput({ stdin: ttyStdin() });

    expect(result).toEqual({ kind: 'no-input' });
  });
});

describe('docUrl', () => {
  it('percent-encodes the doc key into the URL fragment', () => {
    expect(docUrl('http://127.0.0.1:4977', '/tmp/my docs/plan.md')).toBe(
      'http://127.0.0.1:4977/#%2Ftmp%2Fmy%20docs%2Fplan.md',
    );
  });
});

describe('runPush', () => {
  it('exits 2 and points at `mdscroll serve` when nothing is listening', async () => {
    const dir = await makeTempDir();
    const file = join(dir, 'plan.md');
    await writeFile(file, '# Plan\n');
    const port = await getFreePort();
    const io = makeIo();

    await runPush({ file, ...optsWith(port, io) });

    expect(process.exitCode).toBe(2);
    expect(io.err.text()).toContain('mdscroll serve');
    expect(io.out.text()).toBe('');
  });

  it('pushes a file and prints one JSON line with replaced: false', async () => {
    const { port, store } = await startApp();
    const dir = await makeTempDir();
    const file = join(dir, 'plan.md');
    await writeFile(file, '# Plan\n');
    const key = await realpath(file);
    const io = makeIo();

    await runPush({ file, ...optsWith(port, io, { json: true }) });

    expect(process.exitCode).toBeUndefined();
    expect(io.out.text().trim().split('\n')).toHaveLength(1);
    const parsed = JSON.parse(io.out.text()) as { url: string; key: string; replaced: boolean };
    expect(parsed.key).toBe(key);
    expect(parsed.replaced).toBe(false);
    const [base = '', fragment = ''] = parsed.url.split('#');
    expect(base).toBe(`http://127.0.0.1:${port}/`);
    expect(decodeURIComponent(fragment)).toBe(key);
    expect(store.get(key)).toMatchObject({ kind: 'file', path: key, watched: true });
  });

  it('reports replaced: true when the same doc is pushed twice', async () => {
    const { port } = await startApp();
    const dir = await makeTempDir();
    const file = join(dir, 'plan.md');
    await writeFile(file, '# Plan\n');
    await runPush({ file, ...optsWith(port, makeIo(), { json: true }) });
    const io = makeIo();

    await runPush({ file, ...optsWith(port, io, { json: true }) });

    expect(JSON.parse(io.out.text())).toMatchObject({ replaced: true });
  });

  it('warns on stderr when anonymous stdin replaces the existing untitled doc', async () => {
    const { port } = await startApp();
    await runPush({ ...optsWith(port, makeIo(), { stdin: pipedStdin('# One\n') }) });
    const io = makeIo();

    await runPush({ ...optsWith(port, io, { stdin: pipedStdin('# Two\n') }) });

    expect(io.out.text()).toBe(`http://127.0.0.1:${port}/#untitled\n`);
    expect(io.err.text()).toContain("replaced existing doc 'untitled'");
  });

  it('exits 1 when the port is held by a non-mdscroll process', async () => {
    const { port, server } = await bindRaw((_req, res) => {
      res.statusCode = 200;
      res.end('not mdscroll');
    });
    track(() => closeServer(server));
    const dir = await makeTempDir();
    const file = join(dir, 'plan.md');
    await writeFile(file, '# Plan\n');
    const io = makeIo();

    await runPush({ file, ...optsWith(port, io) });

    expect(process.exitCode).toBe(1);
    expect(io.err.text()).toContain('non-mdscroll');
  });
});

describe('runDefault', () => {
  it('pushes to an existing server instead of becoming one', async () => {
    const { port, store } = await startApp();
    const io = makeIo();

    await runDefault({ ...optsWith(port, io, { stdin: pipedStdin('# Note\n') }) });

    expect(process.exitCode).toBeUndefined();
    expect(store.get('untitled')).toMatchObject({ label: 'Note' });
    expect(io.out.text()).toBe(`http://127.0.0.1:${port}/#untitled\n`);
    expect(io.err.text()).toBe('');
  });

  it('prints usage and exits 1 when there is no input', async () => {
    const port = await getFreePort();
    const io = makeIo();

    await runDefault({ ...optsWith(port, io) });

    expect(process.exitCode).toBe(1);
    expect(io.err.text()).toContain('mdscroll <file>');
    expect(io.out.text()).toBe('');
  });
});

describe('runLs', () => {
  it('exits 2 when no server is listening', async () => {
    const port = await getFreePort();
    const io = makeIo();

    await runLs(optsWith(port, io));

    expect(process.exitCode).toBe(2);
    expect(io.err.text()).toContain('no server running');
  });

  it('prints one tab-separated line per doc with its state', async () => {
    const { port, store, watchers } = await startApp();
    await registerDoc(store, watchers, {
      key: 'session-notes',
      markdown: '# Notes',
      label: 'Notes',
    });
    const io = makeIo();

    await runLs(optsWith(port, io));

    expect(io.out.text()).toBe('session-notes\tstatic\tNotes\n');
  });

  it('prints a {docs: [...]} object with --json', async () => {
    const { port, store, watchers } = await startApp();
    await registerDoc(store, watchers, { key: 'session-notes', markdown: '# Notes' });
    const io = makeIo();

    await runLs(optsWith(port, io, { json: true }));

    const parsed = JSON.parse(io.out.text()) as { docs: unknown[] };
    expect(parsed.docs).toHaveLength(1);
    expect(parsed.docs[0]).toMatchObject({
      key: 'session-notes',
      kind: 'static',
      watched: false,
      stale: false,
    });
  });
});

describe('runRm', () => {
  it('matches a symlinked path argument to the realpath doc key', async () => {
    const { port, store, watchers } = await startApp();
    const dir = await makeTempDir();
    const target = join(dir, 'plan.md');
    await writeFile(target, '# Plan\n');
    const alias = join(dir, 'alias.md');
    await symlink(target, alias);
    const key = await realpath(target);
    await registerDoc(store, watchers, { key, path: key, watch: false });
    const io = makeIo();

    await runRm({ target: alias, ...optsWith(port, io, { json: true }) });

    expect(JSON.parse(io.out.text())).toEqual({ key, removed: true });
    expect(store.get(key)).toBeNull();
  });

  it('removes a static doc by its literal name', async () => {
    const { port, store, watchers } = await startApp();
    await registerDoc(store, watchers, { key: 'session-notes', markdown: '# Notes' });
    const io = makeIo();

    await runRm({ target: 'session-notes', ...optsWith(port, io) });

    expect(io.out.text()).toBe('removed session-notes\n');
    expect(store.get('session-notes')).toBeNull();
  });

  it('reports removed: false and exits 0 when nothing matches', async () => {
    const { port } = await startApp();
    const io = makeIo();

    await runRm({ target: 'no-such-doc', ...optsWith(port, io, { json: true }) });

    expect(process.exitCode).toBeUndefined();
    expect(JSON.parse(io.out.text())).toEqual({ key: null, removed: false });
  });
});
