# mdscroll

## 0.1.0

### Minor Changes

- [`22839f7`](https://github.com/k35o/mdscroll/commit/22839f751be5dd8b320443f6e7c6f8065c7fd8ac) Thanks [@k35o](https://github.com/k35o)! - Initial release of `mdscroll` — push markdown to a local browser preview, instantly.
  - CLI: `mdscroll` (start server), `mdscroll <file>` / `mdscroll push` (push + auto-spawn), `mdscroll stop`, `mdscroll list`. `--name` scopes each command to an isolated instance with its own port, content, and history.
  - Server (Hono + SSE): GitHub-style rendering via markdown-it + Shiki (light/dark), Mermaid diagrams, GFM task lists / alerts / strikethrough, and a history drawer backed by the native popover API.
  - Hardened for public use: strict CSP, `X-Mdscroll-Source` CSRF guard on `POST /push` with a 5 MiB cap, identity-verified `stop` (no PID-recycling surprises), atomic lockfile acquisition, and `--name` sanitization to keep lock/log paths inside `~/.mdscroll/`.
  - Ships an [agentskills.io](https://agentskills.io)-compatible `SKILL.md`, installable with `gh skill install k35o/mdscroll` for Claude Code, Cursor, Codex, Copilot, and other compatible agents.
