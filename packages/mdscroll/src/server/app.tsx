import { stat } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { basename, isAbsolute } from 'node:path';
import type { HttpBindings } from '@hono/node-server';
import { Hono } from 'hono';
import { html } from 'hono/html';
import { streamSSE } from 'hono/streaming';
import {
  MAX_DOCS_TOTAL,
  MAX_KEY_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_MARKDOWN_BYTES,
} from '../constants.js';
import { displaySourceLabel } from '../source.js';
import type { DocKind, DocPublic, Store } from '../store/state.js';
import { CLIENT_JS, Document, STYLES_CSS } from './client.js';
import { render } from './render.js';
import type { Watchers } from './watcher.js';

type Env = { Bindings: HttpBindings };

/** The shape of the Hono app we build — exported for bind. */
export type HonoApp = Hono<Env>;

export type ServerHandle = {
  url: string;
  close: () => Promise<void>;
};

type ServerMeta = { version: string };

/** Payload shape sent over SSE. The client mirrors this in CLIENT_JS. */
type DocPayload = {
  key: string;
  label: string;
  display: string;
  kind: DocKind;
  watched: boolean;
  stale: boolean;
  html: string;
  updatedAt: number;
};

const toPayload = (doc: DocPublic): DocPayload => ({
  key: doc.key,
  label: doc.label,
  display: displaySourceLabel(doc.label),
  kind: doc.kind,
  watched: doc.watched,
  stale: doc.stale,
  html: doc.html,
  updatedAt: doc.updatedAt,
});

const toSummary = (doc: DocPublic) => ({
  key: doc.key,
  label: doc.label,
  kind: doc.kind,
  watched: doc.watched,
  stale: doc.stale,
  updatedAt: doc.updatedAt,
});

/**
 * The write surface is tokenless, so the boundary that keeps it local is
 * this Host check, applied to EVERY route. A socket-address allowlist is
 * not enough: a DNS-rebound page (evil.com resolving to 127.0.0.1) makes
 * same-origin fetches that arrive FROM loopback — but its Host header
 * still says evil.com, which is exactly what we reject here.
 */
const ALLOWED_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

export const hostAllowed = (hostHeader: string | undefined): boolean => {
  if (!hostHeader) return false;
  const value = hostHeader.trim().toLowerCase();
  if (value.length === 0) return false;
  const hostname = value.startsWith('[')
    ? value.slice(0, value.indexOf(']') + 1)
    : (value.split(':')[0] ?? '');
  return ALLOWED_HOSTNAMES.has(hostname);
};

const LOOPBACK_ADDRESSES = new Set([
  '127.0.0.1',
  '::1',
  // IPv4-mapped IPv6 loopback that some Node configurations surface.
  '::ffff:127.0.0.1',
]);

// oxlint-disable-next-line no-control-regex -- rejecting control chars in keys is the point
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export type RegisterInput = {
  key: string;
  label?: string | undefined;
  path?: string | undefined;
  watch?: boolean | undefined;
  markdown?: string | undefined;
};

export type RegisterResult =
  | { ok: true; created: boolean; doc: DocPublic }
  | { ok: false; status: 400 | 413 | 422 | 429; error: string };

/**
 * The single doc-creation path. Both the HTTP PUT route and the server
 * process's own doc (in auto-serve) go through here — there is no
 * privileged registration.
 *
 * Transactional: every validation and the file read run BEFORE any
 * watcher or store mutation, so a rejected request leaves the existing
 * doc (and its watcher) exactly as it was — a bad replace can never strip
 * the live doc's watcher. Body markdown, when provided, is the fallback
 * content for a path the server cannot read (created stale, not rejected).
 */
export const registerDoc = async (
  store: Store,
  watchers: Watchers,
  input: RegisterInput,
): Promise<RegisterResult> => {
  const key = input.key;
  if (key.length === 0 || key.length > MAX_KEY_LENGTH || CONTROL_CHARS.test(key)) {
    return { ok: false, status: 400, error: 'invalid key' };
  }
  if (input.label !== undefined && input.label.length > MAX_LABEL_LENGTH) {
    return { ok: false, status: 413, error: `label exceeds ${MAX_LABEL_LENGTH} characters` };
  }
  if (
    input.markdown !== undefined &&
    Buffer.byteLength(input.markdown, 'utf-8') > MAX_MARKDOWN_BYTES
  ) {
    return { ok: false, status: 413, error: `markdown exceeds ${MAX_MARKDOWN_BYTES} bytes` };
  }
  if (!store.get(key) && store.size() >= MAX_DOCS_TOTAL) {
    return { ok: false, status: 429, error: 'too many docs on the server' };
  }

  const kind: DocKind = input.path !== undefined ? 'file' : 'static';
  let markdown = input.markdown;
  let stale = false;
  let watched = false;

  if (input.path !== undefined) {
    const path = input.path;
    if (!isAbsolute(path)) {
      return { ok: false, status: 400, error: 'path must be absolute' };
    }
    const st = await stat(path).catch(() => null);
    if (st && !st.isFile()) {
      return { ok: false, status: 400, error: 'path is not a regular file' };
    }
    if (st && st.size > MAX_MARKDOWN_BYTES) {
      return { ok: false, status: 413, error: `file exceeds ${MAX_MARKDOWN_BYTES} bytes` };
    }
    try {
      const read = await readFile(path, 'utf-8');
      if (Buffer.byteLength(read, 'utf-8') > MAX_MARKDOWN_BYTES) {
        return { ok: false, status: 413, error: `file exceeds ${MAX_MARKDOWN_BYTES} bytes` };
      }
      markdown = read;
    } catch {
      if (markdown === undefined) {
        return { ok: false, status: 422, error: `cannot read ${path} and no markdown provided` };
      }
      stale = true;
    }
    // Past every reject. Commit the watcher: attach() swaps any existing
    // one atomically; a failed attach (missing parent dir) leaves the doc
    // as a static snapshot, so it is stale.
    if (input.watch !== false) {
      watched = watchers.attach(key, path);
      if (!watched) stale = true;
    } else {
      watchers.detach(key);
    }
  } else {
    if (markdown === undefined) {
      return { ok: false, status: 400, error: 'markdown is required for static docs' };
    }
    // A static doc replacing a former watched file drops its watcher.
    watchers.detach(key);
  }

  const label =
    input.label !== undefined && input.label.length > 0
      ? input.label
      : input.path !== undefined
        ? basename(input.path)
        : key;

  const rendered = await render(markdown ?? '');
  const { doc, created } = store.upsert({
    key,
    label,
    kind,
    path: input.path,
    watched,
    stale,
    markdown: markdown ?? '',
    html: rendered,
  });
  return { ok: true, created, doc };
};

