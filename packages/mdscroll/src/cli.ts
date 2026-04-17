#!/usr/bin/env node
import { Command } from 'commander';

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
  .action((opts: { port: string; host: string; open: boolean }) => {
    console.log('start (not implemented yet)', opts);
  });

program
  .command('push [file]')
  .description('Push markdown content to the running server (file or stdin)')
  .action((file: string | undefined) => {
    console.log('push (not implemented yet)', file);
  });

program.parse();
