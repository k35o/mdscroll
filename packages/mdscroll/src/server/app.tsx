import { type HttpBindings, serve, type ServerType } from '@hono/node-server';
import { Hono } from 'hono';
import { html } from 'hono/html';
import { streamSSE } from 'hono/streaming';
import { displaySourceLabel } from '../source.js';
import { type DocPublic, Store } from '../store/state.js';
import { CLIENT_JS, Document, STYLES_CSS } from './client.js';
import { render } from './render.js';

type Env = { Bindings: HttpBindings };

/** The shape of the Hono app we build — exported for bind/discover. */
export type HonoApp = Hono<Env>;

export type ServerHandle = {
  url: string;
  close: () => Promise<void>;
};

type ServerMeta = { version: string };

export type ServerOptions = {
  /**
   * The host we are listening on (for building the allowlist). `0.0.0.0`
   * and `::` mean "any"; we treat them as "loopback-only" for the push
   * endpoints because the user has not opted into LAN exposure. A
   * specific non-loopback IP is taken as "same-host traffic on this
   * interface is fine" and added to the allowlist so discovery works.
   */
  bindHost: string;
};

/** Payload shape sent over SSE. The client mirrors this in CLIENT_JS. */
type DocPayload = {
  id: string;
  source: string;
  displaySource: string;
  html: string;
  ownerPid?: number;
  updatedAt: number;
};

const toPayload = async (doc: DocPublic): Promise<DocPayload> => ({
  id: doc.id,
  source: doc.source,
  displaySource: displaySourceLabel(doc.source),
  html: await render(doc.markdown),
  ownerPid: doc.ownerPid,
  updatedAt: doc.updatedAt,
});

const bearer = (header: string | undefined): string | null => {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] ?? null;
};

/**
 * Admission caps for POST /_/docs. These are deliberately generous —
 * the usual workload is a handful of markdown files under 1 MB each —
 * but they exist so a runaway client cannot pin arbitrary memory on
 * the server, and so server.pid cannot be used as a GC-immune
 * ownerPid to hoard docs.
 */
const MAX_MARKDOWN_BYTES = 10 * 1024 * 1024;
const MAX_SOURCE_LENGTH = 1024;
const MAX_DOCS_TOTAL = 128;
const MAX_DOCS_PER_OWNER = 16;

const LOOPBACK_ADDRESSES = [
  '127.0.0.1',
  '::1',
  // IPv4-mapped IPv6 loopback that some Node configurations surface.
  '::ffff:127.0.0.1',
] as const;

const WILDCARD_HOSTS = new Set(['', '0.0.0.0', '::', '[::]']);

/**
 * Build the set of remote socket addresses allowed to reach /_/*.
 *
 * Always includes loopback. If the server was bound to a specific
 * non-loopback IP, that IP is also included — same-host traffic reaches
 * the socket with that address as its source and we want push / probe
 * to work locally. Wildcard binds (0.0.0.0, ::) are treated as
 * "loopback-only" because the user has not expressed an intent to
 * expose push endpoints to the LAN.
 */
const buildAllowedSources = (bindHost: string): Set<string> => {
  const set = new Set<string>(LOOPBACK_ADDRESSES);
  const normalized = bindHost.trim().toLowerCase();
  if (!WILDCARD_HOSTS.has(normalized) && bindHost !== '') {
    set.add(bindHost);
  }
  return set;
};

