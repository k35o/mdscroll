import { mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchFile, type WatchHandle } from './watch.js';

const waitFor = async (predicate: () => boolean, timeoutMs = 2000): Promise<void> => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor: timed out');
    }
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe('watchFile', () => {
  let dir: string;
  let file: string;
  let handle: WatchHandle | null = null;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mdscroll-watch-'));
    file = join(dir, 'plan.md');
    writeFileSync(file, '# v1');
  });

  afterEach(() => {
    handle?.close();
    handle = null;
    rmSync(dir, { recursive: true, force: true });
  });

  it('invokes onChange after the file is rewritten', async () => {
    const onChange = vi.fn();
    handle = watchFile(file, onChange);
    // fs.watch registration is asynchronous on macOS; let the kernel
    // attach the FSEvents listener before we fire the triggering write.
    await new Promise((r) => setTimeout(r, 100));

    writeFileSync(file, '# v2');

    await waitFor(() => onChange.mock.calls.length > 0);
    expect(onChange).toHaveBeenCalled();
  });

  it('survives write-to-temp + rename (editor swap-save style)', async () => {
    const onChange = vi.fn();
    handle = watchFile(file, onChange);
    await new Promise((r) => setTimeout(r, 100));

    const temp = join(dir, 'plan.md.swp');
    writeFileSync(temp, '# v2');
    renameSync(temp, file);

    await waitFor(() => onChange.mock.calls.length > 0);
    expect(onChange).toHaveBeenCalled();
  });

  it('stops firing after close() is called', async () => {
    const onChange = vi.fn();
    handle = watchFile(file, onChange);
    handle.close();
    handle = null;

    writeFileSync(file, '# v2');
    await new Promise((r) => setTimeout(r, 200));
    expect(onChange).not.toHaveBeenCalled();
  });
});
