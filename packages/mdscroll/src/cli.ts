#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Command, Option } from 'commander';
import { runList } from './commands/list.js';
import { runPush } from './commands/push.js';
import { runStart } from './commands/start.js';
import { runStop } from './commands/stop.js';
import { DEFAULT_HOST, DEFAULT_INSTANCE_NAME, DEFAULT_PORT } from './constants.js';

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf-8'),
) as { version: string };

type NetOptions = {
  name: string;
  port: string;
  host: string;
};

type NameOption = {
  name: string;
};

const nameOption = () =>
  new Option('-n, --name <name>', 'Instance name').default(DEFAULT_INSTANCE_NAME);
const portOption = () =>
  new Option('-p, --port <port>', 'Port to listen on').default(String(DEFAULT_PORT));
const hostOption = () => new Option('-h, --host <host>', 'Host to bind to').default(DEFAULT_HOST);

const program = new Command();

program
  .name('mdscroll')
  .description('Push markdown content to a local browser preview, instantly.')
  .version(pkg.version);

program
  .command('start', { isDefault: true })
  .description(
    'Start the local preview server and print its URL. With a file argument, behaves exactly like `mdscroll push <file>`.',
  )
  .argument('[file]', 'Markdown file to push (alias for `mdscroll push <file>`)')
  .addOption(nameOption())
  .addOption(portOption())
  .addOption(hostOption())
  .action(async (file: string | undefined, opts: NetOptions) => {
    if (file) {
      await runPush({
        name: opts.name,
        file,
        port: Number(opts.port),
        host: opts.host,
      });
      return;
    }
    await runStart({
      name: opts.name,
      port: Number(opts.port),
      host: opts.host,
    });
  });

program
  .command('push [file]')
  .description('Push markdown content to the running server (file path or stdin)')
  .addOption(nameOption())
  .addOption(portOption())
  .addOption(hostOption())
  .action(async (file: string | undefined, opts: NetOptions) => {
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
  .addOption(nameOption())
  .action(async (opts: NameOption) => {
    await runStop({ name: opts.name });
  });

program
  .command('list')
  .description('List all running mdscroll instances')
  .action(async () => {
    await runList();
  });

await program.parseAsync();
