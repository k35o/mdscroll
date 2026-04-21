import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteDoc, DocMissingError, postDoc, putDoc, type RemoteDoc } from './push-client.js';

type FetchMock = ReturnType<typeof vi.fn>;

const installFetch = (impl: (req: Request) => Response | Promise<Response>) => {
  const mock: FetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const req =
      typeof input === 'string' || input instanceof URL ? new Request(input, init) : input;
    return impl(req);
  });
  vi.stubGlobal('fetch', mock);
  return mock;
};

const REMOTE: RemoteDoc = {
  id: 'doc-id',
  token: 'tok',
  baseUrl: 'http://127.0.0.1:4977',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('postDoc', () => {
  it('POSTs the payload as JSON and returns id + token', async () => {
    const fetchMock = installFetch(async (req) => {
      expect(req.method).toBe('POST');
      expect(req.url).toBe('http://127.0.0.1:4977/_/docs');
      expect(req.headers.get('content-type')).toBe('application/json');
      const body = (await req.json()) as Record<string, unknown>;
      expect(body).toEqual({ source: 's', markdown: 'x', ownerPid: 42 });
      return new Response(JSON.stringify({ id: 'new-id', token: 'new-tok' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    });

    const result = await postDoc('http://127.0.0.1:4977', {
      source: 's',
      markdown: 'x',
      ownerPid: 42,
    });

    expect(result).toEqual({
      id: 'new-id',
      token: 'new-tok',
      baseUrl: 'http://127.0.0.1:4977',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('throws when the server returns a non-OK status', async () => {
    installFetch(async () => new Response('nope', { status: 500 }));
    await expect(postDoc('http://127.0.0.1:4977', { source: 's', markdown: 'x' })).rejects.toThrow(
      /500/,
    );
  });

  it('throws when the server returns a malformed body', async () => {
    installFetch(
      async () =>
        new Response(JSON.stringify({ id: 42 }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
    );
    await expect(postDoc('http://127.0.0.1:4977', { source: 's', markdown: 'x' })).rejects.toThrow(
      /malformed/,
    );
  });
});

describe('putDoc', () => {
  it('PUTs to /_/docs/:id with a Bearer auth header', async () => {
    installFetch(async (req) => {
      expect(req.method).toBe('PUT');
      expect(req.url).toBe('http://127.0.0.1:4977/_/docs/doc-id');
      expect(req.headers.get('authorization')).toBe('Bearer tok');
      const body = (await req.json()) as Record<string, unknown>;
      expect(body).toEqual({ markdown: 'new' });
      return new Response(null, { status: 204 });
    });

    await expect(putDoc(REMOTE, { markdown: 'new' })).resolves.toBeUndefined();
  });

  it('throws DocMissingError on 404 so the caller can re-register', async () => {
    installFetch(async () => new Response('gone', { status: 404 }));
    await expect(putDoc(REMOTE, { markdown: 'x' })).rejects.toBeInstanceOf(DocMissingError);
  });

  it('throws on other non-OK statuses', async () => {
    installFetch(async () => new Response('unauth', { status: 401 }));
    await expect(putDoc(REMOTE, { markdown: 'x' })).rejects.toThrow(/401/);
  });
});

describe('deleteDoc', () => {
  it('DELETEs /_/docs/:id with the Bearer token', async () => {
    installFetch(async (req) => {
      expect(req.method).toBe('DELETE');
      expect(req.url).toBe('http://127.0.0.1:4977/_/docs/doc-id');
      expect(req.headers.get('authorization')).toBe('Bearer tok');
      return new Response(null, { status: 204 });
    });

    await expect(deleteDoc(REMOTE)).resolves.toBeUndefined();
  });

  it('tolerates 404 (server already forgot the doc)', async () => {
    installFetch(async () => new Response(null, { status: 404 }));
    await expect(deleteDoc(REMOTE)).resolves.toBeUndefined();
  });

  it('throws on other non-OK statuses', async () => {
    installFetch(async () => new Response('nope', { status: 500 }));
    await expect(deleteDoc(REMOTE)).rejects.toThrow(/500/);
  });
});
