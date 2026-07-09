import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { bindApp } from './bind.js';
import { deleteDoc, listDocs, putDoc, ServerRejectionError } from './client-http.js';
import { createApp } from './server/app.js';
import { createWatchers } from './server/watcher.js';
import { Store } from './store/state.js';

const cleanups: Array<() => Promise<void>> = [];

const track = (fn: () => Promise<void>): void => {
  cleanups.push(fn);
};

afterEach(async () => {
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

const startApp = async (): Promise<{ baseUrl: string; store: Store }> => {
  const store = new Store();
  const watchers = createWatchers(store);
  const port = await getFreePort();
  const handle = await bindApp(createApp(store, watchers, { version: 'test' }), port);
  track(async () => {
    watchers.close();
    await handle.close();
  });
  return { baseUrl: handle.url, store };
};

const bindRaw = (
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<{ baseUrl: string; server: Server }> =>
  new Promise((resolve, reject) => {
    const server = createServer(handler);
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('no address info'));
        return;
      }
      resolve({ baseUrl: `http://127.0.0.1:${address.port}`, server });
    });
  });

const closeServer = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
    server.closeAllConnections();
  });

describe('putDoc', () => {
  it('reports created for a key the server has not seen', async () => {
    const { baseUrl } = await startApp();

    const result = await putDoc(baseUrl, 'notes', { markdown: '# hi' });

    expect(result).toEqual({ created: true });
  });

  it('reports a replace (created: false) for an existing key', async () => {
    const { baseUrl } = await startApp();
    await putDoc(baseUrl, 'notes', { markdown: '# v1' });

    const result = await putDoc(baseUrl, 'notes', { markdown: '# v2' });

    expect(result).toEqual({ created: false });
  });

  it('throws ServerRejectionError with the server-provided message on 4xx', async () => {
    const { baseUrl } = await startApp();

    const error: unknown = await putDoc(baseUrl, 'notes', {}).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ServerRejectionError);
    expect(error).toMatchObject({
      status: 400,
      message: 'markdown is required for static docs',
    });
  });
});

describe('deleteDoc', () => {
  it('resolves and the doc is gone from the server', async () => {
    const { baseUrl, store } = await startApp();
    await putDoc(baseUrl, 'notes', { markdown: '# hi' });

    await expect(deleteDoc(baseUrl, 'notes')).resolves.toBeUndefined();

    expect(store.get('notes')).toBeNull();
  });

  it('resolves for a key the server never had (idempotent delete)', async () => {
    const { baseUrl } = await startApp();

    await expect(deleteDoc(baseUrl, 'never-created')).resolves.toBeUndefined();
  });
});

describe('listDocs', () => {
  it('returns one summary per registered doc', async () => {
    const { baseUrl } = await startApp();
    await putDoc(baseUrl, 'a', { markdown: '# a', label: 'Doc A' });
    await putDoc(baseUrl, 'b', { markdown: '# b' });

    const docs = await listDocs(baseUrl);

    expect(docs).toHaveLength(2);
    const byKey = new Map(docs.map((doc) => [doc.key, doc]));
    expect(byKey.get('a')).toMatchObject({
      key: 'a',
      label: 'Doc A',
      kind: 'static',
      watched: false,
      stale: false,
    });
    expect(byKey.get('b')).toMatchObject({ key: 'b', label: 'b', kind: 'static' });
    expect(typeof byKey.get('a')?.updatedAt).toBe('number');
  });

  it('throws when the server answers 200 with a malformed body', async () => {
    const { baseUrl, server } = await bindRaw((_req, res) => {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end('this is not json');
    });
    track(() => closeServer(server));

    const error: unknown = await listDocs(baseUrl).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ServerRejectionError);
    expect(error).toMatchObject({ message: 'malformed GET /_/docs body' });
  });
});
