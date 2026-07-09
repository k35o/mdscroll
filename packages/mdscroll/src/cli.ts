#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Command, InvalidArgumentError, Option } from 'commander';
import { DEFAULT_PORT } from './constants.js';
import { runDefault, runLs, runPush, runRm, runServe } from './run.js';

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf-8'),
) as { version: string };

const parsePort = (raw: string): number => {
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new InvalidArgumentError('port must be an integer between 1 and 65535.');
  }
  return port;
};

const portOption = () =>
  new Option('-p, --port <port>', 'target port')
    .env('MDSCROLL_PORT')
    .default(DEFAULT_PORT)
    .argParser(parsePort);

const jsonOption = () => new Option('--json', 'print one line of JSON instead of human output');

type CommonFlags = { port: number; json?: boolean };

export const buildProgram = (): Command => {
  const program = new Command();

  program
    .name('mdscroll')
    // The default command and every subcommand define their own -p/--json.
    // Without positional options, the program-level definitions would
    // swallow flags written after a subcommand name (`ls -p 5000`).
    .enablePositionalOptions()
    .description(
      'Preview markdown in a local browser. One long-lived server per session hosts a tab strip; every other invocation pushes a document and exits. Docs are keyed by file path (or --name for stdin), so re-running the same doc replaces its tab.',
    )
    .version(pkg.version);

  program
    .argument('[file]', 'markdown file to preview (watched by the server)')
    .option('--name <key>', 'doc key for piped stdin (default: untitled)')
    .addOption(portOption())
    .addOption(jsonOption())
    .action(async (file: string | undefined, opts: CommonFlags & { name?: string }) => {
      if (file !== undefined && opts.name !== undefined) {
        program.error('mdscroll: --name applies to piped stdin only; file docs are keyed by path');
      }
      await runDefault({
        file,
        name: opts.name,
        port: opts.port,
        json: opts.json ?? false,
        version: pkg.version,
      });
    });

  program
    .command('serve')
    .description('start the session server (success when one is already running)')
    .addOption(portOption())
    .addOption(jsonOption())
    .action(async (opts: CommonFlags) => {
      await runServe({ port: opts.port, json: opts.json ?? false, version: pkg.version });
    });

  program
    .command('push [file]')
    .description('push a doc to a running server; never becomes the server (exit 2 when none)')
    .option('--name <key>', 'doc key for piped stdin (default: untitled)')
    .addOption(portOption())
    .addOption(jsonOption())
    .action(async (file: string | undefined, opts: CommonFlags & { name?: string }) => {
      if (file !== undefined && opts.name !== undefined) {
        program.error('mdscroll: --name applies to piped stdin only; file docs are keyed by path');
      }
      await runPush({
        file,
        name: opts.name,
        port: opts.port,
        json: opts.json ?? false,
        version: pkg.version,
      });
    });

  program
    .command('rm <doc>')
    .description('remove a doc by file path or name')
    .addOption(portOption())
    .addOption(jsonOption())
    .action(async (doc: string, opts: CommonFlags) => {
      await runRm({ target: doc, port: opts.port, json: opts.json ?? false, version: pkg.version });
    });

  program
    .command('ls')
    .description('list docs on the server (exit 2 when no server is running)')
    .addOption(portOption())
    .addOption(jsonOption())
    .action(async (opts: CommonFlags) => {
      await runLs({ port: opts.port, json: opts.json ?? false, version: pkg.version });
    });

  return program;
};

export const main = async (argv?: readonly string[]): Promise<void> => {
  const program = buildProgram();
  try {
    await program.parseAsync(argv ? ['node', 'mdscroll', ...argv] : process.argv);
  } catch (err) {
    // Runners report their own failures; anything that escapes to here
    // still gets a one-line message, never a stack trace.
    process.stderr.write(`mdscroll: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
};

/**
 * Run the CLI only when this file is the executed entry point. Importing
 * the module (tests, accidental library use) must never parse argv or
 * touch the network. realpath both sides: package managers execute bins
 * through symlinks.
 */
const isDirectRun = (): boolean => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};

if (isDirectRun()) {
  await main();
}
