import type { Server } from 'node:http';
import { serve, type ServerType } from '@hono/node-server';
import { LOOPBACK_HOST } from './constants.js';
import type { HonoApp, ServerHandle } from './server/app.js';

/**
 * Bind `app` on loopback:`port` and resolve once the underlying Node
 * server emits 'listening'. Rejects with the bind error (typically
 * EADDRINUSE) so the caller can probe the occupant or retry.
 *
 * @hono/node-server's `serve()` returns the ServerType synchronously, but
 * the socket is not yet bound: listen failures arrive on the 'error'
 * event. Race the two events and settle whichever fires first.
 */
export const bindApp = async (app: HonoApp, port: number): Promise<ServerHandle> =>
  new Promise<ServerHandle>((resolve, reject) => {
    let settled = false;
    const server: ServerType = serve({
      fetch: app.fetch,
      port,
      hostname: LOOPBACK_HOST,
    });
    const onListen = () => {
      if (settled) return;
      settled = true;
      server.off('error', onError);
      resolve({
        url: `http://${LOOPBACK_HOST}:${port}`,
        close: () =>
          new Promise<void>((res, rej) => {
            server.close((err) => {
              if (err) rej(err);
              else res();
            });
            // Destroy open connections AFTER close() so no new ones are
            // accepted first. SSE streams are held open indefinitely by
            // design; without this, close() waits for every browser tab
            // to disconnect and Ctrl+C appears to hang.
            (server as Server).closeAllConnections?.();
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
