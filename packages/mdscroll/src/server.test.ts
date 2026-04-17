import { beforeAll, describe, expect, it } from 'vitest';
import { warmup } from './render.js';
import { createApp } from './server.js';
import { Store } from './state.js';

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

    it('renders and embeds the markdown from the store', async () => {
      const store = new Store();
      store.set('# Hello World');
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
    it('updates the store with the request body', async () => {
      const store = new Store();
      const app = createApp(store);
      await app.request('/push', {
        method: 'POST',
        body: '# Pushed',
      });
      expect(store.get().markdown).toBe('# Pushed');
    });

    it('returns the new version number', async () => {
      const store = new Store();
      const app = createApp(store);
      const res = await app.request('/push', { method: 'POST', body: 'a' });
      const json = (await res.json()) as { ok: boolean; version: number };
      expect(json).toEqual({ ok: true, version: 1 });
    });

    it('advances the version on each push', async () => {
      const store = new Store();
      const app = createApp(store);
      await app.request('/push', { method: 'POST', body: 'a' });
      await app.request('/push', { method: 'POST', body: 'b' });
      const res = await app.request('/push', { method: 'POST', body: 'c' });
      const json = (await res.json()) as { ok: boolean; version: number };
      expect(json.version).toBe(3);
    });

    it('accepts an empty body', async () => {
      const store = new Store();
      const app = createApp(store);
      const res = await app.request('/push', { method: 'POST', body: '' });
      expect(res.status).toBe(200);
      expect(store.get().markdown).toBe('');
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
