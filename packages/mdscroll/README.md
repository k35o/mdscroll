# mdscroll

Preview markdown in a local browser — instantly, with zero disk state. One long-lived server per session hosts a tab strip; every other invocation pushes a document over HTTP and exits immediately.

Point `mdscroll` at a markdown file. If nothing is listening on the port, this invocation becomes the session server: it serves a rendered live view, watches the file, and stays in the foreground until Ctrl+C. Run `mdscroll` again with another file from any shell — that invocation finds the running server, pushes its document, prints the URL, and exits. The server watches that file too, so live reload keeps working with no resident process behind it. Pipe markdown on stdin for a one-shot tab. No lockfiles, no log files, nothing written to your home directory.

```bash
mdscroll plan.md                 # no server yet: serves at http://127.0.0.1:4977, watches the file
mdscroll notes.md                # server up: pushes a tab, exits immediately
cat review.md | mdscroll --name review   # one-shot doc; re-pipe the same name to replace it
mdscroll ls                      # list docs (exit 2 = no server running)
mdscroll rm notes.md             # close a tab from the shell
```

mdscroll never opens a browser itself. The server prints the URL — open it however your environment prefers (system browser, terminal multiplexer pane, AI agent helper, etc.).

## Why

Terminal output is hard to read when you're reviewing a long plan or design doc. mdscroll gives that content a proper home in your browser — GitHub-style typography, syntax-highlighted code, rendered Mermaid diagrams — without spinning up a static site generator.

Designed for AI workflows: when an assistant writes a plan to a file, run `mdscroll <that-file>` once and watch it update in place as the assistant iterates. Every push is a terminating command with a deterministic exit code and an optional one-line JSON result, so agents can script it without babysitting processes.

## Install

```bash
pnpm add -g mdscroll
# or: npm i -g mdscroll
# or one-off: npx mdscroll ...
```

## Features

