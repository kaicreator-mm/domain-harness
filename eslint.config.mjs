import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Semantic lint layer (issue #165). Scope policy:
// - type-aware rules (floating promises, promise misuse) run on the four
//   packages' production src, where each package tsconfig provides the
//   program; the portable core's v0.2 production graph is fully covered.
//   NOTE: type-aware linting resolves cross-workspace imports through built
//   dist/*.d.ts - run `npm run build` before `npm run lint` on a fresh
//   checkout (Woodpecker verify does).
// - the frozen v0.1 legacy directories inside the core package get reduced
//   rules (regression evidence, deliberately not modernized).
// - tests/scripts get the non-type-aware recommended sets.
// The bespoke whitespace + portable-core import-boundary checks remain in
// scripts/lint.mjs and run alongside this config.
const nodeGlobals = {
  console: 'readonly',
  process: 'readonly',
  Buffer: 'readonly',
  URL: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  globalThis: 'readonly',
  fetch: 'readonly',
  require: 'readonly',
  module: 'writable',
  __dirname: 'readonly',
  __filename: 'readonly',
};

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-legacy-test/**',
      '**/node_modules/**',
      '**/generated/**',
      '**/android/**',
      '**/ios/**',
      '**/.expo/**',
      '**/coverage/**',
      '.claude/**',
      'examples/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Intentional discard convention across the repo: `_`-prefixed bindings.
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // Plain JS tooling files need Node globals (no-undef has no TS program).
    files: ['**/*.mjs', '**/*.cjs', 'scripts/**/*.js'],
    languageOptions: {
      globals: nodeGlobals,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Type-aware rules on production sources only.
    files: [
      'packages/domain-harness/src/**/*.ts',
      'packages/domain-harness-node/src/**/*.ts',
      'packages/domain-harness-expo/src/**/*.ts',
      'packages/domain-harness-compiler/src/**/*.ts',
    ],
    ignores: [
      // Frozen v0.1 regression evidence inside the core package.
      'packages/domain-harness/src/loader/**',
      'packages/domain-harness/src/compiler/**',
      'packages/domain-harness/src/runner/**',
      'packages/domain-harness/src/persistence/**',
      'packages/domain-harness/src/recovery/**',
      'packages/domain-harness/src/public/**',
      'packages/domain-harness/src/legacy-v1/**',
      'packages/domain-harness/src/script/**',
      'packages/domain-harness/src/engine/run-coordinator.ts',
    ],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-fallthrough': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      // tsc's noUnusedLocals/noUnusedParameters already own this deterministically.
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      // Store adapters wrap synchronous drivers (better-sqlite3) in the async
      // RuntimeStore contract by design; require-await would force churn with
      // zero safety gain.
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    // Reduced rules for the frozen v0.1 legacy graph (kept compilable and
    // whitespace-clean, deliberately not modernized).
    files: [
      'packages/domain-harness/src/loader/**/*.ts',
      'packages/domain-harness/src/compiler/**/*.ts',
      'packages/domain-harness/src/runner/**/*.ts',
      'packages/domain-harness/src/persistence/**/*.ts',
      'packages/domain-harness/src/recovery/**/*.ts',
      'packages/domain-harness/src/public/**/*.ts',
      'packages/domain-harness/src/legacy-v1/**/*.ts',
      'packages/domain-harness/src/script/**/*.ts',
      'packages/domain-harness/src/engine/run-coordinator.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'preserve-caught-error': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    // Tests: non-type-aware recommended only; pragmatic relaxations.
    files: ['**/tests/**/*.ts', 'tests/**/*.mjs'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
