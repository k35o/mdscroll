import { createServer, type Server } from 'node:http';
import getPort from 'get-port';
import { afterEach, describe, expect, it } from 'vitest';
import { bindApp } from './bind.js';
import { discover } from './discover.js';
import { createApp } from './server/app.js';
import { Store } from './store/state.js';

type Cleanup = () => Promise<void>;

const cleanups: Cleanup[] = [];

const track = (fn: Cleanup) => {
  cleanups.push(fn);
};

afterEach(async () => {
  while (cleanups.length > 0) {
    const fn = cleanups.pop();
    if (fn) await fn().catch(() => undefined);
  }
});

const bindRaw = async (
  handler: (req: unknown, res: unknown) => void,
  port: number,
): Promise<Server> =>
  new Promise((resolve, reject) => {
    // biome-ignore lint/suspicious/noExplicitAny: Node http types are permissive
    const server: Server = createServer(handler as any);
    server.once('listening', () => resolve(server));
    server.once('error', reject);
    server.listen(port, '127.0.0.1');
  });

const closeServer = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });

describe('discover', () => {
  describe('port is free', () => {
    it('binds the app and returns server mode', async () => {
      const port = await getPort();
      const app = createApp(new Store(), { version: 'test' }, { bindHost: '127.0.0.1' });

      const decision = await discover({ app, port, host: '127.0.0.1' });

      expect(decision.mode).toBe('server');
      if (decision.mode === 'server') {
        expect(decision.handle.url).toBe(`http://127.0.0.1:${port}`);
        expect(decision.note).toBeUndefined();
        track(() => decision.handle.close());
      }
    });
  });

  describe('port is taken by another mdscroll', () => {
    it('identifies it via /_/health and returns client mode', async () => {
      const port = await getPort();
      const existing = await bindApp(
        createApp(new Store(), { version: 'existing' }, { bindHost: '127.0.0.1' }),
        port,
        '127.0.0.1',
      );
      track(() => existing.close());

      const app = createApp(new Store(), { version: 'me' }, { bindHost: '127.0.0.1' });
      const decision = await discover({ app, port, host: '127.0.0.1' });

      expect(decision.mode).toBe('client');
      if (decision.mode === 'client') {
        expect(decision.baseUrl).toBe(`http://127.0.0.1:${port}`);
      }
    });
  });

  describe('port is taken by a non-mdscroll process', () => {
    it('falls back to a random free port and becomes a server', async () => {
      const squatted = await getPort();
      // Squat the port with a vanilla HTTP server that doesn't know about /_/health.
      const squatter = await bindRaw((_req, res) => {
        // biome-ignore lint/suspicious/noExplicitAny: Node http types are permissive
        (res as any).statusCode = 200;
        // biome-ignore lint/suspicious/noExplicitAny: Node http types are permissive
        (res as any).end('hello');
      }, squatted);
      track(() => closeServer(squatter));

      const app = createApp(new Store(), { version: 'me' }, { bindHost: '127.0.0.1' });
      const decision = await discover({
        app,
        port: squatted,
        host: '127.0.0.1',
      });

      expect(decision.mode).toBe('server');
      if (decision.mode === 'server') {
        expect(decision.handle.url).not.toBe(`http://127.0.0.1:${squatted}`);
        expect(decision.note).toMatch(new RegExp(`port ${squatted}`));
        track(() => decision.handle.close());
      }
    });

    it('falls back when the port returns a non-JSON /_/health body', async () => {
      const squatted = await getPort();
      const squatter = await bindRaw((_req, res) => {
        // biome-ignore lint/suspicious/noExplicitAny: Node http types are permissive
        const r = res as any;
        r.statusCode = 200;
        r.setHeader('content-type', 'application/json');
        r.end('not-a-json-object-but-valid-json-literal-null');
      }, squatted);
      track(() => closeServer(squatter));

      const app = createApp(new Store(), { version: 'me' }, { bindHost: '127.0.0.1' });
      const decision = await discover({
        app,
        port: squatted,
        host: '127.0.0.1',
      });

      expect(decision.mode).toBe('server');
      if (decision.mode === 'server') {
        track(() => decision.handle.close());
      }
    });

    it('throws instead of falling back when the caller pinned the port', async () => {
      const squatted = await getPort();
      const squatter = await bindRaw((_req, res) => {
        // biome-ignore lint/suspicious/noExplicitAny: Node http types are permissive
        (res as any).end('hi');
      }, squatted);
      track(() => closeServer(squatter));

      const app = createApp(new Store(), { version: 'me' }, { bindHost: '127.0.0.1' });
      await expect(
        discover({
          app,
          port: squatted,
          host: '127.0.0.1',
          portExplicit: true,
        }),
      ).rejects.toThrow(/non-mdscroll/);
    });
  });

  describe('port === 0', () => {
    it('skips discovery and binds on a random free port', async () => {
      const app = createApp(new Store(), { version: 'me' }, { bindHost: '127.0.0.1' });
      const decision = await discover({ app, port: 0, host: '127.0.0.1' });

      expect(decision.mode).toBe('server');
      if (decision.mode === 'server') {
        expect(decision.handle.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
        track(() => decision.handle.close());
      }
    });
  });
});
