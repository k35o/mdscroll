# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

`mdscroll` is a CLI + lightweight HTTP server that displays Markdown content in a browser, designed for **AI integration**: pipe AI-generated plans/drafts/reports into a beautifully rendered local view, with hot-update via SSE.

The killer flow:

1. `mdscroll` — start server + open browser (idempotent; no-op if already running)
2. `mdscroll push <file>` or `... | mdscroll push` — push content; the open browser updates instantly

A Claude Code Skill wraps this so plans show up in the browser the moment they're generated.

## Architecture

- **Monorepo** with pnpm workspaces. Single package for now: `packages/mdscroll`.
- **Toolchain**: `vite-plus` (`vp`) for build (`vp pack` → tsdown), lint/format (`vp check` → oxlint + oxfmt), and task running (`vp run -r`).
- **Server**: Hono + `@hono/node-server`. Three routes: `/` (HTML), `/push` (POST), `/events` (SSE).
- **Renderer**: `markdown-it` for parsing, `shiki` for code highlighting. Mermaid loads client-side via CDN initially.
- **Auto-spawn**: When `push` runs and no server is up, it spawns one detached and waits briefly before POSTing. Lockfile at `~/.mdscroll/server.lock`.

## Commands

```bash
pnpm install                  # Install (verifyDepsBeforeRun: install enforces freshness)
pnpm build                    # Build all packages (vp pack)
pnpm test                     # Run vitest across packages
pnpm typecheck                # tsc --noEmit
pnpm check                    # vp check (oxlint + oxfmt)
pnpm check:write              # vp check --fix
```

## Conventions

- **TypeScript**: 6.0.x stable (not native-preview). Strict mode + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`.
- **ESM only**, `.d.mts` for types.
- **Single quotes**, no `interface` (use `type`).
- **`minimumReleaseAge: 10080`** (7 days) on workspace — pin versions in catalog older than 7 days. New deps must wait or be backed off to a 7-day-old release.
- **Catalog**: All shared deps go in `pnpm-workspace.yaml` `catalog:`. Packages reference them via `"<dep>": "catalog:"`.

## Adding a new dependency

1. Find a version released ≥ 7 days ago (`pnpm view <pkg> time --json`).
2. Add to `pnpm-workspace.yaml` `catalog:`.
3. Reference as `"catalog:"` in the package's `package.json`.
4. `pnpm install`.

## Publishing

Not yet wired up. Will use Changesets when ready for v0.1.0.
