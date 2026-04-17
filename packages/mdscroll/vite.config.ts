import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: ['src/cli.ts'],
    format: 'esm',
    outDir: 'dist',
    platform: 'node',
  },
});
