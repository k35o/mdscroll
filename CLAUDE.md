# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`mdscroll` is a CLI that previews markdown in the local browser. Every invocation is a **foreground process** (Ctrl+C to quit) — there is still no daemon and no disk state — but multiple invocations cooperate over TCP so they share one browser tab strip instead of proliferating ports.

### Two modes per invocation

The CLI decides its mode at startup based on whether the target port (default `127.0.0.1:4977`) is free:

- **Server mode** — the first invocation binds the port, hosts the UI, and registers its own document.
- **Client mode** — subsequent invocations hit the port, recognise the existing mdscroll via `GET /_/health`, POST their document, and stream their file's updates over HTTP. They stay foreground; Ctrl+C `DELETE`s their document from the server.
- **Fallback** — if the port is taken by a non-mdscroll process, the caller falls back to a random free port (via `get-port`) and becomes a server on that. A note is printed so the user knows.

### Surface area

- `mdscroll <file>` — watch and serve (or push) a markdown file.
- `cat file.md | mdscroll` — read stdin to EOF, serve (or push) once.
- `mdscroll` (TTY, no file) — print usage, exit 1.
- `mdscroll --port <n>` / `--host <h>` — change the bind address; the discovery flow still applies.

No subcommands, no `--name`, no explicit `push` / `stop` / `list`. All state lives in the running processes' memory — the server keeps a per-doc write token in RAM and hands it to the push client on POST.

### HTTP API (private)

Routes under `/_/*` are the push surface:

- `GET /_/health` — `{ agent: 'mdscroll', version, pid }`; discovery probe.
- `POST /_/docs` — body `{ source, markdown, ownerPid? }`; returns `{ id, token }`.
- `PUT /_/docs/:id` — `Authorization: Bearer <token>`; partial update.
- `DELETE /_/docs/:id` — `Authorization: Bearer <token>`; used on Ctrl+C.

The token exists solely so one localhost mdscroll cannot accidentally overwrite another's document. It is not a security boundary — any local process can POST a fresh doc.

### Liveness GC

Each doc carries its `ownerPid`. The server checks `process.kill(pid, 0)` every 5 seconds and removes docs whose owner has exited. This covers abrupt crashes (`kill -9`, host suspend, etc.) where the client never gets to DELETE.

### Browser UI

The client HTML is a tab shell: a strip of tabs, a content article, a status dot. All content is driven by SSE `/events`, which emits `init` (all docs, pre-rendered), `added`, `updated`, and `removed`. Clicking a tab switches which doc's HTML is mounted into `#mdscroll-content`. Tail-follow (snap to bottom when already near it) still works per-active-doc.

Browser opening is still not handled by the CLI — the host environment (system default browser, cmux pane, AI agent's open helper, etc.) navigates to the URL.

### Skill

The agent skill lives at `skills/mdscroll/SKILL.md` (repo root), following the [agentskills.io](https://agentskills.io) spec. Users install it with `gh skill install k35o/mdscroll`. Not bundled into the npm package.

## Architecture

Monorepo (pnpm workspaces). One package today: `packages/mdscroll`.

```
mdscroll/                          # repo root
├── skills/mdscroll/SKILL.md       # agent skill (agentskills.io spec)
└── packages/mdscroll/src/
    ├── cli.ts                     # commander entry (single command)
    ├── run.ts                     # loadSource() + runServerMode() + runClientMode(); orchestrates discovery
    ├── discover.ts                # try bind → on EADDRINUSE probe /_/health → server | client | fallback
    ├── bind.ts                    # promise wrapper around @hono/node-server `serve()` that settles on 'listening' / 'error'
    ├── push-client.ts             # POST / PUT / DELETE /_/docs for client mode
    ├── liveness.ts                # periodic process.kill(ownerPid, 0) GC
    ├── watch.ts                   # fs.watch on the parent dir, 100ms debounce
    ├── source.ts                  # fileSourceLabel / stdinSourceLabel / displaySourceLabel
    ├── port.ts                    # resolvePort (get-port)
    ├── constants.ts               # DEFAULT_HOST / DEFAULT_PORT (4977)
    ├── server/
    │   ├── app.tsx                # createApp(store, meta) + startServer. Routes: GET /, /style.css, /main.js, /events, /_/health, /_/docs*.
    │   ├── render.ts              # markdown-it + shiki + mermaid + GFM plugins
    │   └── client.tsx             # Document shell, STYLES_CSS, CLIENT_JS (tab strip + SSE wiring)
    └── store/
        └── state.ts               # Multi-doc Map + per-doc token + event subscribers (added/updated/removed)
```

Dependency layers (no cycles):

```
cli
 └─ run
      ├─ discover
      │    ├─ bind
      │    └─ port
      ├─ push-client
      ├─ liveness
      ├─ watch
      ├─ source
      ├─ server/app
      │    ├─ server/client
      │    ├─ server/render
      │    └─ store/state
      └─ store/state
```

Tests live alongside their source (`*.test.ts`).

### Data flow (file save, server mode)

```
fs.watch (parent dir)
  → debounce 100ms → readFile
  → store.update(docId, {markdown}) → listeners
  → SSE 'updated' { doc: {id, html, source, ...} }
  → browser: upsertDoc → if active, swap #mdscroll-content
```

### Data flow (file save, client mode)

```
fs.watch (parent dir) in client process
  → debounce 100ms → readFile
  → PUT /_/docs/:id on server (serialized — one in-flight at a time)
  → server: store.update → listeners → SSE to browser (same as above)
```

## Commands

```bash
pnpm install          # respects minimumReleaseAge (7d), verifyDepsBeforeRun: install
pnpm build            # vp run -r build (→ vp pack → tsdown → dist/cli.mjs with shebang)
pnpm test             # vitest — unit tests only (~1s). E2E is excluded by vitest.config.ts.
pnpm test:e2e         # builds the CLI, then spawns it and exercises the full push flow (~15s; needs a host shell)
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

Notes:

- `port.test.ts`, `watch.test.ts`, and `discover.test.ts` bind localhost ports and/or open `fs.watch` handles, so they fail under Claude Code's default sandbox (EPERM / EMFILE). Run the normal `pnpm test` with the sandbox disabled or from a host shell.
- `e2e.test.ts` is excluded from the default `pnpm test` via `packages/mdscroll/vitest.config.ts` — run it with `pnpm test:e2e`. That script builds the CLI first and then spawns it, needing a host shell and adding ~15s because one scenario waits on the 5s liveness GC tick.
- When a previous version's daemon (`mdscroll 0.1.x`) holds `:4977`, the new CLI probes `/_/health`, gets 404, and falls back to a random port. Kill the old daemon or use `--port` to avoid the fallback message.

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
- **Testing philosophy**: see `~/.claude/skills/testing/`. AAA, 1 test / 1 behavior, behavior-named describes, per-test isolation, no self-fulfilling assertions.

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
