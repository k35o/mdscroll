# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`mdscroll` is a CLI + lightweight HTTP server that displays Markdown in a browser. Built for AI workflows: pipe an AI-generated plan into a live local view that auto-updates via SSE.

Two commands:

1. `mdscroll` — start server + open browser. Idempotent (lockfile-guarded).
2. `mdscroll push <file>` or `... | mdscroll push` — update content. Auto-spawns the server if it isn't running.

## Architecture

Monorepo (pnpm workspaces). One package today: `packages/mdscroll`.

Source layout (`packages/mdscroll/src/`):

| File          | Responsibility                                                                                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli.ts`      | commander entry. Defines `start` (default) and `push`.                                                                                                                  |
| `start.ts`    | `runStart`: warm up Shiki, build app, bind port, write lockfile, open browser, handle SIGINT/SIGTERM.                                                                   |
| `push.ts`     | `runPush`: read file or stdin, POST to `/push`. If no server, spawn detached and retry for ~4.5s.                                                                       |
| `server.ts`   | `createApp(store)` (testable Hono app) + `startServer(opts)` (binds via `@hono/node-server`). Routes: `/`, `/style.css`, `/main.js`, `POST /push`, `GET /events` (SSE). |
| `render.ts`   | markdown-it + shiki. Async memoized highlighter. Custom fence rule emits `<pre class="mermaid">` for `mermaid` blocks. Plugins: task lists, GFM alerts.                 |
| `state.ts`    | In-memory `Store` with versioned snapshots + listener subscriptions.                                                                                                    |
| `lockfile.ts` | `~/.mdscroll/server.lock` with dead-PID cleanup. `dir` is an optional parameter to keep tests off the real home directory.                                              |
| `client.ts`   | Inline HTML / CSS / JS the server ships to the browser. Mermaid loads client-side from CDN.                                                                             |

Data flow on push:

```
CLI push → POST /push → Store.set → listeners → SSE writeSSE → browser swaps #mdscroll-content
```

## Commands

```bash
pnpm install          # respects minimumReleaseAge (7d), verifyDepsBeforeRun: install
pnpm build            # vp run -r build (→ vp pack → tsdown → dist/cli.mjs with shebang)
pnpm test             # vitest (~350ms, 68 tests)
pnpm typecheck        # tsc --noEmit
pnpm check            # oxlint + oxfmt
pnpm check:write      # auto-fix
```

Single package:

```bash
pnpm -F mdscroll build
pnpm -F mdscroll test
pnpm -F mdscroll dev      # vp pack --watch
```

## Conventions

- **TypeScript 6.0 stable** (not native-preview). Strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`.
- **ESM only**, module `NodeNext`. `.js` extension in relative imports.
- **`type` only** — no `interface`.
- **Single quotes** (oxfmt).
- **No emojis** in source or docs unless explicitly requested.
- **`catalog:`** for every shared dep. New deps must have a version published ≥ 7 days ago (`minimumReleaseAge: 10080`).
- **Testing philosophy**: see `~/.claude/skills/testing/`. Summary:
  - AAA (Arrange-Act-Assert) structure
  - 1 test 1 behavior
  - Japanese `describe` / `it` names describing behavior, not implementation
  - Per-test isolation (e.g. `tmpdir` for lockfile tests)
  - Avoid self-fulfilling assertions (don't recompute the expected in the test)

## Adding a dependency

1. Find a version published ≥ 7 days ago (`curl registry.npmjs.org/<pkg>` → inspect `time`).
2. Add to `pnpm-workspace.yaml` `catalog:`.
3. Reference as `"catalog:"` in the consuming package's `package.json`.
4. `pnpm install`.

## Release (not yet wired)

Changesets will be added before `v0.1.0`:

```
pnpm changeset         # record the change
pnpm changeset version # bump + update CHANGELOG
pnpm build
pnpm changeset publish # push to npm
```
