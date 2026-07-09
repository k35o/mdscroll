---
'mdscroll': minor
---

Rewrite: a document is named data, not a process.

Breaking changes across the board (0.4.0):

- One long-lived server per session. Every other invocation pushes a doc
  over HTTP and exits immediately — there is no resident client process,
  no per-doc babysitter, and no phantom heartbeat for stdin docs.
- Docs are keyed by realpath (files) or `--name` (stdin, default
  `untitled`). Re-running the same doc replaces its tab; duplicate tabs
  are structurally impossible. Bearer tokens, instanceId, ownerPid, and
  the liveness GC are gone.
- File watching moved into the server (`PUT /_/docs/:key` with
  `path` + `watch`), so `mdscroll <file>` against a running server exits
  right away while live reload keeps working. Deleted files mark the tab
  stale and recover automatically when the file reappears.
- New verbs: `mdscroll serve` (idempotent), `mdscroll push` (never
  becomes the server; exit 2 when none is running), `mdscroll rm`,
  `mdscroll ls`. `--json` prints one machine-readable line on every
  verb. Exit codes are a contract: 0 success, 1 error, 2 "no server —
  `mdscroll serve` would fix it".
- The default command keeps the one-command flow: push when a server
  exists, become the session server when the port is free, hard error on
  a foreign squatter (the silent random-port fallback is gone, and so is
  `--host`; the server binds 127.0.0.1 only).
- Security: every route now validates the Host header against loopback
  names (DNS-rebinding defense for the tokenless write surface), the
  server refuses to read non-regular or oversized files, and the mermaid
  CSP entry is path-scoped to the pinned version.
- Fixes: Ctrl+C no longer hangs while a browser tab holds the SSE stream
  open (and a second Ctrl+C force-exits), `-h` is help again, `--port`
  is validated, empty piped stdin prints usage instead of pushing an
  empty doc, importing the CLI module no longer executes it, and HTML is
  rendered once per update instead of per SSE subscriber.
- Browser UI: tabs have close buttons, `/#<key>` deep-links select the
  tab, the active tab and scroll position survive SSE reconnects, and
  `document.title` follows the active doc.
