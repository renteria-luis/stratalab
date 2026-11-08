import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    '**/dist/',
    '**/coverage/',
    '**/playwright-report/',
    '**/test-results/',
    'docs/console-capture/',
    'packages/engine/__tests__/golden/fixtures/',
  ]),

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  // Web app: React rules
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },

  // Engine purity (AGENTS.md, architecture rule 2). Missing DOM and Node globals are
  // already type errors through packages/engine/tsconfig.json; these cover what TypeScript
  // cannot see: clock, randomness and UI or platform imports.
  {
    files: ['packages/engine/src/**/*.ts', 'packages/engine/golden/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react/*',
                'react-dom',
                'react-dom/*',
                'zustand',
                'zustand/*',
                '@xyflow/*',
                '@cloudscape-design/*',
                'idb-keyval',
                'node:*',
              ],
              message: 'The engine is pure: no UI, state, storage or Node imports.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'The engine is deterministic: no clock.' },
        {
          object: 'Math',
          property: 'random',
          message: 'The engine is deterministic: no randomness.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'The engine is deterministic: no clock.',
        },
      ],
    },
  },

  // Catalog data and search run in the browser: no Node imports (tests may use them).
  {
    files: ['packages/catalog/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['node:*'], message: 'packages/catalog/src runs in the browser: no Node.' },
          ],
        },
      ],
    },
  },

  // Golden tooling: unit tests never reach AWS. Only src/aws/sdk.ts may import the SDK, and
  // tests use hand-written fakes of the ports instead (docs/specs/p9-golden.md section 0).
  {
    files: ['tools/golden/__tests__/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@aws-sdk/*', '**/aws/sdk', '**/aws/sdk.ts'],
              message: 'Golden unit tests make no AWS calls: use the fakes in __tests__/fakes.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['tools/golden/src/**/*.ts'],
    ignores: ['tools/golden/src/aws/sdk.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@aws-sdk/*'],
              message: 'Only tools/golden/src/aws/sdk.ts talks to AWS (through the ports).',
            },
          ],
        },
      ],
    },
  },

  prettier,
);
