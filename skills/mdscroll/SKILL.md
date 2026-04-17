---
name: mdscroll
description: Preview generated Markdown (plans, design notes, reviews, research reports) in the user's browser. Use when sharing long, structured output — documents with headings, tables, code blocks, or Mermaid diagrams — that is hard to read in the terminal.
license: MIT
---

# mdscroll

Push generated Markdown to the local mdscroll preview server. It renders content with GitHub-style styling, Shiki syntax highlighting, Mermaid diagrams, GFM alerts, task lists, and tables. Recent pushes (last 20) are listed in a History drawer.

## When to use

Use this skill when ANY of the following is true:

- The user explicitly asks: "show it in the browser", "preview this", "open it in mdscroll", or similar
- You produced a structured document (roughly 20+ lines, or containing headings, tables, code blocks, or Mermaid) that would be cumbersome to read scrolling the terminal
- You are delivering a plan, design doc, code review, or research report — the kind of output the user will sit down and read

Do NOT use this for short answers, one-off replies, or small code snippets.

## How to use

Two input shapes:

```bash
# 1) Stream content directly via stdin (most common for AI-generated text)
cat <<'MDSCROLL_EOF' | mdscroll push
# Title

Body...
MDSCROLL_EOF

# 2) Existing file on disk — `mdscroll <file>` is a shortcut for `mdscroll push <file>`
mdscroll docs/plan.md
```

Both paths auto-spawn the server if it isn't already running, then exit. Stdout includes the **browser URL** you can hand to the user or open:

```
mdscroll[default]: pushed to http://127.0.0.1:4977/
```

## Steps

1. Assemble the Markdown you want to display
2. Push it using one of the commands above
3. If the exit code is 0 and you see `mdscroll[...]: pushed to <url>` (the URL ends with `/`, not `/push`), it worked
4. mdscroll never opens a browser itself. Open the URL in whatever browser surface fits the host environment (e.g. `cmux browser open-split <url>` inside cmux) and point the user at it

## Notes for the History drawer

- Each push is recorded as a snapshot. The drawer (toggle in the page header) lists them newest-first
- The "source" label shown in the drawer is the path **relative to the cwd at push time** (e.g. `packages/foo/README.md`), or `stdin` for piped input. This lets the user disambiguate same-named files
- The user can click any past snapshot to view it; "Back to live" returns to the latest

## Useful flags

- `--name <n>` (on `push` and `start`) — isolated instance with its own port, content, and history. Default is `default`. Use this when the user wants two preview windows side-by-side (e.g. `--name plan` and `--name review`)
- `--port <n>` / `--host <h>` — defaults are `127.0.0.1:4977`; if the port is taken mdscroll falls back to a free one
- `mdscroll list` — prints every alive instance (NAME / PID / URL / STARTED), handy if you forget what's running

## When the command is missing

If `mdscroll: command not found` appears, guide the user to install:

```bash
pnpm add -g mdscroll   # or: npm i -g mdscroll
```
