import { describe, expect, it, vi } from 'vitest';
import { Store } from './state.js';

describe('Store', () => {
  describe('初期状態', () => {
    it('markdown は空文字列で始まる', () => {
      const store = new Store();
      expect(store.get().markdown).toBe('');
    });

    it('version は 0 で始まる', () => {
      const store = new Store();
      expect(store.get().version).toBe(0);
    });
  });

  describe('set', () => {
    it('markdown を更新する', () => {
      const store = new Store();
      store.set('# hello');
      expect(store.get().markdown).toBe('# hello');
    });

    it('呼び出しごとに version をインクリメントする', () => {
      const store = new Store();
      store.set('a');
      store.set('b');
      store.set('c');
      expect(store.get().version).toBe(3);
    });

    it('更新後のスナップショットを返す', () => {
      const store = new Store();
      const snapshot = store.set('hello');
      expect(snapshot.markdown).toBe('hello');
      expect(snapshot.version).toBe(1);
    });

    it('空文字列の set でもversionは進む', () => {
      const store = new Store();
      store.set('something');
      store.set('');
      expect(store.get().markdown).toBe('');
      expect(store.get().version).toBe(2);
    });
  });

  describe('subscribe', () => {
    it('set のたびにリスナーが呼ばれる', () => {
      const store = new Store();
      const listener = vi.fn();
      store.subscribe(listener);

      store.set('a');
      store.set('b');

      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('リスナーには新しいスナップショットが渡される', () => {
      const store = new Store();
      const listener = vi.fn();
      store.subscribe(listener);

      store.set('hello');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ markdown: 'hello', version: 1 }),
      );
    });

    it('複数のリスナーが全員呼ばれる', () => {
      const store = new Store();
      const a = vi.fn();
      const b = vi.fn();
      store.subscribe(a);
      store.subscribe(b);

      store.set('x');

      expect(a).toHaveBeenCalledOnce();
      expect(b).toHaveBeenCalledOnce();
    });

    it('返される解除関数でリスナーを外せる', () => {
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
