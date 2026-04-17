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
    // `filename` can be null on platforms / filesystems where the
    // kernel doesn't surface it (some older Linux, certain network
    // mounts). We can't tell whether the event was for our file, so we
    // fall through and let the onChange re-read settle it — a wasted
    // read is cheaper than silently dropping every update.
    if (filename !== null && filename !== base) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(fire, DEBOUNCE_MS);
  });

  // FSWatcher surfaces some failures asynchronously via 'error' rather
  // than throwing from watch(). Attaching a listener keeps those from
  // crashing the process: log the error and let the existing content
  // keep serving. The watcher is effectively dead after this, but the
  // HTTP server and last-known content are still useful to the user.
  watcher.on('error', (err) => {
    process.stderr.write(`mdscroll: watcher error: ${String(err)}\n`);
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
