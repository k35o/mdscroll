# CLAUDE.md

`mdscroll` is a CLI that previews markdown in the local browser. The model: **a document is named data, not a process**. Exactly one long-lived process per session — the server — hosts a tab strip on `127.0.0.1:4977`; every other invocation pushes a doc over HTTP and exits immediately. No daemon, no disk state: docs live in the server's RAM and die with it.

Load-bearing contracts — change these deliberately, and update `skills/mdscroll/SKILL.md` (the user-facing contract, agentskills.io spec, installed via `gh skill install k35o/mdscroll`, not bundled into the npm package) in the same PR:

- Exit codes: `0` success, `1` error (bad input, squatted port, server rejection), `2` strictly "nothing is listening on the port" — `mdscroll serve` fixes it, nothing else does.
- Doc identity: file docs are keyed by realpath, stdin docs by `--name` (fallback: the fixed key `untitled`). Same-key push replaces the tab — duplicate tabs are structurally impossible.
- The HTTP push surface (`/_/*`) is tokenless. The boundary is a Host-header allowlist (DNS-rebinding defense) plus a loopback socket-address check. Don't add routes that bypass it.
- The server owns all file watchers. 3 consecutive failed reads mark a doc `stale` (last content kept); the watcher stays attached, so the doc self-heals when the file reappears.
- The server binds `127.0.0.1` only; there is no `--host` and no random-port fallback — a squatted port is a hard error on every verb.

## Commands

```bash
pnpm build            # vp pack → dist/cli.mjs
pnpm test             # vitest — unit tests only (~1s)
pnpm test:e2e         # builds the CLI, then spawns it against real TCP + fs.watch
pnpm typecheck
pnpm check            # oxlint + oxfmt (check:write to auto-fix)
pnpm skill:validate   # validate skills/mdscroll against the agentskills.io spec
```

- Tests that bind localhost ports or open `fs.watch` handles fail under Claude Code's default sandbox (EPERM / EMFILE) — run them with the sandbox disabled or from a host shell.
- `e2e.test.ts` is excluded from `pnpm test` by `vitest.config.ts`; only `pnpm test:e2e` runs it.

## Conventions

- TypeScript 6.0 stable (not native-preview). ESM only, module `NodeNext`, `.js` extensions in relative imports.
- JSX is `hono/jsx`, used server-side only to compose the shell HTML.
- `type` only (no `interface`). No emojis in source or docs unless explicitly requested.
- English only for all in-repo text (tests, comments, docs) — this is a public npm package.
- No `npx` in CI or scripts — every tool the repo uses is a declared devDependency invoked as a local binary. End-user docs may still suggest `npx mdscroll`.
- New deps go through `catalog:` in `pnpm-workspace.yaml`, and the version must be ≥ 7 days old (`minimumReleaseAge: 10080`) — check `curl registry.npmjs.org/<pkg>` → `time` before picking one.

## Release

pnpm's built-in release management, driven in CI by [k35o/pnpm-release-action](https://github.com/k35o/pnpm-release-action). To author a change, run `pnpm change` and include the generated `.changeset/<name>.md` in the PR. Pushes to `main` either update the release PR (branch `pnpm-release/main`) or, when no intents are pending, publish to npm via OIDC trusted publishing. Config lives under the `versioning` key in `pnpm-workspace.yaml`.
