# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`mdscroll` is a CLI + lightweight HTTP server that displays Markdown in a browser. Built for AI workflows: pipe an AI-generated plan into a live local view that auto-updates via SSE.

Surface area:

- `mdscroll [file]` — start server (idempotent, lockfile-guarded). Optional file is shown immediately. **Does not open a browser** — only prints the URL.
- `mdscroll push [file]` — push a file or stdin to the running server. Auto-spawns if needed.
- `mdscroll stop` — SIGTERM the lockfile pid.
- `mdscroll list` — table of every alive instance.
- `mdscroll install-skill` — write the bundled SKILL.md to `~/.claude/skills/`.

Each command (except `install-skill`/`list`) accepts `--name <n>` to scope to an isolated instance (default: `default`). Lockfiles, ports, content, and history are per-name.

Browser opening is intentionally not handled by the CLI. The host environment (system default browser, cmux pane, an AI agent's open-helper, etc) is responsible for navigating to the URL.

## Architecture

Monorepo (pnpm workspaces). One package today: `packages/mdscroll`.

Source layout (`packages/mdscroll/src/`):

```
src/
├── cli.ts                     # commander entry; wires up every command (--name on start/push/stop)
├── port.ts                    # resolvePort (get-port) — prefer requested, fall back to free
├── skill.ts                   # SKILL_MD + installSkill/resolveSkillPath (core)
├── types.d.ts                 # ambient types (untyped markdown-it-task-lists)
├── commands/                  # runX functions — one per CLI command
│   ├── start.ts               # warm Shiki, bind, write lockfile, open browser, optional initial file
│   ├── push.ts                # POST /push (with X-Mdscroll-Source); auto-spawn + poll lockfile
│   ├── stop.ts                # SIGTERM the lockfile pid (per --name)
│   ├── list.ts                # listLocks() → tabular print of NAME / PID / URL / STARTED
│   └── install-skill.ts       # thin CLI wrapper around installSkill
├── server/                    # HTTP + rendering + browser assets
│   ├── app.ts                 # createApp(store) (testable) + startServer(opts). Routes:
│   │                          #   GET /, /style.css, /main.js
│   │                          #   POST /push (reads X-Mdscroll-Source header for source label)
│   │                          #   GET /api/snapshot/:id (renders past snapshot HTML)
│   │                          #   GET /events (SSE: { html, current, history })
│   ├── render.ts              # markdown-it + shiki + mermaid fence + GFM plugins
│   └── client.ts              # inline HTML / CSS / JS. Drawer uses native popover + commandfor — no JS for open/close/ESC/light-dismiss.
└── store/                     # shared in-process state and on-disk persistence
    ├── state.ts               # Snapshot { id, markdown, source, createdAt }; Store keeps last MAX_HISTORY=20, current()/history()/byId()/push().
    └── lockfile.ts            # ~/.mdscroll/<name>.lock with dead-PID cleanup; readLock/writeLock/removeLock/listLocks.
```

Tests live alongside their source (`*.test.ts`).

Data flow on push:

```
CLI push (X-Mdscroll-Source: file|stdin)
  → POST /push → Store.push(content, source) → listeners
  → SSE 'update' { html, current, history } → browser swaps #mdscroll-content + redraws drawer list
```

History drawer in the browser fetches `/api/snapshot/:id` when the user clicks a past entry; "Back to live" reverts to the latest current.

## Commands

```bash
pnpm install          # respects minimumReleaseAge (7d), verifyDepsBeforeRun: install
pnpm build            # vp run -r build (→ vp pack → tsdown → dist/cli.mjs with shebang)
pnpm test             # vitest (~400ms, 101 tests)
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

Versioning and publishing use [Changesets](https://github.com/changesets/changesets). The default path is CI-driven via `.github/workflows/release.yml`.

### Authoring a change

```bash
pnpm changeset        # interactive; writes .changeset/<name>.md describing the change
git add .changeset/*  # include it in the PR
```

### CI-driven publish (normal path)

On every push to `main`, `changesets/action` runs. It does one of two things:

1. If there are pending `.changeset/*.md` files → it opens or updates a `Version Packages` PR that bumps `package.json` versions and updates `CHANGELOG.md`.
2. If that PR has been merged (no pending changesets, but versions differ from what is on npm) → it runs `pnpm release` (build + `changeset publish`) and pushes the new version to npm.

Publishing uses npm OIDC (trusted publishing). The workflow requests `id-token: write` — no `NPM_TOKEN` secret is needed. The trusted publisher must be configured on npmjs.com for the `mdscroll` package, bound to the GitHub repo and the `Release` workflow.

### First publish (manual)

OIDC trusted publishing requires the package to exist on npm before the CI path works. For the very first release:

```bash
npm login
pnpm release         # builds + changeset publish (runs locally)
```

Then configure the trusted publisher on npmjs.com → `mdscroll` package → "Trusted publisher" → GitHub Actions → repo `k35o/mdscroll`, workflow `release.yml`, environment (blank).

### Config

`.changeset/config.json` uses `@changesets/changelog-github` (repo `k35o/mdscroll`) and `access: public`. Baseline branch is `main`.
