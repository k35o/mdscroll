# mdscroll

Push markdown to a local browser preview — instantly.

Pipe AI-generated plans, drafts, or reports into a beautifully rendered live view. Two commands, zero config.

```bash
mdscroll                         # start server, print URL (no browser)
mdscroll README.md               # start + seed with this file
echo "# Hello" | mdscroll push   # update content; open browser updates instantly
mdscroll push plan.md            # or push a file
mdscroll list                    # show all running instances
mdscroll stop                    # stop the running server
```

mdscroll never opens a browser by itself. It just listens on a port and prints the URL — open it however your environment likes (system browser, terminal multiplexer pane, AI agent helper, etc).

## Why

Terminal output is hard to read when you're reviewing a long plan. mdscroll gives that content a proper home in your browser — GitHub-style typography, syntax-highlighted code, rendered Mermaid diagrams — without spinning up a static site generator.

Designed for AI workflows: when an assistant hands you a multi-section plan, pipe it in and read it on a real page.

## Install

```bash
pnpm add -g mdscroll
# or: npm i -g mdscroll
# or one-off: npx mdscroll ...
```

## Features

- GitHub-style rendering with automatic light/dark theme
- Syntax highlighting via [Shiki](https://shiki.style) (20+ languages, light + dark dual theme)
- [Mermaid](https://mermaid.js.org) diagrams (flowcharts, sequence diagrams, …)
- GFM extras: task lists, [alerts](https://github.com/orgs/community/discussions/16925) (Note / Tip / Important / Warning / Caution), tables, strikethrough, autolink
- Live update via Server-Sent Events — no manual reload
- Push history (last 20) accessible from a right-side drawer; click to view a past snapshot
- Named instances (`--name`) for working on more than one document in parallel
- Auto-spawn: `mdscroll push` starts the server if it isn't already running
- Idempotent start: running `mdscroll` when a server is already up just opens the browser

## Usage

### Start the server

```bash
mdscroll                    # starts on 127.0.0.1:4977, prints URL
mdscroll README.md          # seeds the server with README.md
mdscroll --port 5000        # custom port
mdscroll --host 0.0.0.0     # bind to all interfaces
```

If a server is already running, `mdscroll` is a no-op that re-prints the URL; `mdscroll <file>` pushes that file to the running server.

### Push content

```bash
mdscroll push plan.md       # a file
mdscroll push < plan.md     # via stdin redirect
echo "# hi" | mdscroll push # via pipe
cat a.md b.md | mdscroll push  # concatenated
```

Each push replaces the current content. The browser re-renders via SSE.

### Stop the server

```bash
mdscroll stop               # SIGTERM the lockfile pid; lockfile is cleaned up
```

### Multiple instances

Each `--name` is an isolated server with its own port, browser tab, and history. Default name is `default`.

```bash
mdscroll --name plan plan.md       # one workspace
mdscroll --name review review.md   # another, side-by-side
mdscroll push --name plan more.md  # push targets the named instance
mdscroll list                      # NAME / PID / URL / STARTED for every alive instance
mdscroll stop --name plan          # stop a specific one
```

### History

Every push is recorded as a snapshot (last 20 are kept). The browser has a right-side drawer — open it from the panel icon in the header. Each entry shows time and source (filename or `stdin`). Click a past entry to view it; click "Back to live" to follow the latest push again.

The drawer uses the native [Popover API](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API) — open with the toggle button, dismiss with `Esc`, click outside, or the close button.

### Flags

| Flag             | Default     | Description                                                              |
| ---------------- | ----------- | ------------------------------------------------------------------------ |
| `-n, --name <n>` | `default`   | Instance name (lockfile, port, content, and history are per-name)        |
| `-p, --port <n>` | `4977`      | Port to listen on. If unavailable, falls back to a free port. `0` = auto |
| `-h, --host <h>` | `127.0.0.1` | Host to bind to                                                          |

## How it works

1. `mdscroll` boots a minimal [Hono](https://hono.dev) HTTP server and records a lock file at `~/.mdscroll/<name>.lock`.
2. The server serves an SSR-rendered page plus an `/events` SSE stream.
3. `mdscroll push` POSTs markdown to the running server (auto-spawning it if needed) and forwards the source filename via `X-Mdscroll-Source`.
4. The server appends a Snapshot to its in-memory history (capped at 20) and broadcasts `{ html, current, history }` over SSE.
5. The open browser swaps in the new content — no reload, no flicker. The history drawer updates in place.
6. Clicking a past snapshot fetches `/api/snapshot/:id` to render that point in time without leaving live mode.

Mermaid renders client-side from CDN the first time a diagram appears, then re-renders after each update.

## Security

- `html: false` — raw HTML in input is escaped, not passed through.
- Dangerous URL schemes (e.g. `javascript:`) are rejected by markdown-it's default validator.
- The server binds to `127.0.0.1` by default. Override with `--host` only if you understand the exposure.

## Claude Code integration

mdscroll ships a [Claude Code Skill](https://docs.claude.com/en/docs/claude-code/skills) so that an AI assistant can send its own generated Markdown to your browser without manual piping.

Install the skill once:

```bash
mdscroll install-skill
# writes ~/.claude/skills/mdscroll/SKILL.md
```

With the skill installed, Claude Code automatically uses `mdscroll push` when you ask it to "show me the plan in the browser" or when it generates a long structured document that would be easier to read rendered.

Options:

```bash
mdscroll install-skill --name show        # install as ~/.claude/skills/show/
mdscroll install-skill --dir /custom/path # install to a different directory
```

## Status

Early, but stable for daily personal use. Feedback welcome.

## License

MIT © k8o
