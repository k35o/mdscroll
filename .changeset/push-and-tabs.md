---
'mdscroll': minor
---

Tabs and implicit push: running `mdscroll <file>` while another `mdscroll` is already listening on the target port no longer proliferates a new port. The second (and nth) invocation discovers the existing server via `GET /_/health`, POSTs its document to it, and the browser shows every open document as a tab in a single shared window. Clients keep their own file watchers and stream updates with `PUT /_/docs/:id`; Ctrl+C `DELETE`s their tab; a `process.kill(pid, 0)` liveness check on the server GCs tabs whose owner crashed. No daemon, no `~/.mdscroll/`, no `push` subcommand — it all happens automatically.
