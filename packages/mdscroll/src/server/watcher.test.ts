import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Store } from '../store/state.js';
import { warmup } from './render.js';
import { createWatchers, type Watchers } from './watcher.js';

beforeAll(async () => {
  await warmup();
}, 30_000);

// fs.watch registration is asynchronous on macOS; let the kernel attach
// the FSEvents listener before firing the triggering write.
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 100));

// Long enough for debounce (100ms) plus a read + render round trip, so a
// would-be update has had every chance to land before a negative assert.
const quietPeriod = (): Promise<void> => new Promise((r) => setTimeout(r, 400));

const seedDoc = (store: Store, path: string): void => {
  store.upsert({
    key: path,
    label: path,
    kind: 'file',
    path,
    watched: true,
    stale: false,
    markdown: '# v1',
    html: '<h1>v1</h1>\n',
  });
};

describe('createWatchers', () => {
  let dir: string;
  let file: string;
  let store: Store;
  let watchers: Watchers;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mdscroll-watcher-'));
    file = join(dir, 'doc.md');
    await writeFile(file, '# v1');
    store = new Store();
    watchers = createWatchers(store);
  });

  afterEach(async () => {
    watchers.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('patches the doc with fresh markdown and html after a file edit', async () => {
    seedDoc(store, file);
    watchers.attach(file, file);
    await settle();

    await writeFile(file, '# v2');

    await vi.waitFor(
      () => {
        expect(store.get(file)?.markdown).toBe('# v2');
      },
      { timeout: 3000 },
    );
    const doc = store.get(file);
    expect(doc?.html).toContain('<h1>v2</h1>');
    expect(doc?.stale).toBe(false);
  });

  it('does not re-render or emit when a save leaves the bytes unchanged', async () => {
    seedDoc(store, file);
    // Make the on-disk content match what the doc already holds, so a
    // touch-style save produces no real change.
    await writeFile(file, '# v1');
    watchers.attach(file, file);
    await settle();

    let updates = 0;
    const unsubscribe = store.subscribe((event) => {
      if (event.kind === 'updated') updates += 1;
    });
    await writeFile(file, '# v1');
    await quietPeriod();
    unsubscribe();

    expect(updates).toBe(0);
  });

  it('flags the doc stale but keeps the last markdown when the file is deleted', async () => {
    seedDoc(store, file);
    watchers.attach(file, file);
    await settle();

    await unlink(file);

    await vi.waitFor(
      () => {
        expect(store.get(file)?.stale).toBe(true);
      },
      { timeout: 2000 },
    );
    expect(store.get(file)?.markdown).toBe('# v1');
  });

  it('clears staleness and picks up content when the file reappears', async () => {
    seedDoc(store, file);
    watchers.attach(file, file);
    await settle();
    await unlink(file);
    await vi.waitFor(
      () => {
        expect(store.get(file)?.stale).toBe(true);
      },
      { timeout: 2000 },
    );

    await writeFile(file, '# v2');

    await vi.waitFor(
      () => {
        const doc = store.get(file);
        expect(doc?.stale).toBe(false);
        expect(doc?.markdown).toBe('# v2');
      },
      { timeout: 3000 },
    );
  });

  it('ignores edits after detach', async () => {
    seedDoc(store, file);
    watchers.attach(file, file);
    await settle();
    watchers.detach(file);

    await writeFile(file, '# v2');
    await quietPeriod();

    expect(store.get(file)?.markdown).toBe('# v1');
  });

  it('drops the update when the doc was removed from the store', async () => {
    seedDoc(store, file);
    watchers.attach(file, file);
    await settle();
    store.remove(file);

    await writeFile(file, '# v2');
    await quietPeriod();

    expect(store.size()).toBe(0);
  });

  it('returns false from attach when the parent directory does not exist', () => {
    const missing = join(dir, 'missing', 'doc.md');

    const attached = watchers.attach(missing, missing);

    expect(attached).toBe(false);
  });

  it('stops every watcher on close()', async () => {
    const other = join(dir, 'other.md');
    await writeFile(other, '# v1');
    seedDoc(store, file);
    seedDoc(store, other);
    watchers.attach(file, file);
    watchers.attach(other, other);
    await settle();

    watchers.close();
    await writeFile(file, '# v2');
    await writeFile(other, '# v2');
    await quietPeriod();

    expect(store.get(file)?.markdown).toBe('# v1');
    expect(store.get(other)?.markdown).toBe('# v1');
  });
});
