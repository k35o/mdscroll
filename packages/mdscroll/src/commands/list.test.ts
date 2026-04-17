import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeLock } from '../store/lockfile.js';
import { runList } from './list.js';

describe('runList', () => {
  let dir: string;
  let captured: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mdscroll-list-'));
    captured = '';
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
      captured += String(chunk);
      return true;
    }) as typeof process.stdout.write);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it('reports when no instances are running', async () => {
    await runList({ dir });
    expect(captured).toContain('no instances running');
  });

  it('lists every alive instance with name, pid, and url', async () => {
    await writeLock(
      {
        name: 'plan',
        pid: process.pid,
        port: 5001,
        host: '127.0.0.1',
        startedAt: Date.now(),
        identity: 'test-identity',
      },
      dir,
    );
    await writeLock(
      {
        name: 'review',
        pid: process.pid,
        port: 5002,
        host: '127.0.0.1',
        startedAt: Date.now(),
        identity: 'test-identity',
      },
      dir,
    );

    await runList({ dir });

    expect(captured).toContain('plan');
    expect(captured).toContain('review');
    expect(captured).toContain('http://127.0.0.1:5001');
    expect(captured).toContain('http://127.0.0.1:5002');
  });

  it('omits dead instances', async () => {
    await writeLock(
      {
        name: 'alive',
        pid: process.pid,
        port: 5001,
        host: '127.0.0.1',
        startedAt: Date.now(),
        identity: 'test-identity',
      },
      dir,
    );
    await writeLock(
      {
        name: 'dead',
        pid: 999999,
        port: 5002,
        host: '127.0.0.1',
        startedAt: Date.now(),
        identity: 'test-identity',
      },
      dir,
    );

    await runList({ dir });

    expect(captured).toContain('alive');
    expect(captured).not.toContain('dead');
  });
});