- GitHub-style rendering with automatic light/dark theme
- Syntax highlighting via [Shiki](https://shiki.style) (19 common languages, light + dark dual theme)
- [Mermaid](https://mermaid.js.org) diagrams (flowcharts, sequence diagrams, etc.)
- GFM extras: task lists, [alerts](https://github.com/orgs/community/discussions/16925) (Note / Tip / Important / Warning / Caution), tables, strikethrough, autolink
- Live reload via Server-Sent Events — the server watches pushed files itself
- Multi-document tabs with close buttons; docs are keyed, so re-pushing replaces instead of duplicating
- Deterministic exit codes and `--json` output on every verb — built to be scripted
- Zero disk state: no lockfile, no log, no `~/.mdscroll/`

## The model

- A **document is named data**: a key, rendered markdown, and optionally a watched file path. A document is not a process.
- There is exactly **one long-lived process per session: the server**. Every other invocation talks to it over HTTP and exits.
- All state is RAM in the server. **Server exit ends the session — every doc disappears.** There is no daemon and nothing is persisted.

## CLI reference

```
mdscroll [file]         push a doc, or become the session server if none exists (default command)
mdscroll serve          start the session server (idempotent)
mdscroll push [file]    strict push — never becomes the server
mdscroll ls             list docs on the server
mdscroll rm <doc>       remove a doc by file path or name
```

### mdscroll `<file>` (default command)

- **Server running** → pushes the doc (`PUT /_/docs/:key`) and **exits 0 immediately**. The server reads and watches the file from then on; live reload continues with no resident client. Prints the doc URL on stdout.
- **Port free** → this invocation **becomes the server**, registers the doc through the same code path, prints `mdscroll: no server found — serving at <url> (Ctrl+C ends the session)` on stderr and the doc URL on stdout, and stays in the foreground.
- **Port held by something that isn't mdscroll** → one-line error suggesting `--port`, exit 1. There is no random-port fallback.
- Re-running the same file **replaces** the existing tab (docs are keyed by real path). Duplicate tabs are structurally impossible.
- Unreadable file → error, exit 1.

Races are handled by a bounded discovery loop (3 attempts): a server that dies between probe and push sends the invocation back to the bind attempt; losing a bind race to a simultaneous invocation sends it back to the probe.

### Piped stdin

```bash
cat plan.md | mdscroll
generate-report | mdscroll --name report      # stable key: re-pipe to update the tab
```

Reads stdin to EOF and pushes a **static** doc (no watching — there is no file). The key is `--name` if given, otherwise the fixed key `untitled`, so repeated anonymous pipes replace one tab instead of accumulating. With no server running, piped stdin auto-serves exactly like a file. Empty (whitespace-only) stdin prints usage and exits 1. In human mode a push that replaced an existing static doc prints a notice on stderr, since a derived key can clobber an unrelated one-shot.

### mdscroll serve

Starts the session server with an empty tab strip and stays in the foreground. Idempotent: if an mdscroll server already owns the port, it prints `mdscroll already running at <url>` and exits 0 (`--json` adds `"existing": true`). A foreign process on the port is an error (exit 1) — stop it or pick another port with `--port`.

### mdscroll push [file]

Strict push for machine callers: pushes the file (or piped stdin) to a running server and exits. **Never becomes the server** — if nothing is listening, it prints an error and exits 2, the machine-readable "run `mdscroll serve` first" signal. Also exits 2 if the server vanishes between probe and push. Use this when a blocking foreground process would be a surprise.

### mdscroll ls

Lists docs on the server, one per line: `key<TAB>state<TAB>label` where state is `watched`, `static`, or `stale`. The key column is the exact string `rm` accepts. Doubles as the probe: exit 0 means a server is up, exit 2 means none is running.

### mdscroll rm `<doc>`

Removes a doc. The argument is resolved against the server's actual key list, in order: the file's real path (if the file still exists), the cwd-resolved path, then the literal string — so removing a doc whose file was already deleted still works, and so does removing a stdin doc by name. Always reports the outcome and exits 0 whether or not anything was removed (`removed <key>` on stdout, or `mdscroll: no such doc: <arg>` on stderr); absence is the desired end state, but a typo is never silent.

### Flags

| Flag             | Applies to   | Default    | Description                                                                                                            |
| ---------------- | ------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| `-p, --port <n>` | every verb   | `4977`     | Target port. Integer 1–65535. Reads the `MDSCROLL_PORT` env var as its default (flag > env > 4977).                    |
| `--json`         | every verb   | off        | Print exactly one line of JSON on stdout instead of human output. Pure output formatting — it never changes lifecycle. |
| `--name <key>`   | stdin pushes | `untitled` | Doc key for piped stdin. Invalid with a file argument (files are keyed by path).                                       |
| `-h, --help`     | every verb   |            | Help.                                                                                                                  |
| `-V, --version`  | program      |            | Version.                                                                                                               |

There is no `--host`. The server binds `127.0.0.1`, always.

### Exit codes

The exit code is the machine signal, on every verb:

| Code | Meaning                                                                                                                                      |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | Success — including `serve` finding an existing server and `rm` finding nothing to remove.                                                   |
| `1`  | Error: bad input, unreadable file, invalid flag, server rejection, or a port held by a non-mdscroll process (the message suggests `--port`). |
| `2`  | Strictly "nothing is listening on the port" — i.e. `mdscroll serve` would fix it.                                                            |

The port probe times out after 500 ms; a timeout, connection reset, or malformed health body classifies the occupant as a foreign squatter (exit 1), not as "no server".

### `--json` output shapes

Success prints exactly one JSON line on stdout. Errors print one `mdscroll: <message>` line on stderr and leave stdout empty.

| Invocation                  | Shape                                                                   |
| --------------------------- | ----------------------------------------------------------------------- |
| `serve` (new server)        | `{"url", "pid", "existing": false}`                                     |
| `serve` (already running)   | `{"url", "pid", "existing": true}`                                      |
| default / `push` (pushed)   | `{"url", "key", "replaced": <bool>}`                                    |
| default (became the server) | `{"url", "key", "pid", "serving": true}`                                |
| `rm`                        | `{"key": <matched key or null>, "removed": <bool>}`                     |
| `ls`                        | `{"docs": [{"key", "label", "kind", "watched", "stale", "updatedAt"}]}` |

Per-doc URLs are `<base>/#<encodeURIComponent(key)>` — opening one selects that doc's tab.

### Ctrl+C semantics

Push invocations exit on their own; there is nothing to interrupt. The server (from `serve` or auto-serve) narrates its session on stderr — `+ <label>` when a doc is pushed under it, `- <label>` when one is removed — so its terminal always shows why the process is still running. On SIGINT/SIGTERM it closes all connections and exits 0 promptly, even with browser tabs holding SSE streams open; a second signal force-exits 130. If the session still held docs pushed by others, it prints `session ended — discarded N docs` on the way out. An auto-serve server keeps serving after its founding doc is removed.

## Doc identity

- **File docs** are keyed by the file's **real path** (symlinks resolved). The same file is the same tab from any cwd or symlink; pushing it again replaces the tab's content.
- **Stdin docs** are keyed by `--name`, falling back to the fixed key `untitled`. Identity is never derived from content — editing a title does not fork a doc.
- **Labels are display only.** File docs show the cwd-relative path as the pusher saw it (basename when the file is outside cwd); stdin docs show `--name` or the first ATX `# H1` line, falling back to `(untitled)`. Last writer wins; the key is the identity.

## Live reload and stale docs

When a file doc is pushed, the **server** attaches an `fs.watch` on the file's parent directory (surviving editors that save via rename) with a 100 ms debounce, re-reads on change, re-renders once, and broadcasts over SSE. The watcher lives as long as the doc:

- A failed read retries after 150 ms; **3 consecutive failures mark the doc `stale`**. The last rendered content is kept and the tab shows a stale badge.
- The watcher stays attached while stale, so a file that reappears (git checkout, build output) clears staleness automatically on the next successful read. Re-pushing the path also clears it.
- If the watcher itself dies (e.g. the directory is removed), the doc is marked stale and un-watched; a re-push re-attaches.
- Removing a doc detaches its watcher; a watcher update can never resurrect a removed doc.

## HTTP API

The push surface lives under `/_/*`. It is **tokenless**: the loopback bind plus a Host-header allowlist is the boundary (see [Security](#security)), and any process on your machine is trusted to create, replace, or delete docs. Same-key overwrite is the intended replace semantics.

### `GET /_/health`

Discovery probe. Answers immediately, even while the renderer is still warming up.

```json
{ "agent": "mdscroll", "version": "0.4.0", "pid": 12345, "docs": 2 }
```

### `GET /_/docs`

```json
{
  "docs": [
    {
      "key": "/Users/me/plan.md",
      "label": "plan.md",
      "kind": "file",
      "watched": true,
      "stale": false,
      "updatedAt": 1767857123456
    }
  ]
}
```

`kind` is `"file"` or `"static"`; `updatedAt` is epoch milliseconds.

### `PUT /_/docs/:key`

Create or replace the doc at `:key` (URL-encode the key). Body fields, all optional in the schema:

| Field      | Type    | Meaning                                                                                                                                             |
| ---------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `markdown` | string  | Doc content. Required for static docs. For file docs it is the fallback content when the server cannot read `path` (the doc is then created stale). |
| `path`     | string  | Absolute path to a markdown file. The server reads the file itself.                                                                                 |
| `watch`    | boolean | With `path`: attach a server-side watcher (default `true`). `false` opts out.                                                                       |
| `label`    | string  | Display label (last-writer-wins; identity is the key).                                                                                              |

Responses: `201 {"key", "created": true}` on create, `200 {"key", "created": false}` on replace. Errors are `{"error": "..."}` with `400` (invalid key, non-absolute path, non-regular file, missing markdown for a static doc, wrong field types), `413` (markdown/file over 10 MiB, label over 1024 chars), `422` (unreadable `path` and no fallback `markdown`), or `429` (doc cap reached). Idempotent by construction — retries are safe.

### `DELETE /_/docs/:key`

`204`, idempotent — deleting an absent doc is success. This is also what the tab close button calls.

### `GET /events` (SSE)

Everything the browser shows is driven by this stream. HTML is rendered once per doc update and cached; the stream never renders.

| Event     | Payload                                                 |
| --------- | ------------------------------------------------------- |
| `init`    | `{"docs": [<doc>, ...]}` — full snapshot on (re)connect |
| `added`   | `{"doc": <doc>}`                                        |
| `updated` | `{"doc": <doc>}`                                        |
| `removed` | `{"key": "..."}`                                        |

Each `<doc>` is `{"key", "label", "display", "kind", "watched", "stale", "html", "updatedAt"}` — `display` is the truncated label the tab shows, `stale` drives the badge, `html` is the pre-rendered content.

### Limits

At most 128 docs; markdown and files capped at 10 MiB (enforced on request bodies and again on every server-side read); keys up to 4096 characters (no control characters); labels up to 1024.

## Browser UI

A tab strip, a content area, a status dot. Clicking a tab mounts that doc's HTML and resets scroll to the top; each tab has a close button (a tokenless `DELETE`, so the reader is a first-class doc manager) and shows the full key as its tooltip, with a badge when the doc is stale. A freshly pushed doc activates its tab; updates never steal focus. Tail-follow keeps you pinned to the end while you're near the bottom — useful while an agent appends to the file. `/#<encoded-key>` deep-links to a doc, `document.title` follows the active tab, and an SSE reconnect preserves both the active tab and the scroll position.

## Security

- **The server binds `127.0.0.1` only.** This is hardcoded — there is no flag to expose it.
- **Every route validates the `Host` header** against `127.0.0.1`, `localhost`, and `[::1]`. This is the real boundary for the tokenless write surface: a DNS-rebound page (evil.com resolving to 127.0.0.1) makes requests that arrive from loopback, but its Host header still says evil.com and is rejected.
- The `/_/*` write surface additionally requires the TCP peer address to be loopback — defense in depth behind the Host gate.
- **There are no tokens.** Any process running on your machine can add, replace, or delete docs. The trust boundary is your local user session; if you don't trust local processes, don't run mdscroll.
- Server-side file reads accept absolute paths to regular files only and enforce the 10 MiB cap at read time.
- Rendering: `html: false` (raw HTML in the input is escaped), and dangerous URL schemes (e.g. `javascript:`) are rejected by markdown-it's default validator.
- The served HTML sets a strict `Content-Security-Policy`. The only remote origin allowed is `cdn.jsdelivr.net`, path-scoped to the pinned `mermaid@11.14.0`, used solely to lazy-load Mermaid the first time a diagram appears. If you don't want that network call, omit Mermaid diagrams or block the domain in your browser.

## Limitations

- **RAM only.** The server's memory is the only state. When the server exits — Ctrl+C, crash, reboot — every doc is gone and every push client has nothing to reconnect to. Re-push what you still need.
- **No daemon, no persistence, no auto-start.** Something has to run `mdscroll serve` (or the auto-serving default command) in a terminal that stays open.
- **Loopback only.** There is deliberately no way to serve to another machine.
- **No browser auto-open.** You open the printed URL yourself.
- One tab strip per port. Separate sessions need separate `--port` values, chosen explicitly — mdscroll never picks a random port for you.

## Agent integration

mdscroll ships an [Agent Skill](https://agentskills.io) ([`skills/mdscroll/SKILL.md`](https://github.com/k35o/mdscroll/blob/main/skills/mdscroll/SKILL.md)) so AI coding agents (Claude Code, Cursor, Codex, GitHub Copilot, ...) can write to a file and let the user watch it update in real time without copy-pasting.

Install with the GitHub CLI:

```bash
gh skill install k35o/mdscroll    # interactive picker; choose your agent target
```

Or any [agentskills.io](https://agentskills.io)-compatible installer (e.g. `npx skills add k35o/mdscroll`). The skill ends up at the agent's standard skills directory (e.g. `~/.claude/skills/mdscroll/SKILL.md` for Claude Code).

The flow the skill prescribes: probe with `mdscroll ls --json` (exit 2 → start `mdscroll serve` once per session), publish with `mdscroll push <file> --json`, iterate by simply editing the file — the server watches it, so there is no process to babysit and no state to carry across turns except the file path.

## Status

Early, but stable for daily personal use. Feedback welcome.

## License

MIT (c) k8o
