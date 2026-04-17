# mdscroll

Preview markdown in a local browser — instantly, with zero disk state.

Point `mdscroll` at a markdown file and it serves a beautifully rendered live view in your browser. Edit the file and the page updates itself over Server-Sent Events. Pipe markdown on stdin for a one-shot render. No lockfiles, no log files, nothing written to your home directory. One process, one browser tab, Ctrl+C to quit.

```bash
mdscroll plan.md           # watch + auto-reload on every change
cat plan.md | mdscroll     # one-shot: serve stdin once
```

mdscroll never opens a browser itself. It listens on a port and prints the URL — open it however your environment prefers (system browser, terminal multiplexer pane, AI agent helper, etc).

## Why

Terminal output is hard to read when you're reviewing a long plan or design doc. mdscroll gives that content a proper home in your browser — GitHub-style typography, syntax-highlighted code, rendered Mermaid diagrams — without spinning up a static site generator.

Designed for AI workflows: when an assistant writes a plan to a file, run `mdscroll <that-file>` once and watch it update in place as the assistant iterates.

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
- Zero disk state: no lockfile, no log, no `~/.mdscroll/`

## Usage

### Watch a file

```bash
mdscroll plan.md              # prints URL, watches plan.md for changes
mdscroll docs/design.md       # cwd-relative path shown in the header
```

Edit the file in any editor. mdscroll debounces the filesystem events (100 ms) and re-reads the file, so the browser sees the update within a tick. Works with editors that swap-save (vim `:w`, IDE autosave).

### Pipe stdin

```bash
cat plan.md | mdscroll
echo "# Hello" | mdscroll
```

mdscroll reads stdin to EOF, renders once, and stays in the foreground so the browser can connect. The header label is the first `# H1` line in the document, falling back to `(untitled)` when there isn't one.

### Flags

| Flag             | Default     | Description                                                              |
| ---------------- | ----------- | ------------------------------------------------------------------------ |
| `-p, --port <n>` | `4977`      | Port to listen on. If unavailable, falls back to a free port. `0` = auto |
| `-h, --host <h>` | `127.0.0.1` | Host to bind to                                                          |

### Stop

Ctrl+C in the terminal running `mdscroll`. The server closes, the watcher stops, the process exits. Nothing is left behind.

## How it works

1. `mdscroll <file>` reads the file, renders it with markdown-it + Shiki + Mermaid fence handler, and stores it in memory.
2. A minimal [Hono](https://hono.dev) HTTP server serves the SSR-rendered page plus an `/events` Server-Sent Events stream.
3. The browser subscribes to `/events` and swaps in new HTML whenever the server pushes an update.
4. A directory-scoped `fs.watch` tracks the input file (directory-scoped so editor swap-saves survive). On each change the file is re-read and the SSE subscribers get a new render.

Mermaid renders client-side from a pinned jsDelivr URL the first time a diagram appears.

## Security

- `html: false` — raw HTML in the input is escaped, not passed through.
- Dangerous URL schemes (e.g. `javascript:`) are rejected by markdown-it's default validator.
- There is no HTTP push endpoint — the server accepts no writes from the network. Content enters only through the watched file or stdin at startup.
- The served HTML sets a strict `Content-Security-Policy`. The only remote origin allowed is `cdn.jsdelivr.net`, used solely to lazy-load a pinned version of Mermaid (`mermaid@11.14.0`). If you don't want that network call, omit Mermaid diagrams or block the domain in your browser.
- The server binds to `127.0.0.1` by default. Override with `--host` only if you understand the exposure.

## Agent integration

mdscroll ships an [Agent Skill](https://agentskills.io) ([`skills/mdscroll/SKILL.md`](https://github.com/k35o/mdscroll/blob/main/skills/mdscroll/SKILL.md)) so AI coding agents (Claude Code, Cursor, Codex, GitHub Copilot, ...) can write to a file and let the user watch it update in real time without copy-pasting.

Install with the GitHub CLI:

```bash
gh skill install k35o/mdscroll    # interactive picker; choose your agent target
```

Or any [agentskills.io](https://agentskills.io)-compatible installer (e.g. `npx skills add k35o/mdscroll`). The skill ends up at the agent's standard skills directory (e.g. `~/.claude/skills/mdscroll/SKILL.md` for Claude Code).

Once installed, ask the agent to "write the plan and open it in mdscroll" — the agent writes to a file and tells you the `mdscroll` command to run.

## Status

Early, but stable for daily personal use. Feedback welcome.

## License

MIT (c) k8o
