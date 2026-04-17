import { basename, relative, resolve } from 'node:path';

export const UNTITLED = '(untitled)';

/**
 * Label shown in the header when a file path was given on the CLI.
 * Prefer cwd-relative so `mdscroll plan.md` shows `plan.md`, while
 * `mdscroll docs/plan.md` keeps the subdirectory. An absolute path that
 * is not under cwd would render with `../..` prefixes, which is fine —
 * it's still short and unambiguous.
 */
export const fileSourceLabel = (file: string): string => {
  const absolute = resolve(file);
  const rel = relative(process.cwd(), absolute);
  return rel.length > 0 ? rel : basename(absolute);
};

/**
 * Label shown in the header for stdin mode. The first ATX `# H1` line in
 * the document wins; otherwise we fall back to UNTITLED. We intentionally
 * don't support setext headings (`===` underline) — ATX is what AI
 * agents produce, and keeping the rule strict avoids weird matches
 * inside code blocks.
 */
export const stdinSourceLabel = (markdown: string): string => {
  const match = markdown.match(/^#\s+(.+?)\s*$/m);
  const title = match?.[1]?.trim();
  return title && title.length > 0 ? title : UNTITLED;
};

/**
 * Clip a long source label from the left so the end (typically the
 * filename) stays visible — `…T/mdscroll-live/plan.md`.
 *
 * We do this at render time rather than relying on CSS `text-overflow:
 * ellipsis`, which always anchors the ellipsis on the right. The
 * RTL + plaintext CSS hack is fragile across browsers; truncating the
 * string up-front is unambiguous.
 */
const MAX_DISPLAY_LEN = 60;
export const displaySourceLabel = (source: string): string => {
  if (source.length <= MAX_DISPLAY_LEN) return source;
  return `…${source.slice(-(MAX_DISPLAY_LEN - 1))}`;
};
