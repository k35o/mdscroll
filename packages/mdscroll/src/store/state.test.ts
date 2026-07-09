import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoreEvent, UpsertInput } from './state.js';
import { Store } from './state.js';

const makeInput = (overrides: Partial<UpsertInput> = {}): UpsertInput => ({
  key: '/docs/plan.md',
  label: 'plan.md',
  kind: 'file',
  path: '/docs/plan.md',
  watched: true,
  stale: false,
  markdown: '# plan',
  html: '<h1>plan</h1>',
  ...overrides,
});

const capture = (store: Store): StoreEvent[] => {
  const events: StoreEvent[] = [];
  store.subscribe((event) => events.push(event));
  return events;
};

afterEach(() => {
  vi.useRealTimers();
});

describe('upsert', () => {
  it('creates a doc and reports created: true for a new key', () => {
    const store = new Store();

    const { doc, created } = store.upsert(makeInput());

    expect(created).toBe(true);
    expect(doc.key).toBe('/docs/plan.md');
    expect(doc.markdown).toBe('# plan');
    expect(store.get('/docs/plan.md')?.html).toBe('<h1>plan</h1>');
  });

  it('emits added when the key is new', () => {
    const store = new Store();
    const events = capture(store);

    store.upsert(makeInput());

    expect(events).toEqual([
      { kind: 'added', doc: expect.objectContaining({ key: '/docs/plan.md' }) },
    ]);
  });

  it('replaces the doc and reports created: false for an existing key', () => {
    const store = new Store();
    store.upsert(makeInput());

    const { doc, created } = store.upsert(makeInput({ markdown: 'v2', html: '<p>v2</p>' }));

    expect(created).toBe(false);
    expect(doc.markdown).toBe('v2');
    expect(store.get('/docs/plan.md')?.html).toBe('<p>v2</p>');
    expect(store.size()).toBe(1);
  });

  it('emits updated when the key already exists', () => {
    const store = new Store();
    store.upsert(makeInput());
    const events = capture(store);

    store.upsert(makeInput({ markdown: 'v2' }));

    expect(events).toEqual([{ kind: 'updated', doc: expect.objectContaining({ markdown: 'v2' }) }]);
  });

  it('preserves createdAt and refreshes updatedAt on replace', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const store = new Store();
    store.upsert(makeInput());

    vi.setSystemTime(6_000);
    const { doc } = store.upsert(makeInput({ markdown: 'v2' }));

    expect(doc.createdAt).toBe(1_000);
    expect(doc.updatedAt).toBe(6_000);
  });
});

describe('updateIfPresent', () => {
  it('applies the patch and keeps unpatched fields', () => {
    const store = new Store();
    store.upsert(makeInput());

    const doc = store.updateIfPresent('/docs/plan.md', { markdown: 'v2', stale: true });

    expect(doc?.markdown).toBe('v2');
    expect(doc?.stale).toBe(true);
    expect(doc?.label).toBe('plan.md');
    expect(store.get('/docs/plan.md')?.markdown).toBe('v2');
  });

  it('refreshes updatedAt without touching createdAt', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const store = new Store();
    store.upsert(makeInput());

    vi.setSystemTime(6_000);
    const doc = store.updateIfPresent('/docs/plan.md', { markdown: 'v2' });

    expect(doc?.createdAt).toBe(1_000);
    expect(doc?.updatedAt).toBe(6_000);
  });

  it('emits updated with the patched doc', () => {
    const store = new Store();
    store.upsert(makeInput());
    const events = capture(store);

    store.updateIfPresent('/docs/plan.md', { markdown: 'v2' });

    expect(events).toEqual([{ kind: 'updated', doc: expect.objectContaining({ markdown: 'v2' }) }]);
  });

  it('returns null for a missing key', () => {
    const store = new Store();

    expect(store.updateIfPresent('/missing.md', { markdown: 'v2' })).toBeNull();
  });

  it('does not create a doc or emit for a missing key', () => {
    const store = new Store();
    const events = capture(store);

    store.updateIfPresent('/missing.md', { markdown: 'v2' });

    expect(store.size()).toBe(0);
    expect(events).toEqual([]);
  });
});

describe('remove', () => {
  it('deletes the doc and returns true', () => {
    const store = new Store();
    store.upsert(makeInput());

    const removed = store.remove('/docs/plan.md');

    expect(removed).toBe(true);
    expect(store.get('/docs/plan.md')).toBeNull();
  });

  it('emits removed with the key', () => {
    const store = new Store();
    store.upsert(makeInput());
    const events = capture(store);

    store.remove('/docs/plan.md');

    expect(events).toEqual([{ kind: 'removed', key: '/docs/plan.md' }]);
  });

  it('returns false and emits nothing for a missing key', () => {
    const store = new Store();
    const events = capture(store);

    const removed = store.remove('/missing.md');

    expect(removed).toBe(false);
    expect(events).toEqual([]);
  });
});

describe('list', () => {
  it('returns an empty array for an empty store', () => {
    const store = new Store();

    expect(store.list()).toEqual([]);
  });

  it('returns every stored doc', () => {
    const store = new Store();
    store.upsert(makeInput({ key: '/a.md', label: 'a.md' }));
    store.upsert(makeInput({ key: '/b.md', label: 'b.md' }));

    expect(store.list().map((doc) => doc.key)).toEqual(['/a.md', '/b.md']);
  });
});

describe('get', () => {
  it('returns the doc for a known key', () => {
    const store = new Store();
    store.upsert(makeInput());

    expect(store.get('/docs/plan.md')?.label).toBe('plan.md');
  });

  it('returns null for an unknown key', () => {
    const store = new Store();

    expect(store.get('/missing.md')).toBeNull();
  });
});

describe('size', () => {
  it('tracks adds and removes', () => {
    const store = new Store();
    expect(store.size()).toBe(0);

    store.upsert(makeInput({ key: '/a.md' }));
    store.upsert(makeInput({ key: '/b.md' }));
    expect(store.size()).toBe(2);

    store.remove('/a.md');
    expect(store.size()).toBe(1);
  });
});

describe('subscribe', () => {
  it('delivers each event to every subscriber', () => {
    const store = new Store();
    const first = capture(store);
    const second = capture(store);

    store.upsert(makeInput());

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
  });

  it('stops delivering events after unsubscribe', () => {
    const store = new Store();
    const events: StoreEvent[] = [];
    const unsubscribe = store.subscribe((event) => events.push(event));

    unsubscribe();
    store.upsert(makeInput());

    expect(events).toEqual([]);
  });
});
