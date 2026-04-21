import { defaultExclude, defineConfig } from 'vitest/config';

/**
 * E2E-only config: includes the excluded e2e.test.ts by omitting it from
 * `exclude`. Invoked via `pnpm test:e2e`, which also builds the CLI first.
 */
export default defineConfig({
  test: {
    include: ['src/e2e.test.ts'],
    exclude: defaultExclude,
    // One scenario waits 5s for the liveness GC tick; raise the per-test cap.
    testTimeout: 30_000,
  },
});
