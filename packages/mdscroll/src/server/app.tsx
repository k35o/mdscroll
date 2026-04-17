import { serve, type ServerType } from '@hono/node-server';
import { Hono } from 'hono';
import { html } from 'hono/html';
import { streamSSE } from 'hono/streaming';
import { displaySourceLabel } from '../source.js';
import { type Snapshot, Store } from '../store/state.js';
import { CLIENT_JS, Document, STYLES_CSS } from './client.js';
import { render } from './render.js';

const EMPTY_PLACEHOLDER = ['# mdscroll', '', 'No content yet.'].join('\n');
const EMPTY_SOURCE = '(untitled)';

export type ServerHandle = {
  url: string;
  close: () => Promise<void>;
};

const renderCurrent = (current: Snapshot | null): Promise<string> =>
  render(current?.markdown ?? EMPTY_PLACEHOLDER);

const sourceOf = (current: Snapshot | null): string =>
  displaySourceLabel(current?.source ?? EMPTY_SOURCE);

export const createApp = (store: Store): Hono => {
  const app = new Hono();

  // Content-Security-Policy for the HTML document. Restricts where the
  // page can load scripts, styles, connections, etc. The one remote
  // origin we allow is cdn.jsdelivr.net because Mermaid is loaded from
  // there via dynamic import; everything else must be same-origin.
  const CSP = [
    "default-src 'self'",
    // Mermaid ESM is fetched from cdn.jsdelivr.net at a pinned version.
    "script-src 'self' https://cdn.jsdelivr.net",
    // Inline styles used by Shiki tokens.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');

  app.get('/', async (c) => {
    const current = store.current();
    const contentHtml = await renderCurrent(current);
    c.header('Content-Security-Policy', CSP);
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    return c.html(
      html`<!doctype html>${<Document contentHtml={contentHtml} source={sourceOf(current)} />}`,
    );
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

  app.get('/events', (c) => {
    return streamSSE(c, async (stream) => {
      const sendUpdate = async (current: Snapshot | null) => {
        const rendered = await renderCurrent(current);
        await stream.writeSSE({
          event: 'update',
          data: JSON.stringify({ html: rendered, source: sourceOf(current) }),
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
  store: Store;
}): Promise<ServerHandle> => {
  const app = createApp(opts.store);

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

  return { url, close };
};
