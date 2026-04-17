# mdscroll

Push markdown to a local browser preview — instantly.

Pipe AI-generated plans, drafts, or reports into a beautifully rendered live view. Two commands, zero config.

```bash
mdscroll                         # start server + open browser (empty preview)
mdscroll README.md               # start + show this file immediately
echo "# Hello" | mdscroll push   # browser updates instantly
mdscroll push plan.md            # or push a file
mdscroll stop                    # stop the running server
```

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
- Auto-spawn: `mdscroll push` starts the server if it isn't already running
- Idempotent start: running `mdscroll` when a server is already up just opens the browser
- Tiny bundle (~19KB, ~6KB gzipped)

## Usage

### Start the server

```bash
mdscroll                    # starts on 127.0.0.1:4977, opens browser (empty preview)
mdscroll README.md          # also shows README.md immediately
mdscroll --port 5000        # custom port
mdscroll --host 0.0.0.0     # bind to all interfaces
mdscroll --no-open          # don't auto-open the browser
```

If a server is already running, `mdscroll` is a no-op (just opens the browser); `mdscroll <file>` pushes that file to the running server.

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

### Flags

| Flag             | Default     | Description                                                              |
| ---------------- | ----------- | ------------------------------------------------------------------------ |
| `-p, --port <n>` | `4977`      | Port to listen on. If unavailable, falls back to a free port. `0` = auto |
| `-h, --host <h>` | `127.0.0.1` | Host to bind to                                                          |
| `--no-open`      | —           | Skip opening the browser (start)                                         |

## How it works

1. `mdscroll` boots a minimal [Hono](https://hono.dev) HTTP server and records a lock file at `~/.mdscroll/server.lock`.
2. The server serves an SSR-rendered page plus an `/events` SSE stream.
3. `mdscroll push` POSTs markdown to the running server (auto-spawning it if needed).
4. The server re-renders the document and broadcasts the new HTML over SSE.
5. The open browser swaps in the new content — no reload, no flicker.

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
