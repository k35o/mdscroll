import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_SKILL_NAME, SKILL_FILENAME, SKILL_MD } from './skill.js';

export type InstallSkillOptions = {
  dir?: string | undefined;
  name?: string | undefined;
};

const defaultDir = (): string => join(homedir(), '.claude', 'skills');

export const resolveSkillPath = (opts: InstallSkillOptions = {}): string => {
  const dir = opts.dir ?? defaultDir();
  const name = opts.name ?? DEFAULT_SKILL_NAME;
  return join(dir, name, SKILL_FILENAME);
};

export const installSkill = async (opts: InstallSkillOptions = {}): Promise<string> => {
  const target = resolveSkillPath(opts);
  await mkdir(join(target, '..'), { recursive: true });
  await writeFile(target, SKILL_MD, 'utf-8');
  return target;
};

export const runInstallSkill = async (opts: InstallSkillOptions): Promise<void> => {
  const target = await installSkill(opts);
  process.stdout.write(`mdscroll: skill installed at ${target}\n`);
};
