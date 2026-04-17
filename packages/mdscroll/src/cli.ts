#!/usr/bin/env node
import { Command } from 'commander';
import { runInstallSkill } from './commands/install-skill.js';
import { runList } from './commands/list.js';
import { runPush } from './commands/push.js';
import { runStart } from './commands/start.js';
import { runStop } from './commands/stop.js';

type StartCliOptions = {
  name: string;
  port: string;
  host: string;
};

type PushCliOptions = {
  name: string;
  port: string;
  host: string;
};

type StopCliOptions = {
  name: string;
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
  .description(
    'Start the local preview server and print its URL. Optionally seed it with a markdown file.',
  )
  .argument('[file]', 'Markdown file to display immediately on startup')
  .option('-n, --name <name>', 'Instance name (multiple instances are isolated)', 'default')
  .option('-p, --port <port>', 'Port to listen on', '4977')
  .option('-h, --host <host>', 'Host to bind to', '127.0.0.1')
  .action(async (file: string | undefined, opts: StartCliOptions) => {
    await runStart({
      name: opts.name,
      file,
      port: Number(opts.port),
      host: opts.host,
    });
  });

program
  .command('push [file]')
  .description('Push markdown content to the running server (file path or stdin)')
  .option('-n, --name <name>', 'Instance name', 'default')
  .option('-p, --port <port>', 'Port', '4977')
  .option('-h, --host <host>', 'Host', '127.0.0.1')
  .action(async (file: string | undefined, opts: PushCliOptions) => {
    await runPush({
      name: opts.name,
      file,
      port: Number(opts.port),
      host: opts.host,
    });
  });

program
  .command('stop')
  .description('Stop a running server (sends SIGTERM via the lockfile pid)')
  .option('-n, --name <name>', 'Instance name', 'default')
  .action(async (opts: StopCliOptions) => {
    await runStop({ name: opts.name });
  });

program
  .command('list')
  .description('List all running mdscroll instances')
  .action(async () => {
    await runList();
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
