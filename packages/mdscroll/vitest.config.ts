import { defaultExclude, defineConfig } from 'vitest/config';

/**
 * Default `pnpm test` excludes the E2E suite. E2E spawns the built CLI
 * as a subprocess and exercises real TCP + fs.watch, so it needs the
 * package to be built *and* a host shell (the sandbox blocks port bind
 * / file-watch handles). Run it explicitly with `pnpm test:e2e`.
 */
export default defineConfig({
  test: {
    exclude: [...defaultExclude, 'src/e2e.test.ts'],
  },
});
