---
'mdscroll': minor
---

Breaking: collapse mdscroll to a foreground-only, single-instance server with zero disk state.

**Removed**

- `mdscroll push`, `mdscroll stop`, `mdscroll list` subcommands.
- `--name` / `-n` option and per-name instance isolation.
- `~/.mdscroll/` state directory (lockfiles, logs).
- History drawer and `GET /api/snapshot/:id`.
- `POST /push` and the `X-Mdscroll-Source` CSRF guard (no network writes anymore).
- `GET /identity` endpoint.

**New shape**

```bash
mdscroll plan.md           # watch a file; auto-reload the browser on every change
cat plan.md | mdscroll     # serve piped markdown once, stay foreground
```

Both forms run in the foreground and exit cleanly on Ctrl+C. The header shows the current source: the cwd-relative path for file mode, the first `# H1` for stdin mode (falling back to `(untitled)`).

**Why**

The old multi-instance lockfile design wrote to `~/.mdscroll/`, which fails under Claude Code's sandbox and adds real friction for first-time users. The actual target workflow — "agent updates a plan, user watches it in the browser" — maps naturally onto "watch a file"; there is no longer a reason to run a long-lived coordinator.
