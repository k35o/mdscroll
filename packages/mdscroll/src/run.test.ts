import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadSource } from './run.js';
import { UNTITLED } from './source.js';

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

describe('loadSource', () => {
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

    it('loads the file as the initial payload', async () => {
      const result = await loadSource({ file });
      expect(result.kind).toBe('ready');
      if (result.kind !== 'ready') return;
      expect(result.feed.initial.markdown).toBe('# from file');
    });

    it('uses the cwd-relative path as the source label', async () => {
      const result = await loadSource({ file });
      if (result.kind !== 'ready') throw new Error('expected ready');
      expect(result.feed.initial.source).toContain('plan.md');
    });

    it('returns an error result when the file does not exist', async () => {
      const result = await loadSource({ file: join(dir, 'missing.md') });
      expect(result.kind).toBe('error');
    });
  });

  describe('stdin mode', () => {
    it('reads stdin once and derives the label from the first H1', async () => {
      const result = await loadSource({
        stdin: fakeStdin('# Piped Title\n\nbody'),
      });
      expect(result.kind).toBe('ready');
      if (result.kind !== 'ready') return;
      expect(result.feed.initial.markdown).toBe('# Piped Title\n\nbody');
      expect(result.feed.initial.source).toBe('Piped Title');
    });

    it('falls back to UNTITLED when there is no H1', async () => {
      const result = await loadSource({
        stdin: fakeStdin('## only h2\n\nbody'),
      });
      if (result.kind !== 'ready') throw new Error('expected ready');
      expect(result.feed.initial.source).toBe(UNTITLED);
    });

    it('attach() returns a no-op close for stdin', async () => {
      const result = await loadSource({ stdin: fakeStdin('# t') });
      if (result.kind !== 'ready') throw new Error('expected ready');
      const handle = result.feed.attach(() => undefined);
      expect(typeof handle.close).toBe('function');
      handle.close();
    });
  });

  describe('no-input mode', () => {
    it('returns no-input when stdin is a TTY and no file was given', async () => {
      const result = await loadSource({ stdin: fakeStdin(null) });
      expect(result.kind).toBe('no-input');
    });
  });
});
