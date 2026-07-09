import type { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildProgram } from './cli.js';

// Pure-parse tests: actions that would reach the network are replaced
// with recorders before parseAsync. The --name guard tests keep the real
// action because the guard raises before any runner is invoked.

type Output = { out: string; err: string };

const testProgram = (): { program: Command; output: Output } => {
  const program = buildProgram();
  const output: Output = { out: '', err: '' };
  const silence = (cmd: Command): void => {
    cmd.exitOverride();
    cmd.configureOutput({
      writeOut: (str) => {
        output.out += str;
      },
      writeErr: (str) => {
        output.err += str;
      },
    });
    // exitOverride/configureOutput are inherited only at .command() time,
    // which has already happened inside buildProgram — apply explicitly.
    for (const sub of cmd.commands) silence(sub);
  };
  silence(program);
  return { program, output };
};

const subcommand = (program: Command, name: string): Command => {
  const found = program.commands.find((cmd) => cmd.name() === name);
  if (!found) throw new Error(`missing subcommand: ${name}`);
  return found;
};

let savedPortEnv: string | undefined;

beforeEach(() => {
  savedPortEnv = process.env.MDSCROLL_PORT;
  delete process.env.MDSCROLL_PORT;
});

afterEach(() => {
  if (savedPortEnv === undefined) delete process.env.MDSCROLL_PORT;
  else process.env.MDSCROLL_PORT = savedPortEnv;
});

describe('--port parsing', () => {
  it.each(['abc', '0', '70000'])('rejects --port %s before any action runs', async (raw) => {
    const { program, output } = testProgram();
    let ran = false;
    program.action(() => {
      ran = true;
    });

    await expect(program.parseAsync(['--port', raw], { from: 'user' })).rejects.toMatchObject({
      code: 'commander.invalidArgument',
    });

    expect(ran).toBe(false);
    expect(output.err).toContain('port must be an integer between 1 and 65535');
  });

  it('passes a valid --port to the action as a number', async () => {
    const { program } = testProgram();
    let seen: { file?: string | undefined; port?: number } = {};
    program.action((file: string | undefined, opts: { port: number }) => {
      seen = { file, port: opts.port };
    });

    await program.parseAsync(['--port', '5001', 'plan.md'], { from: 'user' });

    expect(seen).toEqual({ file: 'plan.md', port: 5001 });
  });

  it('defaults the port to 4977 when neither flag nor env is set', async () => {
    const { program } = testProgram();
    let seenPort: number | undefined;
    program.action((_file: string | undefined, opts: { port: number }) => {
      seenPort = opts.port;
    });

    await program.parseAsync(['plan.md'], { from: 'user' });

    expect(seenPort).toBe(4977);
  });

  it('reads the port from MDSCROLL_PORT through the same parser', async () => {
    process.env.MDSCROLL_PORT = '5999';
    const { program } = testProgram();
    let seenPort: number | undefined;
    program.action((_file: string | undefined, opts: { port: number }) => {
      seenPort = opts.port;
    });

    await program.parseAsync(['plan.md'], { from: 'user' });

    expect(seenPort).toBe(5999);
  });

  it('rejects an invalid --port given after a subcommand name', async () => {
    const { program, output } = testProgram();
    subcommand(program, 'ls').action(() => {});

    await expect(program.parseAsync(['ls', '-p', 'abc'], { from: 'user' })).rejects.toMatchObject({
      code: 'commander.invalidArgument',
    });

    expect(output.err).toContain('port must be an integer between 1 and 65535');
  });
});

describe('help', () => {
  it('treats -h as help, not a host flag', async () => {
    const { program, output } = testProgram();

    await expect(program.parseAsync(['-h'], { from: 'user' })).rejects.toMatchObject({
      code: 'commander.helpDisplayed',
      exitCode: 0,
    });

    expect(output.out).toContain('Usage: mdscroll');
    expect(output.out).not.toContain('--host');
  });
});

describe('--name guard', () => {
  it('errors when --name is combined with a file argument', async () => {
    const { program, output } = testProgram();

    await expect(
      program.parseAsync(['plan.md', '--name', 'notes'], { from: 'user' }),
    ).rejects.toMatchObject({ code: 'commander.error' });

    expect(output.err).toContain('--name applies to piped stdin only');
  });

  it('errors when push gets both a file and --name', async () => {
    const { program, output } = testProgram();

    await expect(
      program.parseAsync(['push', 'plan.md', '--name', 'notes'], { from: 'user' }),
    ).rejects.toMatchObject({ code: 'commander.error' });

    expect(output.err).toContain('--name applies to piped stdin only');
  });
});

describe('positional options', () => {
  it('routes flags written after a subcommand name to that subcommand', async () => {
    const { program } = testProgram();
    let seen: { port?: number; json?: boolean } = {};
    subcommand(program, 'ls').action((opts: { port: number; json?: boolean }) => {
      seen = { port: opts.port, json: opts.json };
    });

    await program.parseAsync(['ls', '-p', '5002', '--json'], { from: 'user' });

    expect(seen).toEqual({ port: 5002, json: true });
  });
});
