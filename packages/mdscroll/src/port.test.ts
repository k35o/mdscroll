import { createServer, type AddressInfo, type Server } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PORT, resolvePort } from './port.js';

const holdPort = (): Promise<{ server: Server; port: number }> =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once('listening', () => {
      const address = server.address() as AddressInfo;
      resolve({ server, port: address.port });
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1');
  });

const closeServer = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });

describe('resolvePort', () => {
  const opened: Server[] = [];

  afterEach(async () => {
    await Promise.all(opened.splice(0).map(closeServer));
  });

  it('returns a positive port when preferred is 0', async () => {
    const port = await resolvePort(0);
    expect(port).toBeGreaterThan(0);
  });

  it('falls back to a different free port when preferred is taken', async () => {
    const { server, port: taken } = await holdPort();
    opened.push(server);

    const resolved = await resolvePort(taken);

    expect(resolved).not.toBe(taken);
    expect(resolved).toBeGreaterThan(0);
  });

  it('returns the preferred port when it is free', async () => {
    const { server, port } = await holdPort();
    await closeServer(server);

    const resolved = await resolvePort(port);

    expect(resolved).toBe(port);
  });
});

describe('DEFAULT_PORT', () => {
  it('is a valid port number', () => {
    expect(DEFAULT_PORT).toBeGreaterThan(0);
    expect(DEFAULT_PORT).toBeLessThan(65536);
  });
});
