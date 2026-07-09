import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  MAX_DOCS_TOTAL,
  MAX_KEY_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_MARKDOWN_BYTES,
} from '../constants.js';
import { Store } from '../store/state.js';
import { createApp, type HonoApp } from './app.js';
import { warmup } from './render.js';
import { createWatchers, type Watchers } from './watcher.js';

const META = { version: '0.0.0-test' };

let cleanups: Array<() => void | Promise<unknown>> = [];

beforeAll(async () => {
  await warmup();
}, 30_000);

afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  cleanups = [];
});

const buildApp = (): { app: HonoApp; store: Store; watchers: Watchers } => {
  const store = new Store();
  const watchers = createWatchers(store);
  cleanups.push(() => watchers.close());
  return { app: createApp(store, watchers, META), store, watchers };
};

const makeTempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mdscroll-app-test-'));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  return dir;
};

const putDoc = async (app: HonoApp, key: string, body: unknown): Promise<Response> =>
  app.request(`/_/docs/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const fillStore = (store: Store): void => {
  for (let i = 0; i < MAX_DOCS_TOTAL; i += 1) {
    store.upsert({
      key: `doc-${i}`,
      label: `doc-${i}`,
      kind: 'static',
      watched: false,
      stale: false,
      markdown: 'x',
      html: '<p>x</p>',
    });
  }
};

type SseEvent = { event: string; data: string };

const openSse = async (app: HonoApp): Promise<{ res: Response; next: () => Promise<SseEvent> }> => {
  const res = await app.request('/events');
  if (!res.body) throw new Error('SSE response has no body');
  const reader = res.body.getReader();
  cleanups.push(() => reader.cancel().catch(() => undefined));
  const decoder = new TextDecoder();
  let buffer = '';
  const pending: SseEvent[] = [];
  const next = async (): Promise<SseEvent> => {
    while (pending.length === 0) {
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('timed out waiting for an SSE event')), 2000).unref();
        }),
      ]);
      if (chunk.done) throw new Error('SSE stream closed before the expected event');
      buffer += decoder.decode(chunk.value, { stream: true });
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        pending.push({
          event: raw.match(/^event: (.*)$/m)?.[1] ?? '',
          data: raw
            .split('\n')
            .filter((line) => line.startsWith('data: '))
            .map((line) => line.slice('data: '.length))
            .join('\n'),
        });
        boundary = buffer.indexOf('\n\n');
      }
    }
    const event = pending.shift();
    if (!event) throw new Error('SSE queue was unexpectedly empty');
    return event;
  };
  return { res, next };
};

describe('host gate', () => {
  it('rejects a non-loopback Host on the UI surface with 403', async () => {
    const { app } = buildApp();

    const res = await app.request('/', { headers: { host: 'evil.com' } });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'loopback only' });
  });

  it('rejects a non-loopback Host on the docs surface with 403', async () => {
    const { app } = buildApp();

    const res = await app.request('/_/docs', { headers: { host: 'evil.com' } });

    expect(res.status).toBe(403);
  });

  it.each(['127.0.0.1:4977', 'localhost', '[::1]:1'])('allows Host %s', async (host) => {
    const { app } = buildApp();

    const res = await app.request('/', { headers: { host } });

    expect(res.status).toBe(200);
  });
});

describe('GET /_/health', () => {
  it('reports agent, version, pid, and doc count', async () => {
    const { app } = buildApp();

    const res = await app.request('/_/health');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      agent: 'mdscroll',
      version: META.version,
      pid: process.pid,
      docs: 0,
    });
  });
});

describe('PUT /_/docs/:key with static content', () => {
  it('creates a doc and returns 201 with created: true', async () => {
    const { app, store } = buildApp();

    const res = await putDoc(app, 'plan.md', { markdown: '# hi' });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ key: 'plan.md', created: true });
    const doc = store.get('plan.md');
    expect(doc?.markdown).toBe('# hi');
    expect(doc?.kind).toBe('static');
    expect(doc?.watched).toBe(false);
  });

  it('replaces an existing doc and returns 200 with created: false', async () => {
    const { app, store } = buildApp();
    await putDoc(app, 'plan.md', { markdown: 'first' });

    const res = await putDoc(app, 'plan.md', { markdown: 'second' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ key: 'plan.md', created: false });
    expect(store.get('plan.md')?.markdown).toBe('second');
  });

  it('rejects a body without markdown with 400', async () => {
    const { app } = buildApp();

    const res = await putDoc(app, 'plan.md', {});

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      'markdown is required for static docs',
    );
  });

  it('rejects a non-JSON body with 400', async () => {
    const { app } = buildApp();

    const res = await app.request('/_/docs/plan.md', {
      method: 'PUT',
      body: 'not json',
    });

    expect(res.status).toBe(400);
  });

  it('rejects a non-string markdown with 400', async () => {
    const { app } = buildApp();

    const res = await putDoc(app, 'plan.md', { markdown: 42 });

    expect(res.status).toBe(400);
  });

  it('rejects a non-string label with 400', async () => {
    const { app } = buildApp();

    const res = await putDoc(app, 'plan.md', { markdown: 'x', label: 123 });

    expect(res.status).toBe(400);
  });

  it('rejects a label over the length cap with 413', async () => {
    const { app } = buildApp();

    const res = await putDoc(app, 'plan.md', {
      markdown: 'x',
      label: 'x'.repeat(MAX_LABEL_LENGTH + 1),
    });

    expect(res.status).toBe(413);
  });

  it('rejects a key containing control characters with 400', async () => {
    const { app } = buildApp();

    const res = await putDoc(app, 'bad\u0000key', { markdown: 'x' });

    expect(res.status).toBe(400);
  });

  it('rejects a key over the length cap with 400', async () => {
    const { app } = buildApp();

    const res = await putDoc(app, 'a'.repeat(MAX_KEY_LENGTH + 1), { markdown: 'x' });

    expect(res.status).toBe(400);
  });
});

describe('key encoding', () => {
  // Load-bearing: keys are absolute paths PUT as one encoded segment, so
  // Hono must match %2F (and %20) inside a single :key param.
  it('round-trips a path key with slashes and spaces through one encoded segment', async () => {
    const { app, store } = buildApp();
    const key = '/tmp/some dir/plan.md';

    const created = await putDoc(app, key, { markdown: '# doc' });

    expect(created.status).toBe(201);
    const listed = (await (await app.request('/_/docs')).json()) as {
      docs: Array<{ key: string }>;
    };
    expect(listed.docs.map((d) => d.key)).toEqual([key]);

    const deleted = await app.request(`/_/docs/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    });

    expect(deleted.status).toBe(204);
    expect(store.get(key)).toBeNull();
  });
});

