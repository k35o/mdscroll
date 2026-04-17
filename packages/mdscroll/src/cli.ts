#!/usr/bin/env node
import { Command } from 'commander';
import { runInstallSkill } from './commands/install-skill.js';
import { runPush } from './commands/push.js';
import { runStart } from './commands/start.js';

type StartCliOptions = {
  port: string;
  host: string;
  open: boolean;
};

type PushCliOptions = {
  port: string;
  host: string;
};

type InstallSkillCliOptions = {
  dir?: string;
  name?: string;
};

const program = new Command();

program
  .name('mdscroll')
  .description('Push markdown content to a local browser preview, instantly.')
  .version('0.1.0');

program
  .command('start', { isDefault: true })
  .description('Start the local preview server and open the browser')
  .option('-p, --port <port>', 'Port to listen on', '4977')
  .option('-h, --host <host>', 'Host to bind to', '127.0.0.1')
  .option('--no-open', 'Do not open the browser automatically')
  .action(async (opts: StartCliOptions) => {
    await runStart({
      port: Number(opts.port),
      host: opts.host,
      open: opts.open,
    });
  });

program
  .command('push [file]')
  .description('Push markdown content to the running server (file path or stdin)')
  .option('-p, --port <port>', 'Port', '4977')
  .option('-h, --host <host>', 'Host', '127.0.0.1')
  .action(async (file: string | undefined, opts: PushCliOptions) => {
    await runPush({
      file,
      port: Number(opts.port),
      host: opts.host,
    });
  });

program
  .command('install-skill')
  .description('Install the mdscroll Claude Code skill to ~/.claude/skills/')
  .option('--dir <dir>', 'Install directory (default: ~/.claude/skills)')
  .option('--name <name>', 'Skill directory name (default: mdscroll)')
  .action(async (opts: InstallSkillCliOptions) => {
    await runInstallSkill({
      dir: opts.dir,
      name: opts.name,
    });
  });

await program.parseAsync();
