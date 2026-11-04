import { defineConfig } from 'vitest/config';

const unitTests = ['__tests__/**/*.test.ts'];

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'engine', root: './packages/engine', include: unitTests } },
      { test: { name: 'catalog', root: './packages/catalog', include: unitTests } },
      { test: { name: 'labs', root: './packages/labs', include: unitTests } },
      { test: { name: 'golden', root: './tools/golden', include: unitTests } },
      { test: { name: 'infra', root: './infra', include: unitTests } },
      {
        extends: './apps/web/vite.config.ts',
        test: {
          name: 'web',
          root: './apps/web',
          environment: 'jsdom',
          include: ['__tests__/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
});
