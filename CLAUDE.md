# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`mdscroll` is a CLI that previews a markdown file (or piped markdown) in the local browser. It is a **foreground, single-instance** process — no daemon, no lockfile, no state on disk. Built for AI workflows: an agent writes a plan to a file, the user runs `mdscroll <file>` once, and every update the agent makes to the file is reflected in the browser over SSE.

Surface area:

- `mdscroll <file>` — read the file, serve it, watch it, re-render on every change. Foreground, Ctrl+C to quit.
- `mdscroll` (with piped stdin) — read stdin to EOF, serve once. Foreground, Ctrl+C to quit.
- `mdscroll` (TTY, no file) — print usage and exit 1.
- `mdscroll --port <n>` / `--host <h>` — change the bind address. Port collisions fall back to a free port via get-port.

No subcommands. No `--name`. No `push` / `stop` / `list`. The only "state" is what's in the running process's memory.

Browser opening is intentionally not handled by the CLI. The host environment (system default browser, cmux pane, an AI agent's open-helper, etc) is responsible for navigating to the URL.

The agent skill lives at `skills/mdscroll/SKILL.md` (repo root) following the [agentskills.io](https://agentskills.io) spec. Users install it with `gh skill install k35o/mdscroll` (or any agentskills-compatible installer). The skill is **not** bundled into the npm package — it's a static file in the GitHub repo.

## Architecture

Monorepo (pnpm workspaces). One package today: `packages/mdscroll`.

Source layout (`packages/mdscroll/src/`):

```
mdscroll/                          # repo root
├── skills/mdscroll/SKILL.md       # agent skill (agentskills.io spec)
└── packages/mdscroll/src/
    ├── cli.ts                     # commander entry (single command, no subcommands)
    ├── run.ts                     # runMdscroll(opts) + ingestContent(opts, store); orchestrates file / stdin / TTY-help branches, warms up the renderer, binds the server, wires SIGINT/SIGTERM.
    ├── watch.ts                   # watchFile(path, onChange): fs.watch on the parent dir, filter by basename (survives editor swap-save), 100ms trailing debounce.
    ├── source.ts                  # fileSourceLabel(file) → cwd-relative path; stdinSourceLabel(md) → first H1 or '(untitled)'.
    ├── port.ts                    # resolvePort (get-port) — prefer requested, fall back to free.
    ├── constants.ts               # DEFAULT_HOST / DEFAULT_PORT.
    ├── types.d.ts                 # ambient types (untyped markdown-it-task-lists).
    ├── server/
    │   ├── app.tsx                # createApp(store) + startServer({port, host, store}). Routes: GET /, /style.css, /main.js, /events (SSE). No POST, no identity, no snapshot API. GET / sets a strict CSP.
    │   ├── render.ts              # markdown-it + shiki + mermaid fence + GFM plugins.
    │   └── client.tsx             # Hono JSX Document + Header (brand / source label / status), plus STYLES_CSS and CLIENT_JS string exports. CLIENT_JS subscribes to /events and swaps #mdscroll-content + #mdscroll-source on each update.
    └── store/
        └── state.ts               # Snapshot { markdown, source, createdAt } + Store { current(), setCurrent(), subscribe() }. Single-slot, in-memory, no history.
```

Dependency layers (no cycles):

```
cli
 └─ run
      ├─ watch            (fs.watch + debounce)
      ├─ source           (label resolution)
      ├─ port             (get-port fallback)
      ├─ server/app       (Hono routes + startServer)
      │    ├─ server/client  (JSX shell + CSS/JS)
      │    ├─ server/render  (markdown-it + shiki + mermaid)
      │    └─ store/state    (current + subscribe)
      └─ store/state
```

Tests live alongside their source (`*.test.ts`).

Data flow on a file save:

```
fs.watch (parent dir)
  → debounce 100ms → readFile → store.setCurrent(md, label) → listeners
  → SSE 'update' { html, source } → browser swaps #mdscroll-content + updates #mdscroll-source
```

Stdin mode runs the first two steps once at startup; no watcher is attached.

## Commands

```bash
pnpm install          # respects minimumReleaseAge (7d), verifyDepsBeforeRun: install
pnpm build            # vp run -r build (→ vp pack → tsdown → dist/cli.mjs with shebang)
pnpm test             # vitest (~1s, 83 tests)
pnpm typecheck        # tsc --noEmit
pnpm check            # oxlint + oxfmt
pnpm check:write      # auto-fix
pnpm skill:validate   # validate skills/mdscroll against agentskills.io spec
```

Single package:

```bash
pnpm -F mdscroll build
pnpm -F mdscroll test
pnpm -F mdscroll dev      # vp pack --watch
```

Note: `port.test.ts` and `watch.test.ts` bind localhost ports and open `fs.watch` handles respectively, so they fail under Claude Code's default sandbox (EPERM / EMFILE). Run them with the sandbox disabled or from a host shell.

## Conventions

- **TypeScript 6.0 stable** (not native-preview). Strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`.
- **JSX via `hono/jsx`** (`jsx: 'react-jsx'`, `jsxImportSource: 'hono/jsx'`). Only used server-side to compose the shell HTML in `server/client.tsx`.
- **ESM only**, module `NodeNext`. `.js` extension in relative imports.
- **`type` only** — no `interface`.
- **Single quotes** (oxfmt).
- **No emojis** in source or docs unless explicitly requested.
- **`catalog:`** for every shared dep. New deps must have a version published ≥ 7 days ago (`minimumReleaseAge: 10080`).
- **English only** for all in-repo text (SKILL.md content, tests, comments, docs) — this is a public npm package.
- **No npx in CI or scripts.** Any tool used by the repo must be declared in `devDependencies` (via catalog where shared) and invoked as a local binary. End-user docs can still suggest `npx mdscroll` — that is the user's choice.
- **Testing philosophy**: see `~/.claude/skills/testing/`. Summary:
  - AAA (Arrange-Act-Assert) structure
  - 1 test 1 behavior
  - `describe` / `it` names describe behavior, not implementation
  - Per-test isolation (e.g. `tmpdir` for fs tests)
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
