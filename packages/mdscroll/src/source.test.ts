import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { displaySourceLabel, fileSourceLabel, stdinSourceLabel, UNTITLED } from './source.js';

describe('fileSourceLabel', () => {
  let dir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    dir = mkdtempSync(join(tmpdir(), 'mdscroll-source-'));
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns the bare filename for a file in cwd', () => {
    expect(fileSourceLabel('plan.md')).toBe('plan.md');
  });

  it('returns the cwd-relative path for a file in a subdirectory', () => {
    expect(fileSourceLabel('docs/plan.md')).toBe('docs/plan.md');
  });

  it('relativizes an absolute path under cwd', () => {
    expect(fileSourceLabel(resolve('docs/plan.md'))).toBe('docs/plan.md');
  });

  it('falls back to the basename when the path resolves exactly to cwd', () => {
    expect(fileSourceLabel('.')).toBe(dir.split('/').pop());
  });
});

describe('stdinSourceLabel', () => {
  it('uses the first H1 text as the label', () => {
    expect(stdinSourceLabel('# Project Plan\n\nbody')).toBe('Project Plan');
  });

  it('trims trailing whitespace from the H1 text', () => {
    expect(stdinSourceLabel('#   Spaced Out   ')).toBe('Spaced Out');
  });

  it('picks the first H1 even when preceded by other headings or content', () => {
    expect(stdinSourceLabel('## sub\n\nintro\n\n# Real Title')).toBe('Real Title');
  });

  it('falls back to UNTITLED when there is no H1', () => {
    expect(stdinSourceLabel('## no h1\n\nbody')).toBe(UNTITLED);
  });

  it('falls back to UNTITLED for empty input', () => {
    expect(stdinSourceLabel('')).toBe(UNTITLED);
  });

  it('does not treat ## or deeper headings as H1', () => {
    expect(stdinSourceLabel('## h2\n### h3')).toBe(UNTITLED);
  });
});

describe('displaySourceLabel', () => {
  it('returns the label unchanged when it is short enough', () => {
    expect(displaySourceLabel('plan.md')).toBe('plan.md');
  });

  it('prefixes a horizontal ellipsis and keeps the last 59 chars when too long', () => {
    const long = `${'a/'.repeat(50)}plan.md`;
    const out = displaySourceLabel(long);
    expect(out.startsWith('…')).toBe(true);
    expect(out.endsWith('plan.md')).toBe(true);
    expect(out.length).toBe(60);
  });

  it('never truncates a 60-character label', () => {
    const exact = 'x'.repeat(60);
    expect(displaySourceLabel(exact)).toBe(exact);
  });
});
