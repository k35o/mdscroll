import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: {
    singleQuote: true,
    // CHANGELOG.md and .changeset/ (ledger.yaml etc.) are generated and owned
    // by pnpm's release management, so our formatting rules don't apply
    ignorePatterns: ['CHANGELOG.md', '.changeset'],
  },
  lint: {
    ignorePatterns: ['CHANGELOG.md', '.changeset'],
    options: {
      typeAware: true,
    },
  },
  staged: {
    '*.{js,ts,cjs,mjs,jsx,tsx,json,jsonc}': 'vp check --fix',
  },
});
