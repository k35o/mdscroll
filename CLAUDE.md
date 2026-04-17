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

```
src/
├── cli.ts                     # commander entry; wires up every command
├── port.ts                    # resolvePort (get-port) — prefer requested, fall back to free
├── skill.ts                   # SKILL_MD + installSkill/resolveSkillPath (core)
├── types.d.ts                 # ambient types (untyped markdown-it-task-lists)
├── commands/                  # runX functions — one per CLI command
│   ├── start.ts               # warm Shiki, bind, write lockfile, open browser
│   ├── push.ts                # POST /push; auto-spawn + poll lockfile for port
│   └── install-skill.ts       # thin CLI wrapper around installSkill
├── server/                    # HTTP + rendering + browser assets
│   ├── app.ts                 # createApp(store) (testable) + startServer(opts)
│   ├── render.ts              # markdown-it + shiki + mermaid fence + GFM plugins
│   └── client.ts              # inline HTML / CSS / JS for the browser
└── store/                     # shared in-process state and on-disk persistence
    ├── state.ts               # in-memory Store with versioned snapshots + listeners
    └── lockfile.ts            # ~/.mdscroll/server.lock with dead-PID cleanup
```

Tests live alongside their source (`*.test.ts`).

Data flow on push:

```
CLI push → POST /push → Store.set → listeners → SSE writeSSE → browser swaps #mdscroll-content
```

## Commands

```bash
pnpm install          # respects minimumReleaseAge (7d), verifyDepsBeforeRun: install
pnpm build            # vp run -r build (→ vp pack → tsdown → dist/cli.mjs with shebang)
pnpm test             # vitest (~350ms, 78 tests)
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
- **English only** for all in-repo text (SKILL.md content, tests, comments, docs) — this is a public npm package.
- **Testing philosophy**: see `~/.claude/skills/testing/`. Summary:
  - AAA (Arrange-Act-Assert) structure
  - 1 test 1 behavior
  - `describe` / `it` names describe behavior, not implementation
  - Per-test isolation (e.g. `tmpdir` for lockfile tests)
  - Avoid self-fulfilling assertions (don't recompute the expected in the test)

## Adding a dependency

1. Find a version published ≥ 7 days ago (`curl registry.npmjs.org/<pkg>` → inspect `time`).
2. Add to `pnpm-workspace.yaml` `catalog:`.
3. Reference as `"catalog:"` in the consuming package's `package.json`.
4. `pnpm install`.

## Release

Versioning and publishing use [Changesets](https://github.com/changesets/changesets).

```bash
pnpm changeset       # record the change (interactive; writes .changeset/<name>.md)
pnpm version         # bumps package.json + CHANGELOG based on pending changesets
pnpm release         # pnpm build && changeset publish (to npm)
```

Config: `.changeset/config.json` uses `@changesets/changelog-github` (repo `k35o/mdscroll`) and `access: public`. Baseline branch is `main`.
