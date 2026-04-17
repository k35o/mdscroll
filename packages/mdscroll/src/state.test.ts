import { describe, expect, it, vi } from 'vitest';
import { Store } from './state.js';

describe('Store', () => {
  describe('initial state', () => {
    it('starts with an empty markdown string', () => {
      const store = new Store();
      expect(store.get().markdown).toBe('');
    });

    it('starts at version 0', () => {
      const store = new Store();
      expect(store.get().version).toBe(0);
    });
  });

  describe('set', () => {
    it('updates the markdown', () => {
      const store = new Store();
      store.set('# hello');
      expect(store.get().markdown).toBe('# hello');
    });

    it('increments the version on every call', () => {
      const store = new Store();
      store.set('a');
      store.set('b');
      store.set('c');
      expect(store.get().version).toBe(3);
    });

    it('returns the snapshot after the update', () => {
      const store = new Store();
      const snapshot = store.set('hello');
      expect(snapshot.markdown).toBe('hello');
      expect(snapshot.version).toBe(1);
    });

    it('advances the version even when setting an empty string', () => {
      const store = new Store();
      store.set('something');
      store.set('');
      expect(store.get().markdown).toBe('');
      expect(store.get().version).toBe(2);
    });
  });

  describe('subscribe', () => {
    it('invokes the listener on every set', () => {
      const store = new Store();
      const listener = vi.fn();
      store.subscribe(listener);

      store.set('a');
      store.set('b');

      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('passes the new snapshot to the listener', () => {
      const store = new Store();
      const listener = vi.fn();
      store.subscribe(listener);

      store.set('hello');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ markdown: 'hello', version: 1 }),
      );
    });

    it('notifies all registered listeners', () => {
      const store = new Store();
      const a = vi.fn();
      const b = vi.fn();
      store.subscribe(a);
      store.subscribe(b);

      store.set('x');

      expect(a).toHaveBeenCalledOnce();
      expect(b).toHaveBeenCalledOnce();
    });

    it('stops notifying after the returned unsubscribe is called', () => {
      const store = new Store();
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);

      store.set('a');
      unsubscribe();
      store.set('b');

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
