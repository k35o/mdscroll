import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { bindApp } from './bind.js';
import { PROBE_TIMEOUT_MS } from './constants.js';
import { probePort } from './probe.js';
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
    // The hang scenario leaves a never-answered request open; destroy it
    // so close() does not wait forever.
    server.closeAllConnections();
  });

describe('probePort', () => {
  describe('nothing is listening on the port', () => {
    it('classifies a connection-refused port as free', async () => {
      const port = await getFreePort();

      const result = await probePort(port);

      expect(result).toEqual({ kind: 'free' });
    });
  });

  describe('an mdscroll server is listening', () => {
    it('classifies it as mdscroll with its base URL and pid', async () => {
      const store = new Store();
      const watchers = createWatchers(store);
      track(async () => watchers.close());
      const port = await getFreePort();
      const handle = await bindApp(createApp(store, watchers, { version: 'test' }), port);
      track(() => handle.close());

      const result = await probePort(port);

      expect(result).toEqual({
        kind: 'mdscroll',
        baseUrl: `http://127.0.0.1:${port}`,
        pid: process.pid,
      });
    });
  });

  describe('a non-mdscroll process is listening', () => {
    it('classifies a 200 answer with a wrong body as squatter', async () => {
      const { port, server } = await bindRaw((_req, res) => {
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ agent: 'definitely-not-mdscroll' }));
      });
      track(() => closeServer(server));

      const result = await probePort(port);

      expect(result).toEqual({ kind: 'squatter' });
    });

    it('classifies a 404 health answer as squatter', async () => {
      const { port, server } = await bindRaw((_req, res) => {
        res.statusCode = 404;
        res.end('not found');
      });
      track(() => closeServer(server));

      const result = await probePort(port);

      expect(result).toEqual({ kind: 'squatter' });
    });

    it('classifies a server that never responds as squatter within the probe timeout', async () => {
      const { port, server } = await bindRaw(() => {
        // Never answer: the probe must give up on its own.
      });
      track(() => closeServer(server));

      const start = Date.now();
      const result = await probePort(port);
      const elapsed = Date.now() - start;

      expect(result).toEqual({ kind: 'squatter' });
      expect(elapsed).toBeLessThan(PROBE_TIMEOUT_MS + 1000);
    });
  });
});
