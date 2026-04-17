import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sourceFor } from './push.js';

describe('sourceFor', () => {
  let originalCwd: string;
  let dir: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    dir = await mkdtemp(join(tmpdir(), 'mdscroll-source-'));
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    await rm(dir, { recursive: true, force: true });
  });

  it('returns "stdin" when no file is given', () => {
    expect(sourceFor(undefined)).toBe('stdin');
  });

  it('returns the basename when the file is in cwd', () => {
    expect(sourceFor('README.md')).toBe('README.md');
  });

  it('strips ./ prefix to a plain filename', () => {
    expect(sourceFor('./README.md')).toBe('README.md');
  });

  it('preserves a relative subdirectory path', () => {
    expect(sourceFor('./packages/mdscroll/README.md')).toBe(
      join('packages', 'mdscroll', 'README.md'),
    );
  });

  it('uses ../ for files above cwd', () => {
    const above = join(dir, '..', 'sibling.md');
    expect(sourceFor(above)).toBe(relative(dir, above));
  });

  it('absolute path inside cwd becomes relative', () => {
    const absolute = join(dir, 'inside', 'doc.md');
    expect(sourceFor(absolute)).toBe(join('inside', 'doc.md'));
  });
});