export const createApp = (store: Store, meta: ServerMeta, options: ServerOptions): Hono<Env> => {
  const app = new Hono<Env>();
  const allowedSources = buildAllowedSources(options.bindHost);

  // The push surface is a per-doc capability (random token returned on
  // POST) plus an IP allowlist. The token alone is not a credential —
  // anyone who can reach the port and is allowed by this middleware can
  // POST to get one. We therefore gate /_/* on the remote socket's
  // address so that binding --host 0.0.0.0 doesn't silently expose the
  // push endpoints to the LAN.
  app.use('/_/*', async (c, next) => {
    // `c.env.incoming` is only set by @hono/node-server. Synthetic
    // in-process requests (e.g. `app.request()` in tests) have no
    // network origin at all — `c.env` itself is undefined there — so
    // there is nothing to deny.
    const remote = c.env?.incoming?.socket?.remoteAddress;
    if (remote !== undefined && !allowedSources.has(remote)) {
      return c.json({ error: 'loopback only' }, 403);
    }
    await next();
  });

  const CSP = [
    "default-src 'self'",
    "script-src 'self' https://cdn.jsdelivr.net",
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

  // Discovery: clients use this to confirm "the process on :4977 is
  // another mdscroll I can push to" before POSTing their document.
  app.get('/_/health', (c) => {
    return c.json({ agent: 'mdscroll', version: meta.version, pid: process.pid });
  });

  app.post('/_/docs', async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body.markdown !== 'string' || typeof body.source !== 'string') {
      return c.json({ error: 'markdown and source are required strings' }, 400);
    }
    if (body.source.length > MAX_SOURCE_LENGTH) {
      return c.json({ error: `source exceeds ${MAX_SOURCE_LENGTH}-character limit` }, 413);
    }
    if (Buffer.byteLength(body.markdown, 'utf-8') > MAX_MARKDOWN_BYTES) {
      return c.json({ error: `markdown exceeds ${MAX_MARKDOWN_BYTES}-byte limit` }, 413);
    }
    // Require a positive safe integer that is NOT the server's own pid.
    // Accepting `process.pid` as ownerPid would exempt the doc from
    // liveness GC (since the server always skips its own pid), giving
    // an attacker a trivial way to pin zombies in memory.
    const rawOwnerPid = body.ownerPid;
    const ownerPid =
      typeof rawOwnerPid === 'number' &&
      Number.isSafeInteger(rawOwnerPid) &&
      rawOwnerPid > 0 &&
      rawOwnerPid !== process.pid
        ? rawOwnerPid
        : undefined;
    const instanceId =
      typeof body.instanceId === 'string' && body.instanceId.length > 0
        ? body.instanceId
        : undefined;
    // Admission caps. The total cap keeps a lone client from filling
    // memory; the per-owner cap keeps a misbehaving client from
    // monopolising the tab strip. An upsert on a known instanceId
    // doesn't count as a new doc — skip the cap check in that case.
    const isUpsert = instanceId !== undefined && store.hasInstance(instanceId);
    if (!isUpsert) {
      if (store.size() >= MAX_DOCS_TOTAL) {
        return c.json({ error: 'too many docs on the server' }, 429);
      }
      if (ownerPid !== undefined && store.countByOwnerPid(ownerPid) >= MAX_DOCS_PER_OWNER) {
        return c.json({ error: `owner ${ownerPid} exceeds ${MAX_DOCS_PER_OWNER}-doc limit` }, 429);
      }
    }
    const { doc, token } = store.add({
      source: body.source,
      markdown: body.markdown,
      ownerPid,
      instanceId,
    });
    return c.json({ id: doc.id, token }, 201);
  });

  app.put('/_/docs/:id', async (c) => {
    const id = c.req.param('id');
    // Existence check comes before auth so clients can tell "server
    // forgot this id (e.g. it was restarted)" from "token mismatch".
    // Doc ids are randomUUID — unguessable — so returning 404 on
    // unknown id does not meaningfully expand an attacker's surface.
    if (!store.get(id)) return c.json({ error: 'not found' }, 404);
    const token = bearer(c.req.header('authorization'));
    if (!token || !store.authorize(id, token)) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: 'body required' }, 400);
    const patch: { source?: string; markdown?: string } = {};
    if (typeof body.source === 'string') patch.source = body.source;
    if (typeof body.markdown === 'string') patch.markdown = body.markdown;
    const next = store.update(id, patch);
    if (!next) return c.json({ error: 'not found' }, 404);
    return c.body(null, 204);
  });

  app.delete('/_/docs/:id', (c) => {
    const id = c.req.param('id');
    if (!store.get(id)) return c.json({ error: 'not found' }, 404);
    const token = bearer(c.req.header('authorization'));
    if (!token || !store.authorize(id, token)) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    const removed = store.remove(id);
    if (!removed) return c.json({ error: 'not found' }, 404);
    return c.body(null, 204);
  });

  app.get('/events', (c) => {
    return streamSSE(c, async (stream) => {
      let aborted = false;

      // Single write chain. All writes — init and every subsequent event —
      // go through here so they reach the socket in arrival order even
      // when render() latencies differ.
      let writes: Promise<void> = Promise.resolve();
      const enqueue = (build: () => Promise<{ event: string; data: string }>) => {
        writes = writes.then(async () => {
          if (aborted) return;
          try {
            const msg = await build();
            if (aborted) return;
            await stream.writeSSE(msg);
          } catch (err) {
            process.stderr.write(`mdscroll: SSE write failed: ${String(err)}\n`);
          }
        });
      };

      // Subscribe BEFORE snapshotting so any store mutation that races
      // with init is buffered instead of lost. The subscription feeds
      // straight into the same write chain — `init` was the first thing
      // enqueued so it lands first.
      const unsubscribe = store.subscribe((event) => {
        if (aborted) return;
        if (event.kind === 'removed') {
          enqueue(async () => ({
            event: 'removed',
            data: JSON.stringify({ id: event.id }),
          }));
        } else {
          enqueue(async () => ({
            event: event.kind,
            data: JSON.stringify({ doc: await toPayload(event.doc) }),
          }));
        }
      });

      const snapshot = store.list();
      enqueue(async () => ({
        event: 'init',
        data: JSON.stringify({
          docs: await Promise.all(snapshot.map(toPayload)),
        }),
      }));

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
  meta: ServerMeta;
}): Promise<ServerHandle> => {
  const app = createApp(opts.store, opts.meta, { bindHost: opts.host });

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
