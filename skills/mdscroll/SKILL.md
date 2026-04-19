---
name: mdscroll
description: Preview generated Markdown (plans, design notes, reviews, research reports) in the user's browser. Use when sharing long, structured output — documents with headings, tables, code blocks, or Mermaid diagrams — that is hard to read in the terminal.
license: MIT
---

# mdscroll

Serve generated Markdown to the local mdscroll preview server so the user can read it in their browser. It renders content with GitHub-style styling, Shiki syntax highlighting, Mermaid diagrams, GFM alerts, task lists, and tables. Point it at a file and every change to that file is auto-reloaded in the browser over Server-Sent Events. Multiple invocations cooperate — a second file opened with `mdscroll` shows up as a new tab in the same browser window, not on a new port.

## When to use

Use this skill when ANY of the following is true:

- The user explicitly asks: "show it in the browser", "preview this", "open it in mdscroll", or similar
- You produced a structured document (roughly 20+ lines, or containing headings, tables, code blocks, or Mermaid) that would be cumbersome to read scrolling the terminal
- You are delivering a plan, design doc, code review, or research report — the kind of output the user will sit down and read

Do NOT use this for short answers, one-off replies, or small code snippets.

## How to use

mdscroll is a foreground process with two input shapes. Each invocation either becomes the preview server (if nothing else is using the port) or attaches as an additional tab on the server that is already running. The user's terminal output tells you which happened:

- `mdscroll running at http://127.0.0.1:4977` — this invocation is the server.
- `mdscroll attached to http://127.0.0.1:4977 (<label>)` — this invocation is a client; another mdscroll owned the port.

You don't have to do anything differently in either case.

### 1) Write to a file, let mdscroll watch it (preferred for iterative work)

```bash
# Agent writes the doc to a file under the user's cwd:
cat > docs/plan.md <<'MDSCROLL_EOF'
# Title

Body...
MDSCROLL_EOF

# Then tell the user to run (or start it in a separate pane):
mdscroll docs/plan.md
```

As you update `docs/plan.md` in later turns, the browser auto-reloads within ~100 ms. This is the right shape when the user wants to keep reading while you iterate. If the user already has a mdscroll tab open for something else, this command will add a second tab alongside it rather than starting a new server.

### 2) Stream once via stdin (good for throwaway output)

```bash
cat <<'MDSCROLL_EOF' | mdscroll
# Title

Body...
MDSCROLL_EOF
```

The server renders the piped markdown once and stays foreground until Ctrl+C. No auto-reload — if you want to push an updated version, re-run the command (it will replace nothing; it adds a new tab). Prefer the file-watch form if you expect further edits.

## Output

mdscroll prints a one-line banner and keeps running:

```
mdscroll running at http://127.0.0.1:4977          # first / server invocation
mdscroll attached to http://127.0.0.1:4977 (plan.md)  # later / client invocations
```

mdscroll never opens a browser itself. Hand the URL to the user or, if the host environment supports it, open it through the environment's browser helper (e.g. `cmux browser open-split <url>` inside cmux).

## Steps

1. Decide between file-watch mode (when the user will iterate on the content) and stdin mode (one-shot output).
2. For file-watch: write the Markdown to a file under the user's cwd, then suggest `mdscroll <file>` (or run it yourself in a separate pane).
3. For stdin: pipe the content to `mdscroll` using a heredoc.
4. Confirm the URL was printed. If the banner says "attached to" rather than "running at", tell the user it joined the existing tab strip.

## Useful flags

- `--port <n>` / `--host <h>` — defaults are `127.0.0.1:4977`. The same port is used both to bind (server mode) and to attach to (client mode). If a non-mdscroll process owns the port, mdscroll falls back to a random free port and becomes a server there — the actual URL is always printed on startup.

## What mdscroll does NOT do

- There is no persistent background server and no subcommand surface. `mdscroll push`, `mdscroll stop`, `mdscroll list`, and `--name` existed in 0.1.x but were removed in 0.2.0. Starting from 0.3.0, "push" behaviour is implicit: a second `mdscroll <file>` invocation automatically attaches to the running instance over TCP.
- It writes nothing to disk — no lockfile, no log, no `~/.mdscroll/`.
- It does not auto-open a browser.

## When the command is missing

If `mdscroll: command not found` appears, guide the user to install:

```bash
pnpm add -g mdscroll   # or: npm i -g mdscroll
```