describe('PUT /_/docs/:key with a file path', () => {
  it('reads content from disk and attaches a watcher', async () => {
    const { app, store } = buildApp();
    const dir = await makeTempDir();
    const path = join(dir, 'plan.md');
    await writeFile(path, '# From Disk\n', 'utf-8');

    const res = await putDoc(app, path, { path, watch: true });

    expect(res.status).toBe(201);
    const doc = store.get(path);
    expect(doc?.kind).toBe('file');
    expect(doc?.watched).toBe(true);
    expect(doc?.stale).toBe(false);
    expect(doc?.markdown).toBe('# From Disk\n');
    expect(doc?.label).toBe('plan.md');
  });

  it('rejects a relative path with 400', async () => {
    const { app } = buildApp();

    const res = await putDoc(app, 'plan.md', { path: 'relative/plan.md' });

    expect(res.status).toBe(400);
  });

  it('rejects a directory path with 400', async () => {
    const { app } = buildApp();
    const dir = await makeTempDir();

    const res = await putDoc(app, dir, { path: dir });

    expect(res.status).toBe(400);
  });

  it('creates a stale doc from fallback markdown when the path is unreadable', async () => {
    const { app, store } = buildApp();
    const dir = await makeTempDir();
    const path = join(dir, 'missing.md');

    const res = await putDoc(app, path, { path, markdown: '# fallback' });

    expect(res.status).toBe(201);
    const doc = store.get(path);
    expect(doc?.stale).toBe(true);
    expect(doc?.markdown).toBe('# fallback');
    expect(doc?.watched).toBe(true);
  });

  it('rejects an unreadable path without fallback markdown with 422', async () => {
    const { app, store } = buildApp();
    const dir = await makeTempDir();
    const path = join(dir, 'missing.md');

    const res = await putDoc(app, path, { path });

    expect(res.status).toBe(422);
    expect(store.get(path)).toBeNull();
  });

  it('leaves the existing doc and its watcher intact when a replace is rejected', async () => {
    const { app, store } = buildApp();
    const dir = await makeTempDir();
    const path = join(dir, 'plan.md');
    await writeFile(path, '# v1\n', 'utf-8');
    await putDoc(app, path, { path, watch: true });

    // Re-PUT the same key with an invalid (relative) path — must reject
    // without touching the live doc or detaching its watcher.
    const res = await putDoc(app, path, { path: 'relative.md' });
    expect(res.status).toBe(400);
    expect(store.get(path)?.watched).toBe(true);

    // The original watcher is still live: an edit propagates.
    await writeFile(path, '# v2\n', 'utf-8');
    await vi.waitFor(
      () => {
        expect(store.get(path)?.markdown).toBe('# v2\n');
      },
      { timeout: 3000 },
    );
  });

  it('skips watching when watch is false', async () => {
    const { app, store } = buildApp();
    const dir = await makeTempDir();
    const path = join(dir, 'plan.md');
    await writeFile(path, 'unwatched', 'utf-8');

    const res = await putDoc(app, path, { path, watch: false });

    expect(res.status).toBe(201);
    const doc = store.get(path);
    expect(doc?.watched).toBe(false);
    expect(doc?.stale).toBe(false);
    expect(doc?.markdown).toBe('unwatched');
  });
});

