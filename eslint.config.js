// Configurazione ESLint minima per suMidi (flat config, ESLint 9+).
// Copre i moduli in src/ e i test.
//
// main.js, SongEngine.js e Session.js erano ESCLUSI del tutto (`ignores`)
// perché usano il pattern browser `window.xxx = ...` richiamato altrove come
// riferimento globale bare, che con sourceType "module" produce una valanga di
// falsi no-undef. L'esclusione però non spegneva una regola: impediva a ESLint
// di aprire i file, quindi nemmeno di verificarne la SINTASSI — 3.200 righe,
// le tre unità più grandi del progetto, fuori da ogni controllo. Il commento
// diceva che restavano "coperti da `node --check` e da uno smoke test nel
// browser ad ogni sessione": una promessa manuale che nessuno eseguiva, e che
// durante B4 di PLAN37 ha lasciato passare un apostrofo non chiuso in
// Session.js con `npm run lint` verde. Con la CI di S2 quello sarebbe stato un
// deploy rotto su Pages con la spunta verde.
// Ora i tre file sono linted come gli altri, con il solo no-undef spento.
// design/DesignSystem.js resta escluso (componenti SVG generati).

export default [
  {
    ignores: [
      'node_modules/**',
      'img/**',
      'PLAN/**',
      'docs/**',
      'design/**',
      '*.html',
      // T2 di PLAN37: roba di terzi entrata nel repository per non dipendere
      // piu' da un CDN. Sono campioni audio in base64 e una libreria minificata,
      // non codice del progetto: linters e limiti di righe non li riguardano.
      'soundfonts/**',
      'vendor/**',
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
        setInterval: 'readonly',
        clearInterval: 'readonly',
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
    // I tre file di interfaccia: registrano gli handler come `window.smX = ...`
    // e li richiamano dagli attributi onclick dell'HTML, quindi ogni chiamata
    // fra un file e l'altro sembra un identificatore non dichiarato. Spento
    // solo no-undef: parsing e tutte le altre regole valgono come ovunque.
    files: ['src/main.js', 'src/SongEngine.js', 'src/Session.js'],
    rules: { 'no-undef': 'off' },
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
