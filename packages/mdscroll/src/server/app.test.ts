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

    it('sets a strict Content-Security-Policy header', async () => {
      const app = createApp(new Store());
      const res = await app.request('/');
      const csp = res.headers.get('content-security-policy');
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain('https://cdn.jsdelivr.net');
    });

    it('shows the placeholder when the store is empty', async () => {
      const app = createApp(new Store());
      const res = await app.request('/');
      const body = await res.text();
      expect(body).toContain('No content yet');
    });

    it('uses the fallback source label when the store is empty', async () => {
      const app = createApp(new Store());
      const body = await (await app.request('/')).text();
      expect(body).toContain('(untitled)');
    });

    it('renders and embeds the current snapshot from the store', async () => {
      const store = new Store();
      store.setCurrent('# Hello World', 'plan.md');
      const app = createApp(store);
      const res = await app.request('/');
      const body = await res.text();
      expect(body).toContain('<h1>Hello World</h1>');
      expect(body).toContain('plan.md');
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

  describe('GET /events', () => {
    it('streams the initial snapshot as an SSE update event', async () => {
      const store = new Store();
      store.setCurrent('# first', 'a.md');
      const app = createApp(store);

      const res = await app.request('/events');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);

      const reader = res.body?.getReader();
      if (!reader) throw new Error('expected SSE body');

      const decoder = new TextDecoder();
      const { value, done } = await reader.read();
      if (done) throw new Error('stream closed early');
      const chunk = decoder.decode(value);
      expect(chunk).toContain('event: update');
      expect(chunk).toContain('<h1>first</h1>');
      expect(chunk).toContain('a.md');

      await reader.cancel();
    });

    it('pushes a new SSE update when the store changes after the stream opens', async () => {
      const store = new Store();
      const app = createApp(store);

      const res = await app.request('/events');
      const reader = res.body?.getReader();
      if (!reader) throw new Error('expected SSE body');
      const decoder = new TextDecoder();

      // Initial chunk contains the placeholder.
      await reader.read();

      // Drain microtasks so the handler reaches its subscribe() call.
      await new Promise((r) => setTimeout(r, 20));
      store.setCurrent('# live update', 'plan.md');

      let buffer = '';
      while (!buffer.includes('live update')) {
        const { value, done } = await reader.read();
        if (done) throw new Error('stream closed before update arrived');
        buffer += decoder.decode(value);
      }
      expect(buffer).toContain('<h1>live update</h1>');
      expect(buffer).toContain('plan.md');

      await reader.cancel();
    });
  });

  describe('unknown routes', () => {
    it('returns 404 for GET /unknown', async () => {
      const app = createApp(new Store());
      const res = await app.request('/unknown');
      expect(res.status).toBe(404);
    });

    it('returns 404 for POST /push (removed in 0.2.0)', async () => {
      const app = createApp(new Store());
      const res = await app.request('/push', { method: 'POST', body: 'x' });
      expect(res.status).toBe(404);
    });

    it('returns 404 for GET /identity (removed in 0.2.0)', async () => {
      const app = createApp(new Store());
      const res = await app.request('/identity');
      expect(res.status).toBe(404);
    });
  });
});
