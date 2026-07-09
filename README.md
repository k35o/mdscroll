# mdscroll

Preview markdown in a local browser — instantly, with zero disk state. One long-lived server per session hosts a tab strip; every other invocation pushes a document over HTTP and exits immediately.

Monorepo for the `mdscroll` CLI. See [`packages/mdscroll`](./packages/mdscroll) for the full CLI and HTTP API reference.

```bash
mdscroll plan.md                 # no server yet: becomes the session server (Ctrl+C ends it)
mdscroll notes.md                # server already up: pushes a tab, exits immediately
cat review.md | mdscroll --name review   # one-shot doc; re-pipe the same name to replace it
mdscroll serve                   # or start an empty session server explicitly (idempotent)
mdscroll push draft.md           # strict push: exits 2 instead of becoming the server
mdscroll ls                      # list docs (exit 2 = no server running)
mdscroll rm notes.md             # close a tab from the shell
```

Documents are named data, not processes. A file doc is keyed by its real path, so re-running `mdscroll plan.md` replaces the existing tab instead of adding a duplicate. The server watches pushed files itself — the push command does not stay resident. All state is RAM in the server process: Ctrl+C on the server ends the session and every doc disappears. Exit codes are a contract: `0` success, `1` error, `2` strictly "no server running — `mdscroll serve` would fix it".

## Stack

- **Workspace**: pnpm 10 with catalog. `minimumReleaseAge: 10080` (7 days) gates new deps.
- **Toolchain**: [vite-plus](https://viteplus.dev) (`vp`) — build (tsdown), lint/format (oxlint + oxfmt), task running.
- **Runtime** (contributors): Node 24.14.1 via mise. The **published package** targets `node >= 20`.
- **Core**: [Hono](https://hono.dev), [markdown-it](https://github.com/markdown-it/markdown-it), [Shiki](https://shiki.style), [Mermaid](https://mermaid.js.org) (loaded client-side from a pinned jsDelivr URL, gated by a strict Content-Security-Policy).
- **Tests**: [Vitest](https://vitest.dev) — unit tests alongside their sources (`*.test.ts`), plus an e2e suite that builds and spawns the real CLI.

## Development

```bash
pnpm install          # 7-day freshness gate enforced
pnpm build            # vp run -r build (→ vp pack → tsdown)
pnpm test             # vitest (unit)
pnpm test:e2e         # builds the CLI, then exercises the real binary
pnpm typecheck        # tsc --noEmit
pnpm check            # oxlint + oxfmt
pnpm check:write      # auto-fix
pnpm skill:validate   # validate skills/mdscroll against agentskills.io
```

Target a single package:

```bash
pnpm -F mdscroll build
pnpm -F mdscroll test
pnpm -F mdscroll dev        # vp pack --watch
```

## Project layout

```
mdscroll/
├── skills/mdscroll/SKILL.md   # agentskills.io-compliant skill (gh skill install k35o/mdscroll)
├── packages/mdscroll/         # the published package (bin: mdscroll)
│   └── src/
│       ├── cli.ts             # commander entry: default command + serve / push / rm / ls
│       ├── run.ts             # one runner per verb; discovery loop; exit-code contract
│       ├── probe.ts           # classify the port: mdscroll | free | squatter
│       ├── client-http.ts     # PUT / DELETE / GET /_/docs helpers for the push verbs
│       ├── bind.ts            # @hono/node-server wrapper that settles on listening/error
│       ├── watch.ts           # fs.watch on the parent dir, 100ms debounce
│       ├── source.ts          # display labels (cwd-relative path, first H1, truncation)
│       ├── constants.ts       # default port, probe timeout, admission caps, stale threshold
│       ├── server/            # app.tsx (routes + Host allowlist), watcher.ts (server-side
│       │                      # file watching + stale marking), render.ts, client.tsx (tab UI)
│       └── store/             # state.ts (keyed doc Map + added/updated/removed events)
├── pnpm-workspace.yaml        # catalog + release-age gate
├── vite.config.ts             # root vp config (fmt / lint / staged)
├── mise.toml                  # Node 24.14.1, pnpm 10.33.0
└── tsconfig.json              # strict base extended by the package
```

## Release

1. Author a change with `pnpm changeset`, commit the generated `.changeset/*.md` in the PR.
2. Merge the PR. CI opens / updates a `Version Packages` PR.
3. Merge the `Version Packages` PR. CI publishes to npm via OIDC.

See [`CLAUDE.md`](./CLAUDE.md#release) for the first-publish bootstrap and trusted-publisher setup.

## License

MIT (c) k8o
