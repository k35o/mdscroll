import { describe, expect, it } from 'vitest';
import { assertValidInstanceName, isValidInstanceName } from './instance-name.js';

describe('isValidInstanceName', () => {
  it('accepts simple alphanumeric names', () => {
    expect(isValidInstanceName('default')).toBe(true);
    expect(isValidInstanceName('plan')).toBe(true);
    expect(isValidInstanceName('review-2')).toBe(true);
    expect(isValidInstanceName('a_b.c')).toBe(true);
    expect(isValidInstanceName('0')).toBe(true);
  });

  it('rejects empty and overly long names', () => {
    expect(isValidInstanceName('')).toBe(false);
    expect(isValidInstanceName('a'.repeat(65))).toBe(false);
  });

  it('rejects path separators', () => {
    expect(isValidInstanceName('../evil')).toBe(false);
    expect(isValidInstanceName('/tmp/pwn')).toBe(false);
    expect(isValidInstanceName('a/b')).toBe(false);
    expect(isValidInstanceName('a\\b')).toBe(false);
  });

  it('rejects leading dot or dash', () => {
    expect(isValidInstanceName('.hidden')).toBe(false);
    expect(isValidInstanceName('-dash')).toBe(false);
  });

  it('rejects plain dot / double dot', () => {
    expect(isValidInstanceName('.')).toBe(false);
    expect(isValidInstanceName('..')).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isValidInstanceName(null)).toBe(false);
    expect(isValidInstanceName(undefined)).toBe(false);
    expect(isValidInstanceName(42)).toBe(false);
  });
});

describe('assertValidInstanceName', () => {
  it('returns the value when it is valid', () => {
    expect(assertValidInstanceName('plan')).toBe('plan');
  });

  it('throws a clear error for invalid values', () => {
    expect(() => assertValidInstanceName('../evil')).toThrow(/invalid --name/);
    expect(() => assertValidInstanceName('/tmp/pwn')).toThrow(/invalid --name/);
    expect(() => assertValidInstanceName('')).toThrow(/invalid --name/);
  });
});
