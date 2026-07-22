# mdscroll

## 0.4.1

### Patch Changes

- Switch release automation from changesets/action to [pnpm-release-action](https://github.com/k35o/pnpm-release-action) (pnpm built-in release management). No runtime changes.

## 0.4.0

### Minor Changes

- [#28](https://github.com/k35o/mdscroll/pull/28) [`619ea77`](https://github.com/k35o/mdscroll/commit/619ea77b820e726d96c585daf255be8f47393940) Thanks [@k35o](https://github.com/k35o)! - Rewrite: a document is named data, not a process.

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

### Patch Changes

- [#26](https://github.com/k35o/mdscroll/pull/26) [`24bd307`](https://github.com/k35o/mdscroll/commit/24bd307b01b03428508e9da96ed838206c7dd553) Thanks [@k35o](https://github.com/k35o)! - Update runtime dependencies: `@hono/node-server` to v2, `hono` to 4.12.25 (security), `markdown-it` to 14.2.0 (security), and `shiki` to 4.3.0.

## 0.3.0

### Minor Changes

- [#11](https://github.com/k35o/mdscroll/pull/11) [`67a03b8`](https://github.com/k35o/mdscroll/commit/67a03b8e65b6790463efd489b90a508eaf0481a3) Thanks [@k35o](https://github.com/k35o)! - Tabs and implicit push: running `mdscroll <file>` while another `mdscroll` is already listening on the target port no longer proliferates a new port. The second (and nth) invocation discovers the existing server via `GET /_/health`, POSTs its document to it, and the browser shows every open document as a tab in a single shared window. Clients keep their own file watchers and stream updates with `PUT /_/docs/:id`; Ctrl+C `DELETE`s their tab; a `process.kill(pid, 0)` liveness check on the server GCs tabs whose owner crashed. No daemon, no `~/.mdscroll/`, no `push` subcommand — it all happens automatically.

## 0.2.0

### Minor Changes

- [#7](https://github.com/k35o/mdscroll/pull/7) [`de2a50d`](https://github.com/k35o/mdscroll/commit/de2a50d2ec7170d53746f04cc7e028238b808c04) Thanks [@k35o](https://github.com/k35o)! - Breaking: collapse mdscroll to a foreground-only, single-instance server with zero disk state.

  **Removed**

  - `mdscroll push`, `mdscroll stop`, `mdscroll list` subcommands.
  - `--name` / `-n` option and per-name instance isolation.
  - `~/.mdscroll/` state directory (lockfiles, logs).
  - History drawer and `GET /api/snapshot/:id`.
  - `POST /push` and the `X-Mdscroll-Source` CSRF guard (no network writes anymore).
  - `GET /identity` endpoint.

  **New shape**

  ```bash
  mdscroll plan.md           # watch a file; auto-reload the browser on every change
  cat plan.md | mdscroll     # serve piped markdown once, stay foreground
  ```

  Both forms run in the foreground and exit cleanly on Ctrl+C. The header shows the current source: the cwd-relative path for file mode, the first `# H1` for stdin mode (falling back to `(untitled)`).

  **Why**

  The old multi-instance lockfile design wrote to `~/.mdscroll/`, which fails under Claude Code's sandbox and adds real friction for first-time users. The actual target workflow — "agent updates a plan, user watches it in the browser" — maps naturally onto "watch a file"; there is no longer a reason to run a long-lived coordinator.

## 0.1.1

### Patch Changes

- [#4](https://github.com/k35o/mdscroll/pull/4) [`73f80a4`](https://github.com/k35o/mdscroll/commit/73f80a411676e8289306389de0ad353f38bf12aa) Thanks [@k35o](https://github.com/k35o)! - Security: bump `hono` from 4.12.12 to **4.12.14** to pull in the fix for [GHSA-458j-xx4x-4375](https://github.com/honojs/hono/security/advisories/GHSA-458j-xx4x-4375) — improper handling of JSX attribute names that allowed HTML injection via `hono/jsx` SSR. mdscroll uses Hono JSX to render the preview shell, so this patch closes the exposure.

  Also bumps `vite-plus` (dev-only toolchain) from 0.1.16 to **0.1.17** to pick up the fix for [GHSA-33r3-4whc-44c2](https://github.com/voidzero-dev/vite-plus/security/advisories/GHSA-33r3-4whc-44c2) — path traversal in `downloadPackageManager()`.

## 0.1.0

### Minor Changes

- [`22839f7`](https://github.com/k35o/mdscroll/commit/22839f751be5dd8b320443f6e7c6f8065c7fd8ac) Thanks [@k35o](https://github.com/k35o)! - Initial release of `mdscroll` — push markdown to a local browser preview, instantly.
  - CLI: `mdscroll` (start server), `mdscroll <file>` / `mdscroll push` (push + auto-spawn), `mdscroll stop`, `mdscroll list`. `--name` scopes each command to an isolated instance with its own port, content, and history.
  - Server (Hono + SSE): GitHub-style rendering via markdown-it + Shiki (light/dark), Mermaid diagrams, GFM task lists / alerts / strikethrough, and a history drawer backed by the native popover API.
  - Hardened for public use: strict CSP, `X-Mdscroll-Source` CSRF guard on `POST /push` with a 5 MiB cap, identity-verified `stop` (no PID-recycling surprises), atomic lockfile acquisition, and `--name` sanitization to keep lock/log paths inside `~/.mdscroll/`.
  - Ships an [agentskills.io](https://agentskills.io)-compatible `SKILL.md`, installable with `gh skill install k35o/mdscroll` for Claude Code, Cursor, Codex, Copilot, and other compatible agents.