export const createApp = (store: Store, watchers: Watchers, meta: ServerMeta): HonoApp => {
  const app = new Hono<Env>();

  app.use('*', async (c, next) => {
    // Synthetic in-process requests (app.request() in tests) carry no
    // Host header; fall back to the request URL's host, which for real
    // node-server traffic is itself derived from the Host header.
    const host = c.req.header('host') ?? new URL(c.req.url).host;
    if (!hostAllowed(host)) {
      return c.json({ error: 'loopback only' }, 403);
    }
    return next();
  });

  // Defense in depth behind the Host gate: the write surface also
  // requires the TCP peer itself to be loopback. The bind is loopback
  // -only today, so this is redundant until someone changes the bind.
  app.use('/_/*', async (c, next) => {
    const remote = c.env?.incoming?.socket?.remoteAddress;
    if (remote !== undefined && !LOOPBACK_ADDRESSES.has(remote)) {
      return c.json({ error: 'loopback only' }, 403);
    }
    return next();
  });

  // The mermaid source is path-scoped to the pinned version so the CSP
  // does not admit arbitrary jsdelivr packages. (Dynamic import() cannot
  // carry SRI; bundling mermaid would remove the CDN trust entirely at
  // the cost of package size.)
  const CSP = [
    "default-src 'self'",
    "script-src 'self' https://cdn.jsdelivr.net/npm/mermaid@11.14.0/",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');

  app.get('/', (c) => {
    c.header('Content-Security-Policy', CSP);
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    return c.html(html`<!doctype html>${<Document />}`);
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

  // Discovery probe. Answered before renderer warmup completes — no
  // route on this surface renders — so a warming server is never
  // misclassified as a squatter.
  app.get('/_/health', (c) => {
    return c.json({
      agent: 'mdscroll',
      version: meta.version,
      pid: process.pid,
      docs: store.size(),
    });
  });

  app.get('/_/docs', (c) => {
    return c.json({ docs: store.list().map(toSummary) });
  });

  app.put('/_/docs/:key', async (c) => {
    const key = c.req.param('key');
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return c.json({ error: 'JSON body required' }, 400);
    }
    if (body.markdown !== undefined && typeof body.markdown !== 'string') {
      return c.json({ error: 'markdown must be a string' }, 400);
    }
    if (body.path !== undefined && typeof body.path !== 'string') {
      return c.json({ error: 'path must be a string' }, 400);
    }
    if (body.watch !== undefined && typeof body.watch !== 'boolean') {
      return c.json({ error: 'watch must be a boolean' }, 400);
    }
    if (body.label !== undefined && typeof body.label !== 'string') {
      return c.json({ error: 'label must be a string' }, 400);
    }
    const result = await registerDoc(store, watchers, {
      key,
      markdown: body.markdown as string | undefined,
      path: body.path as string | undefined,
      watch: body.watch as boolean | undefined,
      label: body.label as string | undefined,
    });
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return c.json({ key, created: result.created }, result.created ? 201 : 200);
  });

  app.delete('/_/docs/:key', (c) => {
    const key = c.req.param('key');
    watchers.detach(key);
    store.remove(key);
    // Idempotent: deleting an absent doc is success, not an error.
    return c.body(null, 204);
  });

  app.get('/events', (c) => {
    return streamSSE(c, async (stream) => {
      let aborted = false;

      // Single write chain: init and every subsequent event go through
      // here so they reach the socket in arrival order. HTML is cached
      // on the doc record, so no render happens on this path.
      let writes: Promise<void> = Promise.resolve();
      const enqueue = (msg: { event: string; data: string }) => {
        writes = writes.then(async () => {
          if (aborted) return;
          try {
            await stream.writeSSE(msg);
          } catch (err) {
            process.stderr.write(`mdscroll: SSE write failed: ${String(err)}\n`);
          }
        });
      };

      // Subscribe BEFORE snapshotting so a store mutation racing with
      // init is buffered instead of lost; init was enqueued first so it
      // still lands first.
      const unsubscribe = store.subscribe((event) => {
        if (aborted) return;
        if (event.kind === 'removed') {
          enqueue({ event: 'removed', data: JSON.stringify({ key: event.key }) });
        } else {
          enqueue({
            event: event.kind,
            data: JSON.stringify({ doc: toPayload(event.doc) }),
          });
        }
      });

      enqueue({
        event: 'init',
        data: JSON.stringify({ docs: store.list().map(toPayload) }),
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
