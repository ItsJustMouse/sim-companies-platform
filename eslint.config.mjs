import coreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * Flat ESLint configuration.
 *
 * `eslint-config-next` ships native flat configs, so they are spread directly
 * rather than going through the `FlatCompat` shim, which cannot serialise the
 * plugin graph these configs contain.
 */
const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'drizzle/**', 'coverage/**', 'next-env.d.ts', 'public/**'],
  },
  ...coreWebVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      // console.warn/error are the logger's transport; anything else is a stray debug.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    // Scripts run outside the app and legitimately write to stdout.
    files: ['scripts/**/*.ts', 'src/worker/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
];

export default config;
