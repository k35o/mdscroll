#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Command, Option } from 'commander';
import { DEFAULT_HOST, DEFAULT_PORT } from './constants.js';
import { runMdscroll } from './run.js';

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf-8'),
) as { version: string };

const program = new Command();

program
  .name('mdscroll')
  .description(
    'Preview markdown in a local browser. Pass a file to auto-reload on change, or pipe markdown on stdin. When another mdscroll is already running on the same port, this process attaches to it and opens a new tab.',
  )
  .version(pkg.version)
  .argument('[file]', 'Markdown file to watch and serve')
  .addOption(new Option('-p, --port <port>', 'Port to listen on').default(String(DEFAULT_PORT)))
  .addOption(new Option('-h, --host <host>', 'Host to bind to').default(DEFAULT_HOST))
  .action(async (file: string | undefined, opts: { port: string; host: string }, cmd: Command) => {
    // Commander tracks whether each option came from a flag or the default.
    // We use that to change fallback behaviour: `--port` explicit means
    // "that port or bust" — no silent random-port rescue.
    const portSource = cmd.getOptionValueSource('port');
    await runMdscroll({
      file,
      port: Number(opts.port),
      portExplicit: portSource === 'cli' || portSource === 'env',
      host: opts.host,
      version: pkg.version,
    });
  });

await program.parseAsync();
