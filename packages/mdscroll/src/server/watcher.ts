import { readFile } from 'node:fs/promises';
import { MAX_MARKDOWN_BYTES, STALE_AFTER_FAILURES } from '../constants.js';
import type { Store } from '../store/state.js';
import { watchFile, type WatchHandle } from '../watch.js';
import { render } from './render.js';

const RETRY_DELAY_MS = 150;

export type Watchers = {
  /**
   * Watch `path` on behalf of the doc at `key`. Replaces any existing
   * watcher for the key. Returns false when the watcher could not be
   * attached (e.g. the parent directory does not exist).
   */
  attach: (key: string, path: string) => boolean;
  detach: (key: string) => void;
  close: () => void;
};

/**
 * Server-side file watching, one watcher per watched doc. This is what
 * lets a push invocation exit immediately while the browser keeps
 * live-reloading: the server owns the fs.watch, not the pusher.
 *
 * Update semantics:
 * - A successful read patches the doc via `updateIfPresent` — never an
 *   upsert. If the doc was removed while a read was in flight (close
 *   button or `rm` racing the debounce window), the update is dropped;
 *   only an external PUT can create a doc.
 * - `STALE_AFTER_FAILURES` consecutive failed reads flag the doc stale
 *   (last content kept). The directory watcher stays attached, so a
 *   file that reappears (git checkout, build tools) clears staleness by
 *   itself on the next successful read.
 */
export const createWatchers = (store: Store): Watchers => {
  const handles = new Map<string, WatchHandle>();

  const detach = (key: string): void => {
    const handle = handles.get(key);
    if (!handle) return;
    handles.delete(key);
    handle.close();
  };

  const attach = (key: string, path: string): boolean => {
    detach(key);
    let failures = 0;
    let handle: WatchHandle;
    // Every write path re-checks this after its awaits: a detach/re-attach
    // for the same key installs a new handle, and a superseded pump must
    // not flag the fresh doc stale or clobber its content.
    const current = () => handles.get(key) === handle;
    const markStale = () => {
      const doc = store.get(key);
      if (doc && !doc.stale) store.updateIfPresent(key, { stale: true });
    };
    const pump = async (): Promise<void> => {
      if (!current()) return;
      let markdown: string;
      try {
        markdown = await readFile(path, 'utf-8');
      } catch {
        if (!current()) return;
        failures += 1;
        if (failures >= STALE_AFTER_FAILURES) {
          markStale();
          return;
        }
        // A deleted file fires only one directory event, so re-drive the
        // read ourselves: either the file reappears (atomic-save window,
        // git checkout) and we recover, or the failures accumulate to
        // the stale threshold.
        setTimeout(() => void pump(), RETRY_DELAY_MS);
        return;
      }
      failures = 0;
      if (Buffer.byteLength(markdown, 'utf-8') > MAX_MARKDOWN_BYTES) {
        if (current()) markStale();
        return;
      }
      // No-op saves (touch, formatter that rewrites identical bytes) fire
      // watch events too; skip the render + broadcast when nothing changed
      // and the doc is already fresh.
      const before = store.get(key);
      if (before && !before.stale && before.markdown === markdown) return;
      const html = await render(markdown);
      if (!current()) return;
      store.updateIfPresent(key, { markdown, html, stale: false });
    };
    try {
      handle = watchFile(path, pump, {
        // fs.watch itself died (EMFILE, dir removed on some platforms):
        // permanently un-watched until a re-push re-attaches. Guard against
        // a late error from a watcher this key has already replaced.
        onError: () => {
          if (!current()) return;
          store.updateIfPresent(key, { stale: true, watched: false });
          detach(key);
        },
      });
    } catch {
      return false;
    }
    handles.set(key, handle);
    return true;
  };

  return {
    attach,
    detach,
    close: () => {
      for (const handle of handles.values()) handle.close();
      handles.clear();
    },
  };
};
