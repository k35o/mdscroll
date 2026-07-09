# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`mdscroll` is a CLI that previews markdown in the local browser. The model: **a document is named data, not a process**. Exactly one long-lived process per session — the server — hosts a tab strip on `127.0.0.1:4977`; every other invocation pushes a doc over HTTP and exits immediately. There is no daemon and no disk state: all docs live in the server's RAM and the session ends when it exits (Ctrl+C).

### Verbs

- `mdscroll <file>` / `cat doc.md | mdscroll` — default command, **push-or-serve**: push when a server answers, become the foreground session server when the port is free. A bounded discovery loop (3 attempts) covers the probe/bind races.
- `mdscroll serve` — idempotent "make a server exist". Already running → prints its URL, exit 0.
- `mdscroll push [file]` — strict push; never becomes the server (exit 2 when none). What SKILL.md prescribes for agents.
- `mdscroll rm <doc>` — remove by path or name. Resolves against the server's actual keys (realpath → cwd-resolved path → literal), so removing a doc whose file is gone still works. Already absent → notice, exit 0.
- `mdscroll ls` — list docs (`key<TAB>state<TAB>label`, state = watched | static | stale); doubles as the is-a-server-up probe.

Flags on every verb: `--json` (exactly one machine-readable line on stdout; pure output formatting, never changes lifecycle) and `-p/--port` (flag > `MDSCROLL_PORT` env > 4977, validated 1–65535). There is no `--host` — the server binds `127.0.0.1` only. A port held by a non-mdscroll process ("squatter") is a hard error on every verb; the old random-port fallback is gone.

### Exit codes (a contract)

- `0` — success.
- `1` — error (bad input, squatted port, server rejection, ...).
- `2` — strictly "nothing is listening on the port", i.e. `mdscroll serve` would fix it.

### Doc identity

File docs are keyed by **realpath**; stdin docs by `--name`, falling back to the fixed key `untitled` so anonymous re-pipes share one tab. Same-key push **replaces** the tab (upsert) — duplicate tabs are structurally impossible. `--name` with a file argument is an error. Labels are display-only: cwd-relative path (basename outside cwd), or the first `# H1` for stdin.

### HTTP API (private, tokenless)

Routes under `/_/*` are the push surface:

- `GET /_/health` — `{ agent: 'mdscroll', version, pid, docs }`; discovery probe (500 ms timeout), answered before renderer warmup.
- `GET /_/docs` — doc summaries.
- `PUT /_/docs/:key` — body `{ markdown?, path?, watch?, label? }`; 201 created / 200 replaced. With `path`, the server reads and watches the file itself; body markdown is fallback content when the read fails (doc created stale).
- `DELETE /_/docs/:key` — 204, idempotent. Also used by the browser tab close button.

There are no bearer tokens. The boundary is a **Host-header allowlist** (`127.0.0.1` / `localhost` / `[::1]`) enforced on every route — DNS-rebinding defense for the tokenless write surface — plus a socket-address loopback check on `/_/*` as defense in depth. Admission caps: 128 docs, 10 MiB markdown, key/label length limits.

### Staleness (replaces liveness GC)

The server owns all file watchers (`registerDoc` attaches one per watched doc). A failed read schedules its own 150 ms retry; 3 consecutive failures mark the doc `stale` (last content kept, UI badge). The watcher stays attached, so a file that reappears (atomic save, git checkout) clears staleness on the next successful read. Removing a doc detaches its watcher; watcher updates are update-if-present — only an external PUT can resurrect a closed doc.

### Browser UI

A tab shell driven by SSE `/events` (`init`, `added`, `updated`, `removed`; HTML is rendered once per update and cached on the doc record). Tabs have close buttons (DELETE by key); `/#<encoded key>` deep-links a tab; the active tab and scroll position survive SSE reconnects; `document.title` follows the active doc; tail-follow (snap to bottom when already near it) works per-active-doc.

