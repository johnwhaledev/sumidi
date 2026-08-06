// Configurazione ESLint minima per suMidi (flat config, ESLint 9+).
// Copre i moduli in src/ (Bass/Guitar/Piano/Drums/...) e i test.
// src/main.js (script UI, estratto da index.html nella sessione R2 —
// PLAN35) resta fuori da questa prima passata di lint, come lo era
// quando era inline nell'HTML: usa pattern browser
// (assegnazioni su `window.xxx = ...` richiamate come riferimento globale
// bare) che il parser "module" di ESLint segnala come falsi no-undef.
// Restano comunque coperti dal controllo sintattico `node --check` e da
// uno smoke test nel browser eseguiti ad ogni sessione di modifica.
// design/DesignSystem.js resta escluso allo stesso modo (componenti SVG
// generati, non ancora passati al lint in questa prima fase).

export default [
  {
    ignores: [
      'node_modules/**',
      'img/**',
      'PLAN/**',
      'docs/**',
      'design/**',
      '*.html',
      'src/main.js',
    ],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Browser (usato dai generator solo indirettamente, es. per costanti condivise)
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        performance: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        // Node (per gli script di test)
        process: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-const-assign': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-unreachable': 'warn',
      'no-fallthrough': 'warn',
      eqeqeq: ['warn', 'smart'],
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
      },
    },
  },
];
