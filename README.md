# mdscroll

Push markdown to a local browser preview — instantly.

Monorepo for the `mdscroll` CLI. See [`packages/mdscroll`](./packages/mdscroll) for the user-facing README and npm details.

```bash
mdscroll                         # start server + open browser
echo "# Hello" | mdscroll push   # browser updates instantly
mdscroll push plan.md            # or push a file
```

## Stack

- **Workspace**: pnpm 10 with catalog. `minimumReleaseAge: 10080` (7 days) gates new deps.
- **Toolchain**: [vite-plus](https://viteplus.dev) (`vp`) — build (tsdown), lint/format (oxlint + oxfmt), task running
- **Runtime**: Node ≥ 24.13, ESM only
- **Core**: [Hono](https://hono.dev), [markdown-it](https://github.com/markdown-it/markdown-it), [Shiki](https://shiki.style), [Mermaid](https://mermaid.js.org) (client-side)
- **Tests**: [Vitest](https://vitest.dev) — 68 tests covering renderer, state, lockfile, and server routes

## Development

```bash
pnpm install          # 7-day freshness gate enforced
pnpm build            # vp run -r build (→ vp pack → tsdown)
pnpm test             # vitest
pnpm typecheck        # tsc --noEmit
pnpm check            # oxlint + oxfmt
pnpm check:write      # auto-fix
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
├── packages/mdscroll/         # the published package (bin: mdscroll)
│   ├── src/
│   │   ├── cli.ts             # commander entry
│   │   ├── start.ts / push.ts # command implementations
│   │   ├── server.ts          # Hono app + Node HTTP binding
│   │   ├── render.ts          # markdown-it + shiki + mermaid fence
│   │   ├── state.ts           # in-memory versioned Store
│   │   ├── lockfile.ts        # ~/.mdscroll/server.lock
│   │   └── client.ts          # inline HTML/CSS/JS
│   └── …
├── pnpm-workspace.yaml        # catalog + release-age gate
├── vite.config.ts             # root vp config (fmt / lint / staged)
├── mise.toml                  # Node 24.14.1, pnpm 10.33.0
└── tsconfig.json              # strict base extended by the package
```

## License

MIT © k8o
