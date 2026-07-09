import { REQUEST_TIMEOUT_MS } from './constants.js';
import type { DocKind } from './store/state.js';

export type DocSummary = {
  key: string;
  label: string;
  kind: DocKind;
  watched: boolean;
  stale: boolean;
  updatedAt: number;
};

export type PushBody = {
  markdown?: string;
  path?: string;
  watch?: boolean;
  label?: string;
};

/** A non-2xx answer from a live mdscroll server (validation, caps, ...). */
export class ServerRejectionError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ServerRejectionError';
    this.status = status;
  }
}

const timeoutSignal = () => AbortSignal.timeout(REQUEST_TIMEOUT_MS);

const docPath = (key: string): string => `/_/docs/${encodeURIComponent(key)}`;

const rejectionFrom = async (res: Response): Promise<ServerRejectionError> => {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  const detail = typeof body?.error === 'string' ? body.error : `status ${res.status}`;
  return new ServerRejectionError(res.status, detail);
};

export const putDoc = async (
  baseUrl: string,
  key: string,
  body: PushBody,
): Promise<{ created: boolean }> => {
  const res = await fetch(`${baseUrl}${docPath(key)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: timeoutSignal(),
  });
  if (res.status !== 200 && res.status !== 201) throw await rejectionFrom(res);
  return { created: res.status === 201 };
};

export const deleteDoc = async (baseUrl: string, key: string): Promise<void> => {
  const res = await fetch(`${baseUrl}${docPath(key)}`, {
    method: 'DELETE',
    signal: timeoutSignal(),
  });
  if (res.status !== 204) throw await rejectionFrom(res);
};

export const listDocs = async (baseUrl: string): Promise<DocSummary[]> => {
  const res = await fetch(`${baseUrl}/_/docs`, { signal: timeoutSignal() });
  if (!res.ok) throw await rejectionFrom(res);
  const body = (await res.json().catch(() => null)) as { docs?: unknown } | null;
  if (!body || !Array.isArray(body.docs)) {
    throw new ServerRejectionError(res.status, 'malformed GET /_/docs body');
  }
  return body.docs as DocSummary[];
};
