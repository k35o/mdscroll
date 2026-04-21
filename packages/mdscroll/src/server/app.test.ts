import { beforeAll, describe, expect, it } from 'vitest';
import { Store } from '../store/state.js';
import { createApp } from './app.js';
import { warmup } from './render.js';

const META = { version: '0.0.0-test' };

const buildApp = (store: Store = new Store()) => createApp(store, META, { bindHost: '127.0.0.1' });

beforeAll(async () => {
  await warmup();
}, 30_000);

describe('createApp', () => {
  describe('GET /', () => {
    it('returns an HTML document with a strict CSP', async () => {
      const res = await buildApp().request('/');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/text\/html/);
      const csp = res.headers.get('content-security-policy');
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain('https://cdn.jsdelivr.net');
    });

    it('renders the app shell (no server-embedded content)', async () => {
      const body = await (await buildApp().request('/')).text();
      // Tabs and content placeholders live in the shell. Content is
      // filled in from SSE — no doc HTML appears in the static response.
      expect(body).toContain('id="mdscroll-tabs"');
      expect(body).toContain('id="mdscroll-content"');
      expect(body).toContain('No documents yet');
    });

    it('links the stylesheet and module script', async () => {
      const body = await (await buildApp().request('/')).text();
      expect(body).toContain('href="/style.css"');
      expect(body).toContain('src="/main.js"');
    });
  });

  describe('GET /style.css', () => {
    it('returns CSS with a text/css content type', async () => {
      const res = await buildApp().request('/style.css');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/text\/css/);
    });
  });

  describe('GET /main.js', () => {
    it('returns JS with an application/javascript content type', async () => {
      const res = await buildApp().request('/main.js');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/application\/javascript/);
    });

    it('includes the SSE client code', async () => {
      const body = await (await buildApp().request('/main.js')).text();
      expect(body).toContain("new EventSource('/events')");
    });
  });

  describe('GET /_/health', () => {
    it('identifies as mdscroll with version and pid', async () => {
      const res = await buildApp().request('/_/health');
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        agent: string;
        version: string;
        pid: number;
      };
      expect(body.agent).toBe('mdscroll');
      expect(body.version).toBe(META.version);
      expect(body.pid).toBe(process.pid);
    });
  });

  describe('POST /_/docs', () => {
    it('creates a doc and returns id + token', async () => {
      const store = new Store();
      const res = await buildApp(store).request('/_/docs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: 'plan.md', markdown: '# hi' }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string; token: string };
      expect(body.id).toBeTypeOf('string');
      expect(body.token).toBeTypeOf('string');
      expect(store.get(body.id)?.markdown).toBe('# hi');
    });

    it('rejects a request without markdown', async () => {
      const res = await buildApp().request('/_/docs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: 'x' }),
      });
      expect(res.status).toBe(400);
    });

    it('rejects markdown that exceeds the byte cap', async () => {
      const big = 'a'.repeat(10 * 1024 * 1024 + 1);
      const res = await buildApp().request('/_/docs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: 's', markdown: big }),
      });
      expect(res.status).toBe(413);
    });

    it('rejects a source label that exceeds the length cap', async () => {
      const res = await buildApp().request('/_/docs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: 'x'.repeat(1025), markdown: 'y' }),
      });
      expect(res.status).toBe(413);
    });

    it('rejects ownerPid === process.pid (cannot opt out of liveness GC)', async () => {
      const store = new Store();
      const res = await buildApp(store).request('/_/docs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: 's',
          markdown: 'x',
          ownerPid: process.pid,
        }),
      });
      expect(res.status).toBe(201);
      // ownerPid is silently dropped (treated as not provided).
      const { id } = (await res.json()) as { id: string };
      expect(store.get(id)?.ownerPid).toBeUndefined();
    });

    it('upserts when the same instanceId POSTs twice (no duplicate doc)', async () => {
      const store = new Store();
      const app = buildApp(store);
      const first = await app.request('/_/docs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: 's',
          markdown: 'x',
          instanceId: 'client-1',
        }),
      });
      expect(first.status).toBe(201);
      const { id: firstId } = (await first.json()) as { id: string };

      const second = await app.request('/_/docs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: 's',
          markdown: 'y',
          instanceId: 'client-1',
        }),
      });
      expect(second.status).toBe(201);
      const { id: secondId } = (await second.json()) as { id: string };

      expect(secondId).toBe(firstId);
      expect(store.list()).toHaveLength(1);
      expect(store.get(firstId)?.markdown).toBe('y');
    });
  });

  describe('PUT /_/docs/:id', () => {
    const seed = async (store: Store) => {
      const app = buildApp(store);
      const postRes = await app.request('/_/docs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: 's', markdown: 'x' }),
      });
      const { id, token } = (await postRes.json()) as {
        id: string;
        token: string;
      };
      return { app, id, token };
    };

    it('updates the doc when the token matches', async () => {
      const store = new Store();
      const { app, id, token } = await seed(store);
      const res = await app.request(`/_/docs/${id}`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ markdown: 'y' }),
      });
      expect(res.status).toBe(204);
      expect(store.get(id)?.markdown).toBe('y');
    });

    it('rejects a mismatched token with 401', async () => {
      const { app, id } = await seed(new Store());
      const res = await app.request(`/_/docs/${id}`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer nope',
        },
        body: JSON.stringify({ markdown: 'y' }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /_/docs/:id', () => {
    it('removes the doc when the token matches', async () => {
      const store = new Store();
      const app = buildApp(store);
      const postRes = await app.request('/_/docs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: 's', markdown: 'x' }),
      });
      const { id, token } = (await postRes.json()) as {
        id: string;
        token: string;
      };
      const res = await app.request(`/_/docs/${id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(204);
      expect(store.get(id)).toBeNull();
    });
  });

  describe('GET /events', () => {
    it('streams an initial event carrying every doc currently in the store', async () => {
      const store = new Store();
      store.add({ source: 'a.md', markdown: '# first' });
      store.add({ source: 'b.md', markdown: '# second' });

      const res = await buildApp(store).request('/events');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);

      const reader = res.body?.getReader();
      if (!reader) throw new Error('expected SSE body');
      const decoder = new TextDecoder();

      let buffer = '';
      while (!buffer.includes('event: init')) {
        const { value, done } = await reader.read();
        if (done) throw new Error('stream closed before init');
        buffer += decoder.decode(value);
      }
      expect(buffer).toContain('<h1>first</h1>');
      expect(buffer).toContain('<h1>second</h1>');
      await reader.cancel();
    });

    it('pushes an added event when the store gains a doc after the stream opens', async () => {
      const store = new Store();
      const res = await buildApp(store).request('/events');
      const reader = res.body?.getReader();
      if (!reader) throw new Error('expected SSE body');
      const decoder = new TextDecoder();

      // Drain the initial event first.
      await reader.read();
      // Let the handler reach its subscribe() call.
      await new Promise((r) => setTimeout(r, 20));
      store.add({ source: 'plan.md', markdown: '# live' });

      let buffer = '';
      while (!buffer.includes('event: added')) {
        const { value, done } = await reader.read();
        if (done) throw new Error('stream closed before added');
        buffer += decoder.decode(value);
      }
      expect(buffer).toContain('<h1>live</h1>');
      expect(buffer).toContain('plan.md');

      await reader.cancel();
    });
  });

  describe('unknown routes', () => {
    it('returns 404 for GET /unknown', async () => {
      const res = await buildApp().request('/unknown');
      expect(res.status).toBe(404);
    });
  });
});
