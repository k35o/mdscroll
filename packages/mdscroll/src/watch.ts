import { watch } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

export type WatchHandle = {
  close: () => void;
};

const DEBOUNCE_MS = 100;

/**
 * Watch a single file for changes and invoke `onChange` after a short
 * debounce. Implementation notes:
 *
 * - We watch the parent directory rather than the file directly.
 *   Editors like vim and `mv` do a write-to-temp + rename dance that
 *   destroys a file-level watcher's inode; a directory watcher survives.
 * - macOS often fires two or three events per save (FSEvents is chatty).
 *   A 100 ms trailing debounce collapses them without adding perceptible
 *   lag in the browser.
 * - `onChange` errors are swallowed intentionally. The watcher is meant
 *   to run for the lifetime of the server and we'd rather log and
 *   continue than crash on a transient ENOENT during a save window.
 */
export const watchFile = (file: string, onChange: () => void | Promise<void>): WatchHandle => {
  const absolute = resolve(file);
  const dir = dirname(absolute);
  const base = basename(absolute);

  let timer: NodeJS.Timeout | null = null;
  let closed = false;

  const fire = () => {
    timer = null;
    if (closed) return;
    void (async () => {
      try {
        await onChange();
      } catch (err) {
        process.stderr.write(`mdscroll: watcher callback failed: ${String(err)}\n`);
      }
    })();
  };

  const watcher = watch(dir, (_eventType, filename) => {
    if (closed) return;
    if (filename !== base) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(fire, DEBOUNCE_MS);
  });

  return {
    close: () => {
      if (closed) return;
      closed = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      watcher.close();
    },
  };
};
