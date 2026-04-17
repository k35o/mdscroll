import { type InstallSkillOptions, installSkill } from '../skill.js';

export const runInstallSkill = async (opts: InstallSkillOptions): Promise<void> => {
  const target = await installSkill(opts);
  process.stdout.write(`mdscroll: skill installed at ${target}\n`);
};
