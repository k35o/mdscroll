import { serve, type ServerType } from '@hono/node-server';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { type Snapshot, Store, toMeta } from '../store/state.js';
import { CLIENT_JS, INDEX_HTML, STYLES_CSS } from './client.js';
import { render } from './render.js';

const EMPTY_PLACEHOLDER = [
  '# mdscroll',
  '',
  'No content yet. Push some markdown to see it here:',
  '',
  '```bash',
  'echo "# hello" | mdscroll push',
  'mdscroll push plan.md',
  '```',
].join('\n');

export type ServerHandle = {
  url: string;
  store: Store;
  close: () => Promise<void>;
};

const renderCurrent = (current: Snapshot | null): Promise<string> =>
  render(current?.markdown ?? EMPTY_PLACEHOLDER);

export type CreateAppOptions = {
  identity?: string | undefined;
};

export const createApp = (store: Store, options: CreateAppOptions = {}): Hono => {
  const app = new Hono();
  const identity = options.identity;

  app.get('/identity', (c) => {
    // Returned so `mdscroll stop` can prove this server is ours before
    // sending SIGTERM. Empty when the caller never set one (e.g. in
    // tests), and that case is treated as "can't verify".
    return c.json({ identity: identity ?? '' });
  });

  app.get('/', async (c) => {
    const html = await renderCurrent(store.current());
    const page = INDEX_HTML.replace('{{CONTENT}}', html);
    return c.html(page);
  });

  app.get('/style.css', (c) => {
    c.header('Content-Type', 'text/css; charset=utf-8');
    c.header('Cache-Control', 'no-cache');
    return c.body(STYLES_CSS);
  });

  app.get('/main.js', (c) => {
    c.header('Content-Type', 'application/javascript; charset=utf-8');
    c.header('Cache-Control', 'no-cache');
    return c.body(CLIENT_JS);
  });

  // Upper bound on a single push. 5 MiB comfortably fits a long plan
  // with embedded diagrams while making bulk DoS noticeably harder.
  const MAX_PUSH_BYTES = 5 * 1024 * 1024;

  app.post('/push', async (c) => {
    // CSRF guard: require the custom header we set in commands/push.ts.
    // Browsers cannot send custom headers cross-origin without a CORS
    // preflight, and we never answer preflights, so a random webpage
    // cannot forge a push against localhost:4977.
    const source = c.req.header('X-Mdscroll-Source');
    if (typeof source !== 'string' || source.length === 0) {
      return c.json({ error: 'X-Mdscroll-Source header is required' }, { status: 400 });
    }

    const declared = c.req.header('content-length');
    if (declared !== undefined) {
      const declaredLen = Number(declared);
      if (!Number.isFinite(declaredLen) || declaredLen > MAX_PUSH_BYTES) {
        return c.json({ error: 'payload too large' }, { status: 413 });
      }
    }

    const body = await c.req.text();
    if (Buffer.byteLength(body, 'utf-8') > MAX_PUSH_BYTES) {
      return c.json({ error: 'payload too large' }, { status: 413 });
    }

    const snapshot = store.push(body, source);
    return c.json({ ok: true, id: snapshot.id });
  });

  app.get('/api/snapshot/:id', async (c) => {
    const id = c.req.param('id');
    const snapshot = store.byId(id);
    if (!snapshot) return c.json({ error: 'not found' }, 404);
    const html = await render(snapshot.markdown);
    return c.json({
      html,
      source: snapshot.source,
      createdAt: snapshot.createdAt,
    });
  });

  app.get('/events', (c) => {
    return streamSSE(c, async (stream) => {
      const sendUpdate = async (current: Snapshot | null) => {
        const html = await renderCurrent(current);
        await stream.writeSSE({
          event: 'update',
          data: JSON.stringify({
            html,
            current: current ? toMeta(current) : null,
            history: store.history().map(toMeta),
          }),
        });
      };

      await sendUpdate(store.current());

      let aborted = false;
      const unsubscribe = store.subscribe((snapshot) => {
        if (aborted) return;
        void sendUpdate(snapshot);
      });

      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          aborted = true;
          unsubscribe();
          resolve();
        });
      });
    });
  });

  return app;
};

export const startServer = async (opts: {
  port: number;
  host: string;
  identity?: string | undefined;
}): Promise<ServerHandle> => {
  const store = new Store();
  const app = createApp(store, { identity: opts.identity });

  const server: ServerType = serve({
    fetch: app.fetch,
    port: opts.port,
    hostname: opts.host,
  });

  const url = `http://${opts.host}:${opts.port}`;

  const close = () =>
    new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

  return { url, store, close };
};
