import { bindApp } from './bind.js';
import { connectHost, urlHost } from './host.js';
import { resolvePort } from './port.js';
import type { HonoApp, ServerHandle } from './server/app.js';

export type Discovery =
  | {
      mode: 'server';
      handle: ServerHandle;
      note?: string;
    }
  | {
      mode: 'client';
      baseUrl: string;
    };

const isAddrInUse = (err: unknown): boolean =>
  err !== null &&
  typeof err === 'object' &&
  'code' in err &&
  (err as { code?: unknown }).code === 'EADDRINUSE';

const PROBE_TIMEOUT_MS = 1500;

/**
 * Ask `(host, port)` whether another mdscroll is on the other end.
 * Returns its baseUrl when so, or null when the port is owned by some
 * other process (or not answering).
 */
export const probeMdscroll = async (host: string, port: number): Promise<string | null> => {
  const baseUrl = `http://${urlHost(host)}:${port}`;
  try {
    const res = await fetch(`${baseUrl}/_/health`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { agent?: unknown } | null;
    return body?.agent === 'mdscroll' ? baseUrl : null;
  } catch {
    return null;
  }
};

/**
 * Decide whether this process should become the server or attach to an
 * existing one. Algorithm:
 *
 *   1. If `port > 0`, try to bind it. Success → we're the server.
 *   2. If bind fails with EADDRINUSE, probe `/_/health` on the
 *      loopback host derived from `host`. If the owner is another
 *      mdscroll → return client mode.
 *   3. Otherwise (port owned by something unrelated, or `port === 0`):
 *      fall back to a random free port and bind there — unless the
 *      caller explicitly pinned the port, in which case we refuse: the
 *      user asked for *this* port and we couldn't honour it.
 *
 * The caller passes the fully-built Hono app so that the server we
 * return is already wired to routes. In client mode, the app is
 * unused and garbage-collected.
 */
export const discover = async (opts: {
  app: HonoApp;
  port: number;
  host: string;
  /** True when the user pinned the port via `--port`. Disables fallback. */
  portExplicit?: boolean;
}): Promise<Discovery> => {
  if (opts.port > 0) {
    try {
      const handle = await bindApp(opts.app, opts.port, opts.host);
      return { mode: 'server', handle };
    } catch (err) {
      if (!isAddrInUse(err)) throw err;
      // Probe the loopback equivalent of the bind host so wildcard
      // binds (0.0.0.0, ::) still find a peer listening on localhost.
      const probeTarget = connectHost(opts.host);
      const baseUrl = await probeMdscroll(probeTarget, opts.port);
      if (baseUrl) return { mode: 'client', baseUrl };
      if (opts.portExplicit) {
        throw new Error(
          `port ${opts.port} on ${opts.host} is held by a non-mdscroll process; refusing to fall back because --port was explicit`,
        );
      }
      // Non-mdscroll owns the preferred port; fall through to random.
    }
  }
  const fallback = await resolvePort(0);
  const handle = await bindApp(opts.app, fallback, opts.host);
  const note =
    opts.port > 0 && fallback !== opts.port
      ? `port ${opts.port} is taken by another process; using ${fallback}`
      : undefined;
  return { mode: 'server', handle, ...(note ? { note } : {}) };
};
