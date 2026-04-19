import { serve, type ServerType } from '@hono/node-server';
import { connectHost, urlHost } from './host.js';
import type { HonoApp, ServerHandle } from './server/app.js';

/**
 * Bind `app` on `(host, port)` and resolve once the underlying Node server
 * emits 'listening'. Rejects with the bind error (typically EADDRINUSE /
 * EACCES) so the caller can fall back to discovery or a different port.
 *
 * @hono/node-server's `serve()` returns the ServerType synchronously, but
 * the socket is not yet bound: listen failures arrive on the 'error'
 * event. Race the two events and settle whichever fires first.
 */
export const bindApp = async (app: HonoApp, port: number, host: string): Promise<ServerHandle> =>
  new Promise<ServerHandle>((resolve, reject) => {
    let settled = false;
    const server: ServerType = serve({
      fetch: app.fetch,
      port,
      hostname: host,
    });
    const onListen = () => {
      if (settled) return;
      settled = true;
      server.off('error', onError);
      // Advertise the loopback equivalent of the bind host so users and
      // push clients see a URL they can actually connect to even when
      // we're bound to 0.0.0.0 / ::.
      resolve({
        url: `http://${urlHost(connectHost(host))}:${port}`,
        close: () =>
          new Promise<void>((res, rej) => {
            server.close((err) => {
              if (err) rej(err);
              else res();
            });
          }),
      });
    };
    const onError = (err: Error) => {
      if (settled) return;
      settled = true;
      server.off('listening', onListen);
      reject(err);
    };
    server.once('listening', onListen);
    server.once('error', onError);
  });
