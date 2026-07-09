import { basename, relative, resolve, sep } from 'node:path';

export const UNTITLED = '(untitled)';

/**
 * Return a display string that uses forward slashes as separators
 * regardless of platform. The browser tab strip splits on `/` to derive
 * a basename; if we leave Windows-native `\` in the label the basename
 * split is a no-op and tabs show the full path.
 */
const toForwardSlashes = (p: string): string => (sep === '/' ? p : p.split(sep).join('/'));

/**
 * Display label for a file doc. Prefer cwd-relative so `mdscroll plan.md`
 * shows `plan.md` and `mdscroll docs/plan.md` keeps the subdirectory.
 * Files outside cwd fall back to the basename — a `../../..` chain is
 * noise, and the full path (the doc key) is always available in `ls`
 * and the tab tooltip.
 */
export const fileSourceLabel = (file: string): string => {
  const absolute = resolve(file);
  const rel = relative(process.cwd(), absolute);
  if (rel.length === 0) return basename(absolute);
  if (rel.startsWith('..')) return basename(absolute);
  return toForwardSlashes(rel);
};

/**
 * Display label for stdin mode. The first ATX `# H1` line outside a fenced
 * code block wins; otherwise UNTITLED. Skipping fences matters because a
 * doc that opens with a shell/python block would otherwise take a `# comment`
 * line as its title. Setext headings (`===` underline) are unsupported —
 * ATX is what AI agents produce. Used for the label only; stdin doc identity
 * comes from `--name` (or the fixed `untitled` key).
 */
export const stdinSourceLabel = (markdown: string): string => {
  let fence: string | null = null;
  for (const line of markdown.split('\n')) {
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fence !== null) {
      if (fenceMatch && line.trim().startsWith(fence)) fence = null;
      continue;
    }
    if (fenceMatch) {
      fence = fenceMatch[1]!.slice(0, 3);
      continue;
    }
    const heading = line.match(/^#\s+(.+?)\s*$/);
    const title = heading?.[1]?.trim();
    if (title && title.length > 0) return title;
  }
  return UNTITLED;
};

/**
 * Clip a long label from the left so the end (typically the filename)
 * stays visible — `…T/mdscroll-live/plan.md`. Done at render time rather
 * than with CSS `text-overflow`, which always anchors the ellipsis on
 * the right.
 */
const MAX_DISPLAY_LEN = 60;
export const displaySourceLabel = (source: string): string => {
  if (source.length <= MAX_DISPLAY_LEN) return source;
  return `…${source.slice(-(MAX_DISPLAY_LEN - 1))}`;
};
