# mdscroll

Preview markdown in a local browser — instantly, with zero disk state. Open a second (or third, or fourth) file in another terminal and they all appear as tabs in the same browser window.

Point `mdscroll` at a markdown file and it serves a beautifully rendered live view in your browser. Edit the file and the page updates itself over Server-Sent Events. Start `mdscroll` again from another shell with a different file — that second invocation discovers the first one over TCP, POSTs its document, and shows up as a new tab in the already-open browser. Pipe markdown on stdin for a one-shot tab. No lockfiles, no log files, nothing written to your home directory. Foreground processes, Ctrl+C to quit any of them.

```bash
mdscroll plan.md           # first run: watch + auto-reload on every change
mdscroll notes.md          # second run: same URL, added as a new tab
cat scratch.md | mdscroll  # stdin variant: also a tab
```

mdscroll never opens a browser itself. The first run prints the URL — open it however your environment prefers (system browser, terminal multiplexer pane, AI agent helper, etc.). Later runs print `mdscroll attached to <URL>` so you know they went to the same place.

## Why

Terminal output is hard to read when you're reviewing a long plan or design doc. mdscroll gives that content a proper home in your browser — GitHub-style typography, syntax-highlighted code, rendered Mermaid diagrams — without spinning up a static site generator.

Designed for AI workflows: when an assistant writes a plan to a file, run `mdscroll <that-file>` once and watch it update in place as the assistant iterates. When the assistant produces a second or third artifact, open those too — they show up as tabs alongside.

## Install

```bash
pnpm add -g mdscroll
# or: npm i -g mdscroll
# or one-off: npx mdscroll ...
```

## Features

- GitHub-style rendering with automatic light/dark theme
- Syntax highlighting via [Shiki](https://shiki.style) (20+ languages, light + dark dual theme)
- [Mermaid](https://mermaid.js.org) diagrams (flowcharts, sequence diagrams, etc.)
- GFM extras: task lists, [alerts](https://github.com/orgs/community/discussions/16925) (Note / Tip / Important / Warning / Caution), tables, strikethrough, autolink
- Live reload via Server-Sent Events — no manual refresh, no flicker
- Multi-document tabs: concurrent `mdscroll <file>` calls share a single browser window
- Zero disk state: no lockfile, no log, no `~/.mdscroll/`

## Usage

### Watch a file

```bash
mdscroll plan.md              # prints URL, watches plan.md for changes
mdscroll docs/design.md       # cwd-relative path shown in the tab label
```

Edit the file in any editor. mdscroll debounces the filesystem events (100 ms) and re-reads the file, so the browser sees the update within a tick. Works with editors that swap-save (vim `:w`, IDE autosave).

### Open a second (or third) file

Run `mdscroll` again from another shell, pointing at a different file:

```bash
mdscroll notes.md             # prints: "mdscroll attached to http://127.0.0.1:4977 (notes.md)"
```

The browser shows both files as tabs. Click between them. Each tab auto-reloads from its own file. When you Ctrl+C one of the shells, that tab disappears; the others keep working. Crash-kill (`kill -9`) is handled too — the server notices the dead owner within ~5 seconds and removes its tab.

### Pipe stdin

```bash
cat plan.md | mdscroll
echo "# Hello" | mdscroll
```

mdscroll reads stdin to EOF, renders once, and stays in the foreground so the browser can connect. The tab label is the first `# H1` line in the document, falling back to `(untitled)` when there isn't one. Stdin tabs don't live-reload — there's no file to watch.

### Flags

| Flag             | Default     | Description                                                                                                   |
| ---------------- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| `-p, --port <n>` | `4977`      | Port to bind (server mode) or discover (client mode). If a non-mdscroll owns it, falls back to a random port. |
| `-h, --host <h>` | `127.0.0.1` | Host to bind to                                                                                               |

### Stop

Ctrl+C in the terminal running `mdscroll`. If this process was the server, the server closes and all other clients' tabs drop from the browser (their shells keep running but print a warning on their next push attempt — typically you Ctrl+C them too). If this process was a client, it `DELETE`s its tab and exits. Nothing is left on disk either way.

## How it works

1. Every `mdscroll` invocation first tries to bind the requested port. If that succeeds, it becomes the **server**: it loads the file (or stdin), registers one document in its in-memory store, and starts the HTTP/SSE server.
2. If the bind fails with `EADDRINUSE`, the invocation probes `GET /_/health`. A response tagged `{ "agent": "mdscroll", ... }` means another mdscroll is there: this invocation becomes a **client** — it `POST /_/docs`, receives an `{ id, token }`, and the watcher streams its file updates via `PUT /_/docs/:id`. On Ctrl+C it `DELETE`s its document.
3. If the port is held by something unrelated (non-mdscroll), the invocation falls back to a random free port (via `get-port`) and becomes a server there. The fallback port is printed so you can still reach it.
4. The browser subscribes to `/events` (SSE). The stream sends `init` (all current docs, pre-rendered), plus `added` / `updated` / `removed` as the store changes. The tab strip and content area are driven entirely by those events.
5. The server GCs zombie tabs by running `process.kill(ownerPid, 0)` every 5 seconds — any client whose process is gone loses its tab.

Mermaid renders client-side from a pinned jsDelivr URL the first time a diagram appears.

## Security

- `html: false` — raw HTML in the input is escaped, not passed through.
- Dangerous URL schemes (e.g. `javascript:`) are rejected by markdown-it's default validator.
- The push endpoints (`POST /_/docs`, `PUT /_/docs/:id`, `DELETE /_/docs/:id`) are only reachable from localhost by default. Each document carries a per-document random write token returned on POST; `PUT` / `DELETE` require `Authorization: Bearer <token>`. The token prevents one local mdscroll from accidentally overwriting another's document — it is not a security boundary against hostile local processes. If you bind a non-loopback host, do not treat the push endpoints as authenticated.
- The served HTML sets a strict `Content-Security-Policy`. The only remote origin allowed is `cdn.jsdelivr.net`, used solely to lazy-load a pinned version of Mermaid (`mermaid@11.14.0`). If you don't want that network call, omit Mermaid diagrams or block the domain in your browser.
- The server binds to `127.0.0.1` by default. Override with `--host` only if you understand the exposure.

## Agent integration

mdscroll ships an [Agent Skill](https://agentskills.io) ([`skills/mdscroll/SKILL.md`](https://github.com/k35o/mdscroll/blob/main/skills/mdscroll/SKILL.md)) so AI coding agents (Claude Code, Cursor, Codex, GitHub Copilot, ...) can write to a file and let the user watch it update in real time without copy-pasting.

Install with the GitHub CLI:

```bash
gh skill install k35o/mdscroll    # interactive picker; choose your agent target
```

Or any [agentskills.io](https://agentskills.io)-compatible installer (e.g. `npx skills add k35o/mdscroll`). The skill ends up at the agent's standard skills directory (e.g. `~/.claude/skills/mdscroll/SKILL.md` for Claude Code).

Once installed, ask the agent to "write the plan and open it in mdscroll" — the agent writes to a file and tells you the `mdscroll` command to run. If you already have a preview running for something else, the agent's command will just attach as a new tab.

## Status

Early, but stable for daily personal use. Feedback welcome.

## License

MIT (c) k8o
