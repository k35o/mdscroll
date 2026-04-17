import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ingestContent } from './run.js';
import { UNTITLED } from './source.js';
import { Store } from './store/state.js';

type FakeStdin = Readable & { isTTY?: boolean };

const fakeStdin = (content: string | null): FakeStdin => {
  if (content === null) {
    const stream = Readable.from([]) as FakeStdin;
    stream.isTTY = true;
    return stream;
  }
  const stream = Readable.from([content]) as FakeStdin;
  stream.isTTY = false;
  return stream;
};

describe('ingestContent', () => {
  describe('file mode', () => {
    let dir: string;
    let file: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'mdscroll-run-'));
      file = join(dir, 'plan.md');
      writeFileSync(file, '# from file');
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('loads the file into the store and returns a stop function', async () => {
      const store = new Store();
      const result = await ingestContent({ file }, store);
      expect(result.kind).toBe('ready');
      expect(store.current()?.markdown).toBe('# from file');
      if (result.kind === 'ready') result.stop();
    });

    it('uses the cwd-relative path as the source label', async () => {
      const store = new Store();
      const result = await ingestContent({ file }, store);
      expect(store.current()?.source).toContain('plan.md');
      if (result.kind === 'ready') result.stop();
    });

    it('returns an error result when the file does not exist', async () => {
      const store = new Store();
      const result = await ingestContent({ file: join(dir, 'missing.md') }, store);
      expect(result.kind).toBe('error');
      expect(store.current()).toBeNull();
    });
  });

  describe('stdin mode', () => {
    it('reads stdin once and derives the label from the first H1', async () => {
      const store = new Store();
      const result = await ingestContent({ stdin: fakeStdin('# Piped Title\n\nbody') }, store);
      expect(result.kind).toBe('ready');
      expect(store.current()?.markdown).toBe('# Piped Title\n\nbody');
      expect(store.current()?.source).toBe('Piped Title');
    });

    it('falls back to UNTITLED when there is no H1', async () => {
      const store = new Store();
      await ingestContent({ stdin: fakeStdin('## only h2\n\nbody') }, store);
      expect(store.current()?.source).toBe(UNTITLED);
    });
  });

  describe('no-input mode', () => {
    it('returns no-input when stdin is a TTY and no file was given', async () => {
      const store = new Store();
      const result = await ingestContent({ stdin: fakeStdin(null) }, store);
      expect(result.kind).toBe('no-input');
      expect(store.current()).toBeNull();
    });
  });
});
