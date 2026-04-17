import { describe, expect, it, vi } from 'vitest';
import { MAX_HISTORY, Store, toMeta } from './state.js';

describe('Store', () => {
  describe('initial state', () => {
    it('has no current snapshot', () => {
      expect(new Store().current()).toBeNull();
    });

    it('has an empty history', () => {
      expect(new Store().history()).toEqual([]);
    });
  });

  describe('push', () => {
    it('makes the pushed content the current snapshot', () => {
      const store = new Store();
      store.push('# hello', 'plan.md');
      const current = store.current();
      expect(current?.markdown).toBe('# hello');
      expect(current?.source).toBe('plan.md');
    });

    it('returns the freshly created snapshot', () => {
      const snap = new Store().push('body', 'src');
      expect(snap.markdown).toBe('body');
      expect(snap.source).toBe('src');
      expect(snap.id).toBeTypeOf('string');
      expect(snap.createdAt).toBeTypeOf('number');
    });

    it('assigns a unique id per push', () => {
      const store = new Store();
      const a = store.push('a', 's');
      const b = store.push('b', 's');
      expect(a.id).not.toBe(b.id);
    });

    it('orders history newest first', () => {
      const store = new Store();
      store.push('a', 's');
      store.push('b', 's');
      store.push('c', 's');
      const history = store.history();
      expect(history.map((s) => s.markdown)).toEqual(['c', 'b', 'a']);
    });

    it('caps history at MAX_HISTORY entries', () => {
      const store = new Store();
      for (let i = 0; i < MAX_HISTORY + 5; i += 1) {
        store.push(`v${i}`, 's');
      }
      expect(store.history().length).toBe(MAX_HISTORY);
      expect(store.current()?.markdown).toBe(`v${MAX_HISTORY + 4}`);
    });
  });

  describe('byId', () => {
    it('returns the matching snapshot', () => {
      const store = new Store();
      const a = store.push('a', 's');
      store.push('b', 's');
      expect(store.byId(a.id)?.markdown).toBe('a');
    });

    it('returns null for an unknown id', () => {
      expect(new Store().byId('missing')).toBeNull();
    });
  });

  describe('subscribe', () => {
    it('invokes the listener on every push', () => {
      const store = new Store();
      const listener = vi.fn();
      store.subscribe(listener);

      store.push('a', 's');
      store.push('b', 's');

      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('passes the new snapshot to the listener', () => {
      const store = new Store();
      const listener = vi.fn();
      store.subscribe(listener);

      store.push('hello', 'src');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ markdown: 'hello', source: 'src' }),
      );
    });

    it('stops notifying after the returned unsubscribe is called', () => {
      const store = new Store();
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);

      store.push('a', 's');
      unsubscribe();
      store.push('b', 's');

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('toMeta', () => {
    it('drops markdown from the snapshot', () => {
      const meta = toMeta({
        id: 'abc',
        markdown: 'hello',
        source: 'src',
        createdAt: 1000,
      });
      expect(meta).toEqual({ id: 'abc', source: 'src', createdAt: 1000 });
    });
  });
});
