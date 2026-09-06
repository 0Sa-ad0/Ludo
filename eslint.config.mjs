// Flat config. eslint-config-next v16 ships native flat configs, so no
// FlatCompat shim is needed (and using one crashes on this version).
import coreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/** Node globals for the plain-CommonJS half of the project. */
const nodeGlobals = {
  require: 'readonly',
  module: 'writable',
  exports: 'writable',
  process: 'readonly',
  console: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  globalThis: 'readonly',
};

const config = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },

  ...coreWebVitals,
  ...nextTypescript,

  {
    // server.js, game-logic.js and src/lib/rules.js are plain CommonJS run
    // directly by Node — they are deliberately not ES modules, because
    // server.js has to require the rules the React components import.
    files: [
      'server.js', 'game-logic.js', 'src/lib/rules.js',
      'jest.config.js', 'next.config.js', 'playwright.config.js',
    ],
    languageOptions: { sourceType: 'commonjs', globals: nodeGlobals },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  {
    files: ['tests/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...nodeGlobals,
        describe: 'readonly', test: 'readonly', expect: 'readonly',
        beforeAll: 'readonly', afterAll: 'readonly',
        beforeEach: 'readonly', afterEach: 'readonly',
      },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
];

export default config;
