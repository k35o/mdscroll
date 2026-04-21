export type RemoteDoc = {
  id: string;
  token: string;
  baseUrl: string;
};

export type PushPayload = {
  source: string;
  markdown: string;
};

/**
 * The server no longer knows about this document — typically because it
 * was restarted and lost its in-memory store. Callers should treat this
 * as a signal to re-POST rather than a silent success.
 */
export class DocMissingError extends Error {
  constructor(baseUrl: string, id: string) {
    super(`mdscroll server at ${baseUrl} no longer has doc ${id}`);
    this.name = 'DocMissingError';
  }
}

const REQUEST_TIMEOUT_MS = 3000;

const timeoutSignal = () => AbortSignal.timeout(REQUEST_TIMEOUT_MS);

/**
 * Register a new document on a running mdscroll server.
 * Returns the remote id + write token (needed for PUT / DELETE).
 */
export const postDoc = async (
  baseUrl: string,
  payload: PushPayload & { ownerPid?: number; instanceId?: string },
): Promise<RemoteDoc> => {
  const res = await fetch(`${baseUrl}/_/docs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: timeoutSignal(),
  });
  if (!res.ok) {
    throw new Error(`mdscroll server refused POST /_/docs: ${res.status}`);
  }
  const body = (await res.json()) as { id?: unknown; token?: unknown };
  if (typeof body.id !== 'string' || typeof body.token !== 'string') {
    throw new Error('mdscroll server returned a malformed POST /_/docs body');
  }
  return { id: body.id, token: body.token, baseUrl };
};

export const putDoc = async (doc: RemoteDoc, payload: Partial<PushPayload>): Promise<void> => {
  const res = await fetch(`${doc.baseUrl}/_/docs/${doc.id}`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${doc.token}`,
    },
    body: JSON.stringify(payload),
    signal: timeoutSignal(),
  });
  if (res.status === 404) {
    throw new DocMissingError(doc.baseUrl, doc.id);
  }
  if (!res.ok) {
    throw new Error(`mdscroll server refused PUT /_/docs/${doc.id}: ${res.status}`);
  }
};

export const deleteDoc = async (doc: RemoteDoc): Promise<void> => {
  const res = await fetch(`${doc.baseUrl}/_/docs/${doc.id}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${doc.token}` },
    signal: timeoutSignal(),
  });
  // A 404 on DELETE means the server already forgot the doc — e.g.
  // liveness GC reaped us or the server restarted. We're trying to
  // tear down anyway; treat it as success.
  if (!res.ok && res.status !== 404) {
    throw new Error(`mdscroll server refused DELETE /_/docs/${doc.id}: ${res.status}`);
  }
};
