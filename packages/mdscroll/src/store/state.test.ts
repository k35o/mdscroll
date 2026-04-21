import { describe, expect, it, vi } from 'vitest';
import { Store } from './state.js';

describe('Store', () => {
  describe('initial state', () => {
    it('lists no docs', () => {
      expect(new Store().list()).toEqual([]);
    });
  });

  describe('add', () => {
    it('returns a doc with a generated id and a write token', () => {
      const store = new Store();
      const { doc, token } = store.add({ source: 'plan.md', markdown: '# hi' });
      expect(doc.id).toMatch(/[0-9a-f-]{36}/);
      expect(doc.source).toBe('plan.md');
      expect(doc.markdown).toBe('# hi');
      expect(token.length).toBeGreaterThanOrEqual(16);
    });

    it('retains each added doc in insertion order', () => {
      const store = new Store();
      store.add({ source: 'a', markdown: '1' });
      store.add({ source: 'b', markdown: '2' });
      expect(store.list().map((d) => d.source)).toEqual(['a', 'b']);
    });

    it('records ownerPid when provided', () => {
      const store = new Store();
      const { doc } = store.add({ source: 's', markdown: 'x', ownerPid: 4242 });
      expect(doc.ownerPid).toBe(4242);
    });
  });

  describe('authorize', () => {
    it('accepts the token returned by add', () => {
      const store = new Store();
      const { doc, token } = store.add({ source: 's', markdown: 'x' });
      expect(store.authorize(doc.id, token)).toBe(true);
    });

    it('rejects a mismatched token', () => {
      const store = new Store();
      const { doc } = store.add({ source: 's', markdown: 'x' });
      expect(store.authorize(doc.id, 'nope')).toBe(false);
    });

    it('rejects an unknown id', () => {
      expect(new Store().authorize('no-such-id', 'whatever')).toBe(false);
    });
  });

  describe('update', () => {
    it('applies partial updates and bumps updatedAt', async () => {
      const store = new Store();
      const { doc } = store.add({ source: 's', markdown: 'x' });
      // Force updatedAt to differ.
      await new Promise((r) => setTimeout(r, 2));
      const next = store.update(doc.id, { markdown: 'y' });
      expect(next?.markdown).toBe('y');
      expect(next?.source).toBe('s');
      expect((next?.updatedAt ?? 0) > doc.updatedAt).toBe(true);
    });

    it('returns null for an unknown id', () => {
      expect(new Store().update('missing', { markdown: 'x' })).toBeNull();
    });
  });

  describe('remove', () => {
    it('removes the doc and invalidates its token', () => {
      const store = new Store();
      const { doc, token } = store.add({ source: 's', markdown: 'x' });
      expect(store.remove(doc.id)).toBe(true);
      expect(store.get(doc.id)).toBeNull();
      expect(store.authorize(doc.id, token)).toBe(false);
    });

    it('returns false for an unknown id', () => {
      expect(new Store().remove('missing')).toBe(false);
    });
  });

  describe('idempotency via instanceId', () => {
    it('upserts the existing doc when add() is called with the same instanceId', () => {
      const store = new Store();
      const first = store.add({ source: 's', markdown: 'x', instanceId: 'abc' });
      const second = store.add({ source: 's2', markdown: 'y', instanceId: 'abc' });
      expect(second.doc.id).toBe(first.doc.id);
      expect(store.list()).toHaveLength(1);
      expect(store.get(first.doc.id)?.markdown).toBe('y');
      expect(store.get(first.doc.id)?.source).toBe('s2');
    });

    it('rotates the token on idempotent upsert', () => {
      const store = new Store();
      const first = store.add({ source: 's', markdown: 'x', instanceId: 'abc' });
      const second = store.add({ source: 's', markdown: 'y', instanceId: 'abc' });
      expect(second.token).not.toBe(first.token);
      expect(store.authorize(first.doc.id, first.token)).toBe(false);
      expect(store.authorize(second.doc.id, second.token)).toBe(true);
    });

    it('emits an updated event (not added) on idempotent upsert', () => {
      const store = new Store();
      const listener = vi.fn();
      store.add({ source: 's', markdown: 'x', instanceId: 'abc' });
      store.subscribe(listener);
      store.add({ source: 's', markdown: 'y', instanceId: 'abc' });
      expect(listener.mock.calls.map((c) => c[0].kind)).toEqual(['updated']);
    });

    it('frees the instanceId when the doc is removed, allowing a fresh id next time', () => {
      const store = new Store();
      const first = store.add({ source: 's', markdown: 'x', instanceId: 'abc' });
      store.remove(first.doc.id);
      const second = store.add({ source: 's', markdown: 'x', instanceId: 'abc' });
      expect(second.doc.id).not.toBe(first.doc.id);
    });
  });

  describe('size / countByOwnerPid / hasInstance', () => {
    it('tracks size and per-owner counts', () => {
      const store = new Store();
      store.add({ source: 's', markdown: 'x', ownerPid: 100 });
      store.add({ source: 's', markdown: 'y', ownerPid: 100 });
      store.add({ source: 's', markdown: 'z', ownerPid: 200 });
      expect(store.size()).toBe(3);
      expect(store.countByOwnerPid(100)).toBe(2);
      expect(store.countByOwnerPid(200)).toBe(1);
      expect(store.countByOwnerPid(999)).toBe(0);
    });

    it('reports hasInstance only for ids actually stored', () => {
      const store = new Store();
      store.add({ source: 's', markdown: 'x', instanceId: 'here' });
      expect(store.hasInstance('here')).toBe(true);
      expect(store.hasInstance('missing')).toBe(false);
    });
  });

  describe('subscribe', () => {
    it('emits added/updated/removed events', () => {
      const store = new Store();
      const listener = vi.fn();
      store.subscribe(listener);

      const { doc } = store.add({ source: 's', markdown: 'x' });
      store.update(doc.id, { markdown: 'y' });
      store.remove(doc.id);

      expect(listener.mock.calls.map((c) => c[0].kind)).toEqual(['added', 'updated', 'removed']);
    });

    it('stops notifying after unsubscribe', () => {
      const store = new Store();
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);

      store.add({ source: 's', markdown: 'x' });
      unsubscribe();
      store.add({ source: 's2', markdown: 'y' });

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
