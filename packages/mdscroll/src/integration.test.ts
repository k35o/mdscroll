import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolvePort } from './port.js';
import { warmup } from './server/render.js';
import { type ServerHandle, startServer } from './server/app.js';

describe('start + push + /events integration', () => {
  let handle: ServerHandle;
  let baseUrl: string;

  beforeAll(async () => {
    await warmup();
    const port = await resolvePort(0);
    handle = await startServer({
      port,
      host: '127.0.0.1',
      identity: 'integration-identity',
    });
    baseUrl = handle.url;
  }, 30_000);

  afterAll(async () => {
    await handle.close();
  });

  it('serves the empty placeholder before any push', async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('No content yet');
    // CSP header landed on the HTML response.
    const csp = res.headers.get('content-security-policy');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('https://cdn.jsdelivr.net');
  });

  it('exposes /identity with the configured token', async () => {
    const res = await fetch(`${baseUrl}/identity`);
    const json = (await res.json()) as { identity: string };
    expect(json.identity).toBe('integration-identity');
  });

  it('accepts a push, then renders it on subsequent GET /', async () => {
    const push = await fetch(`${baseUrl}/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Mdscroll-Source': 'integration-test',
      },
      body: '# Integration',
    });
    expect(push.status).toBe(200);
    const pushJson = (await push.json()) as { ok: boolean; id: string };
    expect(pushJson.ok).toBe(true);

    const res = await fetch(`${baseUrl}/`);
    const body = await res.text();
    expect(body).toContain('<h1>Integration</h1>');
  });

  it('rejects push without X-Mdscroll-Source', async () => {
    const res = await fetch(`${baseUrl}/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: 'hi',
    });
    expect(res.status).toBe(400);
  });

  it('streams the current snapshot on /events connect', async () => {
    const controller = new AbortController();
    const res = await fetch(`${baseUrl}/events`, { signal: controller.signal });
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);

    const reader = res.body?.getReader();
    expect(reader).toBeDefined();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      // Read until we get one full SSE event (terminated by \n\n).
      for (let i = 0; i < 20; i += 1) {
        const { value, done } = await (reader as ReadableStreamDefaultReader<Uint8Array>).read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.includes('\n\n')) break;
      }
    } finally {
      controller.abort();
    }

    const match = buffer.match(/event: update\ndata: (\{[\s\S]+?\})\n\n/);
    expect(match).not.toBeNull();
    if (!match) throw new Error('no SSE event');
    const payload = JSON.parse(match[1] as string) as {
      html: string;
      current: { source: string } | null;
    };
    expect(payload.html).toContain('<h1>Integration</h1>');
    expect(payload.current?.source).toBe('integration-test');
  });
});
