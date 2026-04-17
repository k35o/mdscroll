import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installSkill, resolveSkillPath } from './install-skill.js';
import { SKILL_MD } from './skill.js';

describe('install-skill', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mdscroll-skill-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe('resolveSkillPath', () => {
    it('defaults to <dir>/mdscroll/SKILL.md', () => {
      const path = resolveSkillPath({ dir });
      expect(path).toBe(join(dir, 'mdscroll', 'SKILL.md'));
    });

    it('uses --name to change the leaf directory', () => {
      const path = resolveSkillPath({ dir, name: 'show-plan' });
      expect(path).toBe(join(dir, 'show-plan', 'SKILL.md'));
    });
  });

  describe('installSkill', () => {
    it('writes SKILL_MD to the target file', async () => {
      const target = await installSkill({ dir });
      const written = await readFile(target, 'utf-8');
      expect(written).toBe(SKILL_MD);
    });

    it('creates parent directories when they are missing', async () => {
      const nested = join(dir, 'a', 'b', 'c');
      const target = await installSkill({ dir: nested });
      const written = await readFile(target, 'utf-8');
      expect(written).toBe(SKILL_MD);
    });

    it('overwrites an existing file', async () => {
      await installSkill({ dir });
      const target = await installSkill({ dir });
      const written = await readFile(target, 'utf-8');
      expect(written).toBe(SKILL_MD);
    });

    it('returns the installation path', async () => {
      const target = await installSkill({ dir, name: 'custom' });
      expect(target).toBe(join(dir, 'custom', 'SKILL.md'));
    });
  });

  describe('SKILL_MD', () => {
    it('starts with frontmatter ---', () => {
      expect(SKILL_MD.startsWith('---\n')).toBe(true);
    });

    it('includes a name field', () => {
      expect(SKILL_MD).toMatch(/^name: /m);
    });

    it('includes a description field', () => {
      expect(SKILL_MD).toMatch(/^description: /m);
    });

    it('documents the mdscroll push command', () => {
      expect(SKILL_MD).toContain('mdscroll push');
    });
  });
});
