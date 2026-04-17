import { serve, type ServerType } from '@hono/node-server';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { Store } from '../store/state.js';
import { CLIENT_JS, INDEX_HTML, STYLES_CSS } from './client.js';
import { render } from './render.js';

export const EMPTY_PLACEHOLDER = [
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

export const createApp = (store: Store): Hono => {
  const app = new Hono();

  app.get('/', async (c) => {
    const snapshot = store.get();
    const source = snapshot.markdown || EMPTY_PLACEHOLDER;
    const html = await render(source);
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
    const snapshot = store.set(body);
    return c.json({ ok: true, version: snapshot.version });
  });

  app.get('/events', (c) => {
    return streamSSE(c, async (stream) => {
      const sendSnapshot = async (markdown: string, version: number) => {
        const source = markdown || EMPTY_PLACEHOLDER;
        const html = await render(source);
        await stream.writeSSE({
          event: 'update',
          data: JSON.stringify({ html, version }),
        });
      };

      const initial = store.get();
      await sendSnapshot(initial.markdown, initial.version);

      let aborted = false;
      const unsubscribe = store.subscribe((snapshot) => {
        if (aborted) return;
        void sendSnapshot(snapshot.markdown, snapshot.version);
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
