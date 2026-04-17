#!/usr/bin/env node
import { Command } from 'commander';
import { runList } from './commands/list.js';
import { runPush } from './commands/push.js';
import { runStart } from './commands/start.js';
import { runStop } from './commands/stop.js';
import { DEFAULT_HOST, DEFAULT_INSTANCE_NAME, DEFAULT_PORT } from './constants.js';

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

const program = new Command();

program
  .name('mdscroll')
  .description('Push markdown content to a local browser preview, instantly.')
  .version('0.1.0');

program
  .command('start', { isDefault: true })
  .description(
    'Start the local preview server and print its URL. With a file argument, behaves exactly like `mdscroll push <file>`.',
  )
  .argument('[file]', 'Markdown file to push (alias for `mdscroll push <file>`)')
  .option(
    '-n, --name <name>',
    'Instance name (multiple instances are isolated)',
    DEFAULT_INSTANCE_NAME,
  )
  .option('-p, --port <port>', 'Port to listen on', String(DEFAULT_PORT))
  .option('-h, --host <host>', 'Host to bind to', DEFAULT_HOST)
  .action(async (file: string | undefined, opts: StartCliOptions) => {
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
  .option('-n, --name <name>', 'Instance name', DEFAULT_INSTANCE_NAME)
  .option('-p, --port <port>', 'Port', String(DEFAULT_PORT))
  .option('-h, --host <host>', 'Host', DEFAULT_HOST)
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
  .option('-n, --name <name>', 'Instance name', DEFAULT_INSTANCE_NAME)
  .action(async (opts: StopCliOptions) => {
    await runStop({ name: opts.name });
  });

program
  .command('list')
  .description('List all running mdscroll instances')
  .action(async () => {
    await runList();
  });

await program.parseAsync();
