import { LOOPBACK_HOST, PROBE_TIMEOUT_MS } from './constants.js';

export type ProbeResult =
  | { kind: 'mdscroll'; baseUrl: string; pid?: number }
  | { kind: 'free' }
  | { kind: 'squatter' };

export const isConnectionRefused = (err: unknown): boolean => {
  if (err === null || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  if (code === 'ECONNREFUSED') return true;
  // undici wraps the socket error in TypeError.cause, and on dual-stack
  // hosts the cause can be an AggregateError over v4+v6 attempts.
  const cause = (err as { cause?: unknown }).cause;
  if (cause && isConnectionRefused(cause)) return true;
  const errors = (err as { errors?: unknown }).errors;
  if (Array.isArray(errors)) return errors.some(isConnectionRefused);
  return false;
};

/**
 * Classify what is listening on the loopback port:
 *
 * - `mdscroll` — GET /_/health answered with `agent: 'mdscroll'`.
 * - `free`     — nothing is listening (connection refused). This is the
 *                one state where `mdscroll serve` is guaranteed to work,
 *                and the only state the CLI reports as exit code 2.
 * - `squatter` — something else owns the port (bad status, wrong body,
 *                hang, reset). Never auto-fall-back: report and let the
 *                user pick another port explicitly.
 */
export const probePort = async (port: number): Promise<ProbeResult> => {
  const baseUrl = `http://${LOOPBACK_HOST}:${port}`;
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/_/health`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch (err) {
    return isConnectionRefused(err) ? { kind: 'free' } : { kind: 'squatter' };
  }
  if (!res.ok) return { kind: 'squatter' };
  const body = (await res.json().catch(() => null)) as {
    agent?: unknown;
    pid?: unknown;
  } | null;
  if (body?.agent !== 'mdscroll') return { kind: 'squatter' };
  return {
    kind: 'mdscroll',
    baseUrl,
    ...(typeof body.pid === 'number' ? { pid: body.pid } : {}),
  };
};
