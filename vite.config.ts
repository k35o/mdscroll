import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: {
    singleQuote: true,
  },
  lint: {
    options: {
      typeAware: true,
    },
  },
  staged: {
    '*.{js,ts,cjs,mjs,jsx,tsx,json,jsonc}': 'vp check --fix',
  },
});
