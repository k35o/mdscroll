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

export const createApp = (store: Store): Hono => {
  const app = new Hono();

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

  app.post('/push', async (c) => {
    const body = await c.req.text();
    const source = c.req.header('X-Mdscroll-Source') ?? 'unknown';
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

export const startServer = async (opts: { port: number; host: string }): Promise<ServerHandle> => {
  const store = new Store();
  const app = createApp(store);

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
