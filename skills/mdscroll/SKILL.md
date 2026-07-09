---
name: mdscroll
description: Preview generated Markdown (plans, design notes, reviews, research reports) in the user's browser. Use when sharing long, structured output — documents with headings, tables, code blocks, or Mermaid diagrams — that is hard to read in the terminal.
license: MIT
---

# mdscroll

Push generated Markdown to a local preview server so the user can read it in their browser. One long-lived `mdscroll serve` process per session hosts a browser tab strip; every other invocation is a short-lived command that pushes, lists, or removes a document and exits immediately. The server renders content with GitHub-style styling, Shiki syntax highlighting, Mermaid diagrams, GFM alerts, task lists, and tables. When you push a file, the server watches it — later edits to the file auto-reload in the browser, with no process left running on your side.

## When to use

Use this skill when ANY of the following is true:

- The user explicitly asks: "show it in the browser", "preview this", "open it in mdscroll", or similar
- You produced a structured document (roughly 20+ lines, or containing headings, tables, code blocks, or Mermaid) that would be cumbersome to read scrolling the terminal
- You are delivering a plan, design doc, code review, or research report — the kind of output the user will sit down and read

Do NOT use this for short answers, one-off replies, or small code snippets.

## Exit codes (the contract)

Every command exits with one of three codes. Branch on them, not on output text:

- `0` — success.
- `1` — error: bad input, the server rejected the doc, or the port is squatted. If stderr says `port <n> is held by a non-mdscroll process`, pick another port with `-p <n>` and pass the same `-p` (or set `MDSCROLL_PORT`) on **every** later mdscroll call in the session.
- `2` — strictly "no server is listening on the port". `mdscroll serve` fixes it; nothing else does.

## Workflow

Every step below is a terminating command — you never keep an mdscroll process attached to your own shell (the only long-lived process is `serve`, and it belongs in its own pane or the background).

### 1. Ensure a server exists

```bash
mdscroll ls --json
```

- Exit `0` — a server is up; proceed.
- Exit `2` — start `mdscroll serve` **once** in a separate pane or as a background process (not in your foreground shell — it blocks until Ctrl+C). Then poll for readiness, giving up after ~2 seconds:

  ```bash
  for i in 1 2 3 4 5 6 7 8 9 10; do
    mdscroll ls --json >/dev/null 2>&1 && break
    sleep 0.2
  done
  mdscroll ls --json   # still exit 2 here means serve failed to start — report it
  ```

  `serve` is idempotent: if one is already running it prints the URL and exits 0, so racing another session is harmless.

- Exit `1` with the squatter message — some non-mdscroll process owns the port. Choose another (e.g. `-p 4978`) and remember to pass it on every subsequent call, or `export MDSCROLL_PORT=4978` once.

### 2. Publish a document

Write the Markdown to a file that will **keep existing** for as long as the user reads it — the server watches the path, and deleting the file marks the tab stale. Use a stable workspace path (e.g. `docs/plan.md` or a notes directory under the project), never an auto-cleaned temp directory.

```bash
mdscroll push docs/plan.md --json
```

Prints one line of JSON:

```json
{
  "url": "http://127.0.0.1:4977/#%2Fabs%2Fpath%2Fdocs%2Fplan.md",
  "key": "/abs/path/docs/plan.md",
  "replaced": false
}
```

Hand the `url` to the user (mdscroll never opens a browser itself; if the host environment has a browser helper, you may open it there). Keep the `key` — it is what `mdscroll rm` takes at cleanup time. The command exits immediately; the server owns the file watch.

### 3. Iterate

Editing the file is enough — the server picks up the change and the browser reloads within ~100 ms. No command needed per edit.

Re-running `push` on the same file is free and idempotent (`"replaced":true`, same URL). Do it whenever you announce an update to the user: it costs nothing when the doc is already live, and it self-heals the tab if the serve process was restarted in the meantime.

### 4. One-shot pipes

For throwaway output that has no file, pipe to push:

```bash
generate-report | mdscroll push --name review-notes --json
```

**Always pass `--name <slug>`.** Anonymous pipes all share the single `untitled` tab, so a second nameless push from anywhere silently replaces the first. Re-piping with the same name replaces that tab intentionally — that is the update mechanism for piped docs (there is no file to watch). `--name` applies to stdin only; file docs are keyed by their path and reject `--name`.

### 5. Cleanup

When a document is no longer needed:

```bash
mdscroll rm <key>
```

Use the `key` returned by `push` — it resolves even after the underlying file has been deleted. `rm` removes the browser tab, never the file. Removing a doc that is already gone exits 0 (with a note), so cleanup is safe to repeat.

No per-doc teardown is required beyond this: every doc lives in the serve process's memory and dies with it when the user closes the serve pane.

## Command reference

- `mdscroll serve` — start the session server; exit 0 if one already runs. Blocks until Ctrl+C.
- `mdscroll ls [--json]` — list docs (`key`, `watched|static|stale` state, label). Doubles as the is-a-server-up probe (exit 2 when none).
- `mdscroll push [file] [--name <slug>] [--json]` — push a doc; never becomes the server (exit 2 when none).
- `mdscroll rm <doc> [--json]` — remove a doc by key, path, or name.
- `mdscroll <file>` — push-or-serve convenience for humans: pushes if a server exists, otherwise becomes one and blocks. Prefer `serve` + `push` so your commands always terminate.
- `-p, --port <n>` (or `MDSCROLL_PORT`) — target port, default `4977`. The server binds loopback only.

## What mdscroll does NOT do

- It writes nothing to disk — no lockfile, no log, no `~/.mdscroll/`. All state lives in the serve process.
- It does not auto-open a browser.
- It does not fall back to a random port. A squatted port is exit 1 with an explicit message; port choice is always yours.

## When the command is missing

If `mdscroll: command not found` appears, guide the user to install:

```bash
pnpm add -g mdscroll   # or: npm i -g mdscroll
```
