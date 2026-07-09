export const LOOPBACK_HOST = '127.0.0.1';
export const DEFAULT_PORT = 4977;

/**
 * Health probes are answered before renderer warmup, so a healthy server
 * responds in single-digit milliseconds. Anything slower than this is
 * classified as a non-mdscroll squatter.
 */
export const PROBE_TIMEOUT_MS = 500;

export const REQUEST_TIMEOUT_MS = 3000;

/**
 * Admission caps. Deliberately generous — the usual workload is a
 * handful of markdown files under 1 MB — but they keep a runaway local
 * process from pinning arbitrary memory on the shared server. The
 * markdown cap is enforced both on request bodies and on server-side
 * file reads.
 */
export const MAX_MARKDOWN_BYTES = 10 * 1024 * 1024;
export const MAX_KEY_LENGTH = 4096;
export const MAX_LABEL_LENGTH = 1024;
export const MAX_DOCS_TOTAL = 128;

/**
 * Consecutive failed reads before a watched doc is flagged stale. A
 * single atomic-rename save can produce one transient ENOENT; three in
 * a row means the file is actually gone.
 */
export const STALE_AFTER_FAILURES = 3;

/** Fixed key for anonymous stdin pushes — repeated pipes share one tab. */
export const UNTITLED_KEY = 'untitled';
