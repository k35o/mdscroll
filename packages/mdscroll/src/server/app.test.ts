import type { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import { Store } from '../store/state.js';
import { createApp } from './app.js';
import { warmup } from './render.js';

beforeAll(async () => {
  await warmup();
}, 30_000);

describe('createApp', () => {
  describe('GET /', () => {
    it('returns an HTML document', async () => {
      const app = createApp(new Store());
      const res = await app.request('/');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/text\/html/);
    });

    it('shows the placeholder when the store is empty', async () => {
      const app = createApp(new Store());
      const res = await app.request('/');
      const body = await res.text();
      expect(body).toContain('No content yet');
    });

    it('renders and embeds the current snapshot from the store', async () => {
      const store = new Store();
      store.push('# Hello World', 'test');
      const app = createApp(store);
      const res = await app.request('/');
      const body = await res.text();
      expect(body).toContain('<h1>Hello World</h1>');
    });

    it('includes a link to the stylesheet', async () => {
      const app = createApp(new Store());
      const body = await (await app.request('/')).text();
      expect(body).toContain('href="/style.css"');
    });
  });

  describe('GET /style.css', () => {
    it('returns CSS with a text/css content type', async () => {
      const app = createApp(new Store());
      const res = await app.request('/style.css');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/text\/css/);
    });
  });

  describe('GET /main.js', () => {
    it('returns JS with an application/javascript content type', async () => {
      const app = createApp(new Store());
      const res = await app.request('/main.js');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/application\/javascript/);
    });

    it('includes the SSE client code', async () => {
      const app = createApp(new Store());
      const body = await (await app.request('/main.js')).text();
      expect(body).toContain("new EventSource('/events')");
    });
  });

  describe('POST /push', () => {
    const push = (app: Hono, body: string, source = 'test') =>
      app.request('/push', {
        method: 'POST',
        body,
        headers: { 'X-Mdscroll-Source': source },
      });

    it('appends a new snapshot to the store', async () => {
      const store = new Store();
      const app = createApp(store);
      await push(app, '# Pushed');
      expect(store.current()?.markdown).toBe('# Pushed');
    });

    it('uses X-Mdscroll-Source header as the snapshot source', async () => {
      const store = new Store();
      const app = createApp(store);
      await push(app, 'hi', 'plan.md');
      expect(store.current()?.source).toBe('plan.md');
    });

    it('rejects requests without the X-Mdscroll-Source header with 400', async () => {
      const store = new Store();
      const app = createApp(store);
      const res = await app.request('/push', { method: 'POST', body: 'hi' });
      expect(res.status).toBe(400);
      expect(store.current()).toBeNull();
    });

    it('rejects requests with an empty source header with 400', async () => {
      const store = new Store();
      const app = createApp(store);
      const res = await app.request('/push', {
        method: 'POST',
        body: 'hi',
        headers: { 'X-Mdscroll-Source': '' },
      });
      expect(res.status).toBe(400);
      expect(store.current()).toBeNull();
    });

    it('returns the new snapshot id', async () => {
      const store = new Store();
      const app = createApp(store);
      const res = await push(app, 'a');
      const json = (await res.json()) as { ok: boolean; id: string };
      expect(json.ok).toBe(true);
      expect(typeof json.id).toBe('string');
    });

    it('keeps history newest-first across multiple pushes', async () => {
      const store = new Store();
      const app = createApp(store);
      await push(app, 'a');
      await push(app, 'b');
      await push(app, 'c');
      expect(store.history().map((s) => s.markdown)).toEqual(['c', 'b', 'a']);
    });

    it('rejects payloads larger than 5 MiB with 413', async () => {
      const store = new Store();
      const app = createApp(store);
      const big = 'x'.repeat(5 * 1024 * 1024 + 1);
      const res = await push(app, big);
      expect(res.status).toBe(413);
      expect(store.current()).toBeNull();
    });
  });

  describe('GET /api/snapshot/:id', () => {
    it('returns rendered HTML for a known snapshot', async () => {
      const store = new Store();
      const snap = store.push('# alpha', 'plan.md');
      const app = createApp(store);

      const res = await app.request(`/api/snapshot/${snap.id}`);
      const json = (await res.json()) as {
        html: string;
        source: string;
        createdAt: number;
      };

      expect(res.status).toBe(200);
      expect(json.html).toContain('<h1>alpha</h1>');
      expect(json.source).toBe('plan.md');
    });

    it('returns 404 for an unknown id', async () => {
      const app = createApp(new Store());
      const res = await app.request('/api/snapshot/missing');
      expect(res.status).toBe(404);
    });
  });

  describe('unknown routes', () => {
    it('returns 404 for GET /unknown', async () => {
      const app = createApp(new Store());
      const res = await app.request('/unknown');
      expect(res.status).toBe(404);
    });
  });
});