Browser opening is still not handled by the CLI — the host environment (system default browser, cmux pane, AI agent's open helper, etc.) navigates to the URL.

### Skill

The agent skill lives at `skills/mdscroll/SKILL.md` (repo root), following the [agentskills.io](https://agentskills.io) spec. Users install it with `gh skill install k35o/mdscroll`. Not bundled into the npm package.

## Architecture

Monorepo (pnpm workspaces). One package today: `packages/mdscroll`.

```
mdscroll/                          # repo root
├── skills/mdscroll/SKILL.md       # agent skill (agentskills.io spec)
└── packages/mdscroll/src/
    ├── cli.ts                     # commander entry: default command + serve / push / rm / ls
    ├── run.ts                     # runDefault/runServe/runPush/runRm/runLs + loadInput; owns the exit-code contract
    ├── probe.ts                   # GET /_/health → 'mdscroll' | 'free' | 'squatter'
    ├── bind.ts                    # promise wrapper around @hono/node-server serve(); loopback-only, settles on 'listening' / 'error'
    ├── client-http.ts             # putDoc / deleteDoc / listDocs — plain fetch against /_/docs
    ├── watch.ts                   # fs.watch on the parent dir, 100ms debounce (mechanism only)
    ├── source.ts                  # fileSourceLabel / stdinSourceLabel / displaySourceLabel
    ├── constants.ts               # DEFAULT_PORT (4977), timeouts, admission caps, UNTITLED_KEY
    ├── server/
    │   ├── app.tsx                # createApp(store, watchers, meta) + registerDoc — the single doc-creation path. Host gate + all routes.
    │   ├── watcher.ts             # per-doc server-side watchers: attach/detach by key, stale-after-3-failures, auto-recovery
    │   ├── render.ts              # markdown-it + shiki + mermaid + GFM plugins
    │   └── client.tsx             # Document shell, STYLES_CSS, CLIENT_JS (tab strip + SSE wiring)
    └── store/
        └── state.ts               # keyed doc Map: upsert / updateIfPresent / remove + event subscribers
```

Dependency layers (no cycles):

```
cli
 └─ run
      ├─ probe
      ├─ bind
      ├─ client-http
      ├─ source
      ├─ server/app
      │    ├─ server/client
      │    ├─ server/render
      │    ├─ server/watcher
      │    │    ├─ watch
      │    │    └─ server/render
      │    └─ store/state
      └─ store/state
```

Tests live alongside their source (`*.test.ts`).

### Data flow (push, server already running)

```
mdscroll <file>
  → probe /_/health → PUT /_/docs/<realpath> { path, watch: true, label, markdown }
  → server: registerDoc → attach watcher → read file → render → store.upsert
  → SSE 'added' | 'updated' → browser adds/replaces the tab
  → CLI prints the doc URL and exits 0
```

### Data flow (file save)

```
fs.watch (parent dir, inside the server process)
  → debounce 100ms → readFile (150ms self-retry; stale after 3 failures)
  → render → store.updateIfPresent(key, { markdown, html, stale: false })
  → SSE 'updated' { doc } → browser: upsert → if active, swap #mdscroll-content
```

## Commands

```bash
pnpm install          # respects minimumReleaseAge (7d), verifyDepsBeforeRun: install
pnpm build            # vp run -r build (→ vp pack → tsdown → dist/cli.mjs with shebang)
pnpm test             # vitest — unit tests only (~1s). E2E is excluded by vitest.config.ts.
pnpm test:e2e         # builds the CLI, then spawns it against real TCP + fs.watch (needs a host shell)
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

- Tests that bind localhost ports or open `fs.watch` handles (`watch.test.ts` and the suites covering probe/bind/run over real TCP) fail under Claude Code's default sandbox (EPERM / EMFILE). Run `pnpm test` with the sandbox disabled or from a host shell.
- `e2e.test.ts` is excluded from the default `pnpm test` via `packages/mdscroll/vitest.config.ts` — run it with `pnpm test:e2e` (`vitest.e2e.config.ts`), which builds the CLI first and then spawns it as a subprocess.

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
