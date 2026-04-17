# mdscroll

Push markdown to a local browser preview — instantly.

Monorepo for the `mdscroll` CLI. See [`packages/mdscroll`](./packages/mdscroll) for the user-facing README and npm details.

```bash
mdscroll                         # start server, print URL (no browser)
echo "# Hello" | mdscroll push   # push content; open browser updates instantly
mdscroll push plan.md            # or push a file
```

## Stack

- **Workspace**: pnpm 10 with catalog. `minimumReleaseAge: 10080` (7 days) gates new deps.
- **Toolchain**: [vite-plus](https://viteplus.dev) (`vp`) — build (tsdown), lint/format (oxlint + oxfmt), task running
- **Runtime** (contributors): Node 24.14.1 via mise. The **published package** targets `node >= 20`.
- **Core**: [Hono](https://hono.dev), [markdown-it](https://github.com/markdown-it/markdown-it), [Shiki](https://shiki.style), [Mermaid](https://mermaid.js.org) (client-side, self-hosted)
- **Tests**: [Vitest](https://vitest.dev) covering renderer, state, lockfile, server routes, commands, and integration flow

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
│       ├── cli.ts             # commander entry
│       ├── constants.ts       # DEFAULT_PORT / HOST / INSTANCE_NAME
│       ├── port.ts            # resolvePort (get-port fallback)
│       ├── commands/          # start / push / stop / list
│       ├── server/            # app.ts (Hono), render.ts, client.ts
│       └── store/             # state.ts (Snapshot + Store), lockfile.ts
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

MIT © k8o
