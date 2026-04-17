// HTTP client helpers shared by commands that talk to a running mdscroll
// server (today: push; tomorrow: anything else that POSTs /push or
// probes /identity). Kept small and transport-focused so the command
// implementations can stay about flow, not about parsing responses.

export type PostResult =
  | { kind: 'ok' }
  | { kind: 'rejected'; status: number; detail?: string }
  | { kind: 'unreachable' };

const DETAIL_BUDGET = 200;

export const postPush = async (url: string, body: string, source: string): Promise<PostResult> => {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Mdscroll-Source': source,
      },
      body,
    });
  } catch {
    // Connection refused, DNS failure, socket reset — the server is
    // not answering at all, so it is reasonable to treat the lock as
    // stale.
    return { kind: 'unreachable' };
  }
  if (response.ok) return { kind: 'ok' };
  // The server was reached and returned an error. The instance is
  // alive and should NOT be treated as stale — leave its lock in
  // place. Try to surface a body snippet for diagnostics.
  let detail: string | undefined;
  try {
    detail = (await response.text()).slice(0, DETAIL_BUDGET);
  } catch {
    detail = undefined;
  }
  return { kind: 'rejected', status: response.status, detail };
};
