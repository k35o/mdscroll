import { describe, expect, it, vi } from 'vitest';
import { Store } from './state.js';

describe('Store', () => {
  describe('initial state', () => {
    it('has no current snapshot', () => {
      expect(new Store().current()).toBeNull();
    });
  });

  describe('setCurrent', () => {
    it('stores the given markdown and source as the current snapshot', () => {
      const store = new Store();
      store.setCurrent('# hello', 'plan.md');
      const current = store.current();
      expect(current?.markdown).toBe('# hello');
      expect(current?.source).toBe('plan.md');
    });

    it('returns the freshly created snapshot', () => {
      const snap = new Store().setCurrent('body', 'src');
      expect(snap.markdown).toBe('body');
      expect(snap.source).toBe('src');
      expect(snap.createdAt).toBeTypeOf('number');
    });

    it('replaces the previous snapshot instead of accumulating', () => {
      const store = new Store();
      store.setCurrent('a', 's');
      store.setCurrent('b', 's');
      expect(store.current()?.markdown).toBe('b');
    });
  });

  describe('subscribe', () => {
    it('invokes the listener on every setCurrent call', () => {
      const store = new Store();
      const listener = vi.fn();
      store.subscribe(listener);

      store.setCurrent('a', 's');
      store.setCurrent('b', 's');

      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('passes the new snapshot to the listener', () => {
      const store = new Store();
      const listener = vi.fn();
      store.subscribe(listener);

      store.setCurrent('hello', 'src');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ markdown: 'hello', source: 'src' }),
      );
    });

    it('stops notifying after the returned unsubscribe is called', () => {
      const store = new Store();
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);

      store.setCurrent('a', 's');
      unsubscribe();
      store.setCurrent('b', 's');

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
