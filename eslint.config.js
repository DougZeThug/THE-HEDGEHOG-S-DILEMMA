import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'test-output', 'scripts/**', 'tests/**/*.mjs', 'public'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      // An explicit `default` is the author's decision about the members it doesn't list.
      '@typescript-eslint/switch-exhaustiveness-check': ['error', { considerDefaultExhaustiveForUnions: true }],
      '@typescript-eslint/no-this-alias': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-useless-assignment': 'error',
      '@typescript-eslint/no-unused-expressions': ['error', { allowTernary: true, allowShortCircuit: true, allowTaggedTemplates: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-expressions': ['error', { allowTernary: true, allowShortCircuit: true, allowTaggedTemplates: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-useless-assignment': 'error',
    },
  },
  {
    // Drives the built page through its untyped `window.__hedgehog` debugging hook.
    files: ['tests/playtest/woodland-coda-walls.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
);
