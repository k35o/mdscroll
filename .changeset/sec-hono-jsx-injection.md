---
'mdscroll': patch
---

Security: bump `hono` from 4.12.12 to **4.12.14** to pull in the fix for [GHSA-458j-xx4x-4375](https://github.com/honojs/hono/security/advisories/GHSA-458j-xx4x-4375) — improper handling of JSX attribute names that allowed HTML injection via `hono/jsx` SSR. mdscroll uses Hono JSX to render the preview shell, so this patch closes the exposure.

Also bumps `vite-plus` (dev-only toolchain) from 0.1.16 to **0.1.17** to pick up the fix for [GHSA-33r3-4whc-44c2](https://github.com/voidzero-dev/vite-plus/security/advisories/GHSA-33r3-4whc-44c2) — path traversal in `downloadPackageManager()`.