describe('admission caps', () => {
  it('rejects markdown over the byte cap with 413', async () => {
    const { app } = buildApp();

    const res = await putDoc(app, 'big.md', { markdown: 'a'.repeat(MAX_MARKDOWN_BYTES + 1) });

    expect(res.status).toBe(413);
  });

  it('rejects a new key with 429 when the store is full', async () => {
    const { app, store } = buildApp();
    fillStore(store);

    const res = await putDoc(app, 'one-more.md', { markdown: 'x' });

    expect(res.status).toBe(429);
  });

  it('still replaces an existing key when the store is full', async () => {
    const { app, store } = buildApp();
    fillStore(store);

    const res = await putDoc(app, 'doc-0', { markdown: 'replaced' });

    expect(res.status).toBe(200);
    expect(store.get('doc-0')?.markdown).toBe('replaced');
  });
});

describe('DELETE /_/docs/:key', () => {
  it('returns 204 for an absent key', async () => {
    const { app } = buildApp();

    const res = await app.request('/_/docs/absent.md', { method: 'DELETE' });

    expect(res.status).toBe(204);
  });
});

describe('GET /_/docs', () => {
  it('lists summaries without markdown or html', async () => {
    const { app } = buildApp();
    await putDoc(app, 'plan.md', { markdown: '# hi' });

    const res = await app.request('/_/docs');

    expect(res.status).toBe(200);
    const body = (await res.json()) as { docs: Array<Record<string, unknown>> };
    expect(body.docs).toHaveLength(1);
    expect(Object.keys(body.docs[0] ?? {}).sort()).toEqual([
      'key',
      'kind',
      'label',
      'stale',
      'updatedAt',
      'watched',
    ]);
  });
});

describe('GET /events', () => {
  it('sends an init event carrying pre-rendered docs', async () => {
    const { app } = buildApp();
    await putDoc(app, 'a.md', { markdown: '# Init Doc' });

    const { res, next } = await openSse(app);
    const init = await next();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    expect(init.event).toBe('init');
    const payload = JSON.parse(init.data) as { docs: Array<{ key: string; html: string }> };
    expect(payload.docs).toHaveLength(1);
    expect(payload.docs[0]?.key).toBe('a.md');
    expect(payload.docs[0]?.html).toContain('<h1>Init Doc</h1>');
  });

  it('emits an added event with html for a doc registered after connecting', async () => {
    const { app } = buildApp();
    const { next } = await openSse(app);
    const init = await next();
    expect(init.event).toBe('init');

    await putDoc(app, 'later.md', { markdown: '# Later' });
    const added = await next();

    expect(added.event).toBe('added');
    const payload = JSON.parse(added.data) as { doc: { key: string; html: string } };
    expect(payload.doc.key).toBe('later.md');
    expect(payload.doc.html).toContain('<h1>Later</h1>');
  });
});
