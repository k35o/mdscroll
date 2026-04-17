# mdscroll

Preview markdown in a local browser — instantly, with zero disk state.

Monorepo for the `mdscroll` CLI. See [`packages/mdscroll`](./packages/mdscroll) for the user-facing README and npm details.

```bash
mdscroll plan.md           # watch file, auto-reload browser on every change
cat plan.md | mdscroll     # one-shot: serve stdin once, Ctrl+C to stop
```

Both forms run in the foreground and exit cleanly on Ctrl+C. Nothing is written outside the running process — no lockfile, no log file, no `~/.mdscroll/`.

## Stack

- **Workspace**: pnpm 10 with catalog. `minimumReleaseAge: 10080` (7 days) gates new deps.
- **Toolchain**: [vite-plus](https://viteplus.dev) (`vp`) — build (tsdown), lint/format (oxlint + oxfmt), task running.
- **Runtime** (contributors): Node 24.14.1 via mise. The **published package** targets `node >= 20`.
- **Core**: [Hono](https://hono.dev), [markdown-it](https://github.com/markdown-it/markdown-it), [Shiki](https://shiki.style), [Mermaid](https://mermaid.js.org) (loaded client-side from a pinned jsDelivr URL, gated by a strict Content-Security-Policy).
- **Tests**: [Vitest](https://vitest.dev) covering renderer, state, source label extraction, file watcher, and server routes.

## Development

```bash
pnpm install          # 7-day freshness gate enforced
pnpm build            # vp run -r build (→ vp pack → tsdown)
pnpm test             # vitest
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
│       ├── cli.ts             # commander entry (single command)
│       ├── run.ts             # ingest (file-watch or stdin) + bind server
│       ├── watch.ts           # fs.watch-based file watcher with debounce
│       ├── source.ts          # header label resolver (filename or H1 or "(untitled)")
│       ├── port.ts            # resolvePort (get-port fallback)
│       ├── constants.ts       # DEFAULT_PORT / DEFAULT_HOST
│       ├── server/            # app.tsx (Hono), render.ts, client.tsx
│       └── store/             # state.ts (Snapshot + Store)
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
