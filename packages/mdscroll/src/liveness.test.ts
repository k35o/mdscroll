import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachLiveness } from './liveness.js';
import { Store } from './store/state.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('attachLiveness', () => {
  it('removes a doc when its ownerPid is reported dead', () => {
    vi.useFakeTimers();
    const store = new Store();
    const { doc } = store.add({ source: 's', markdown: 'x', ownerPid: 4242 });
    const isAlive = vi.fn((pid: number) => pid !== 4242);

    attachLiveness(store, { intervalMs: 10, selfPid: 1, isAlive });

    vi.advanceTimersByTime(10);

    expect(store.get(doc.id)).toBeNull();
    expect(isAlive).toHaveBeenCalledWith(4242);
  });

  it('keeps a doc whose ownerPid is still alive', () => {
    vi.useFakeTimers();
    const store = new Store();
    const { doc } = store.add({ source: 's', markdown: 'x', ownerPid: 9999 });
    attachLiveness(store, {
      intervalMs: 10,
      selfPid: 1,
      isAlive: () => true,
    });

    vi.advanceTimersByTime(50);

    expect(store.get(doc.id)?.markdown).toBe('x');
  });

  it('never probes its own pid', () => {
    vi.useFakeTimers();
    const store = new Store();
    store.add({ source: 's', markdown: 'x', ownerPid: 42 });
    const isAlive = vi.fn(() => true);
    attachLiveness(store, { intervalMs: 10, selfPid: 42, isAlive });

    vi.advanceTimersByTime(30);

    expect(isAlive).not.toHaveBeenCalled();
  });

  it('ignores docs that have no ownerPid', () => {
    vi.useFakeTimers();
    const store = new Store();
    store.add({ source: 's', markdown: 'x' });
    const isAlive = vi.fn();
    attachLiveness(store, { intervalMs: 10, selfPid: 1, isAlive });

    vi.advanceTimersByTime(30);

    expect(isAlive).not.toHaveBeenCalled();
  });

  it('stops polling after the returned handle is stopped', () => {
    vi.useFakeTimers();
    const store = new Store();
    store.add({ source: 's', markdown: 'x', ownerPid: 4242 });
    const isAlive = vi.fn(() => true);
    const handle = attachLiveness(store, {
      intervalMs: 10,
      selfPid: 1,
      isAlive,
    });

    vi.advanceTimersByTime(10);
    expect(isAlive).toHaveBeenCalledTimes(1);
    handle.stop();
    vi.advanceTimersByTime(100);
    expect(isAlive).toHaveBeenCalledTimes(1);
  });
});
