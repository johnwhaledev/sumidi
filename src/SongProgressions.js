/**
 * SongProgressions.js
 * ─────────────────────────────────────────────────────────────────
 * Progressioni di accordi per stile e tipo di sezione (pool + variante
 * di default per ciascuna combinazione). Estratto da SongArchitect.js
 * (sessione R1 — PLAN35).
 * ─────────────────────────────────────────────────────────────────
 */

// 2. CHORD PROGRESSIONS BY STYLE AND SECTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Roman numeral → semitone offset from root for each scale degree.
 * Used to resolve "I V vi IV" → actual chord names given a key.
 */
export const DIATONIC_DEGREES = {
  major: {
    'I':   { offset: 0,  quality: 'maj' },
    'II':  { offset: 2,  quality: 'min' },
    'ii':  { offset: 2,  quality: 'min' },
    'III': { offset: 4,  quality: 'min' },
    'iii': { offset: 4,  quality: 'min' },
    'IV':  { offset: 5,  quality: 'maj' },
    'V':   { offset: 7,  quality: 'maj' },
    'VI':  { offset: 9,  quality: 'min' },
    'vi':  { offset: 9,  quality: 'min' },
    'VII': { offset: 11, quality: 'dim' },
    'vii': { offset: 11, quality: 'dim' },
  },
  minor: {
    'i':   { offset: 0,  quality: 'min' },
    'I':   { offset: 0,  quality: 'min' },
    'II':  { offset: 2,  quality: 'dim' },
    'iio': { offset: 2,  quality: 'dim' },
    'III': { offset: 3,  quality: 'maj' },
    'bIII':{ offset: 3,  quality: 'maj' },
    'IV':  { offset: 5,  quality: 'min' },
    'iv':  { offset: 5,  quality: 'min' },
    'V':   { offset: 7,  quality: 'maj' },  // raised 7th in harmonic minor
    'v':   { offset: 7,  quality: 'min' },
    'VI':  { offset: 8,  quality: 'maj' },
    'bVI': { offset: 8,  quality: 'maj' },
    'VII': { offset: 10, quality: 'maj' },
    'bVII':{ offset: 10, quality: 'maj' },
  },
};

/**
 * PROGRESSION_POOLS
 * Key: "style_sectiontype" → array of candidate progressions.
 * buildSong() picks one per section using the seed RNG.
 * All progressions are in reference key Am (minor) or C (major).
 * The engine transposes to the target key automatically.
 *
 * Naming: chords in Am reference = root on A=9.
 * For major styles (folk, jazz, classical) reference root = C=0.
 *
 * Each pool should have 4–8 options to give meaningful variety.
 */
export const PROGRESSION_POOLS = {

  // ══════════════════════════════════════════════════════════════
  // MTV UNPLUGGED — reference key Am (minor feel)
  // ══════════════════════════════════════════════════════════════
  unplugged_intro: [
    ['Am', 'G', 'F', 'E'],            // dark descending
    ['Am', 'F', 'C', 'G'],            // standard
    ['Am', 'Am', 'F', 'G'],           // linger on tonic
    ['Dm', 'Am', 'G', 'Am'],          // iv start
    ['Am', 'G', 'F', 'G'],            // bVII loop
    ['Em', 'Am', 'F', 'C'],           // v-i motion
    ['Am', 'C', 'F', 'G'],           // simple open
    ['Am', 'Dm', 'Am', 'E'],         // iv pedal
    ['F', 'Am', 'G', 'Am'],          // VI i VII i
    ['C', 'G', 'Am', 'G'],           // III VII i VII
  ],
  unplugged_verse: [
    ['Am', 'F', 'C', 'G'],            // i VI III VII — classic
    ['Am', 'Em', 'F', 'G'],           // i v VI VII
    ['Am', 'G', 'F', 'G'],            // i VII VI VII loop
    ['Am', 'F', 'G', 'Am'],           // i VI VII i
    ['Am', 'C', 'G', 'F'],            // i III VII VI
    ['Dm', 'Am', 'F', 'C'],           // iv i VI III
    ['Am', 'Em', 'Am', 'G'],          // i v i VII
    ['Am', 'G', 'Dm', 'E'],           // i VII iv V — harmonic minor feel
    ['Am', 'G', 'F', 'E'],           // i VII VI V — Andalusian
    ['Am', 'F', 'Dm', 'E'],          // i VI iv V
    ['Em', 'G', 'D', 'Am'],          // v VII IV i
    ['Am', 'C', 'F', 'E'],           // i III VI V
    ['Dm', 'G', 'Am', 'E'],          // iv VII i V
    ['F', 'C', 'Dm', 'Am'],          // VI III iv i
    ['Am', 'Dm', 'Em', 'Am'],        // i iv v i
    ['Am', 'E', 'F', 'G'],           // i V VI VII
    ['F', 'G', 'Am', 'E'],           // VI VII i V
    ['Am', 'F', 'G', 'F'],           // i VI VII VI — loop
  ],
  unplugged_chorus: [
    ['F', 'C', 'G', 'Am'],            // VI III VII i
    ['C', 'G', 'Am', 'F'],            // III VII i VI
    ['F', 'G', 'Am', 'Em'],           // VI VII i v
    ['F', 'C', 'Am', 'G'],            // VI III i VII
    ['G', 'F', 'C', 'Am'],            // VII VI III i
    ['Am', 'F', 'C', 'G'],            // back to verse feel, higher energy
    ['F', 'Am', 'G', 'C'],            // VI i VII III
    ['C', 'Am', 'F', 'G'],            // III i VI VII — pop anthem
    ['G', 'Am', 'F', 'C'],           // VII i VI III
    ['Em', 'F', 'C', 'G'],           // v VI III VII
    ['F', 'G', 'C', 'Am'],           // VI VII III i
    ['Am', 'G', 'C', 'F'],           // i VII III VI
    ['C', 'F', 'Am', 'G'],           // III VI i VII
    ['F', 'Em', 'Dm', 'G'],          // VI v iv VII — discesa cromatica
    ['G', 'Am', 'C', 'F'],           // VII i III VI
    ['Em', 'Am', 'G', 'F'],          // v i VII VI
    ['C', 'G', 'F', 'Am'],           // III VII VI i
    ['Am', 'C', 'G', 'Em'],          // i III VII v
  ],
  unplugged_bridge: [
    ['Dm', 'Am', 'E', 'Am'],          // iv i V i — harmonic
    ['F', 'C', 'G', 'Em'],            // VI III VII v
    ['Dm', 'G', 'C', 'Am'],           // iv VII III i
    ['E', 'Am', 'Dm', 'G'],           // V i iv VII
    ['Dm', 'Am', 'G', 'C'],           // iv i VII III
    ['Am', 'E', 'Am', 'E'],           // i V pedal tension
    ['Am', 'F', 'E', 'Am'],          // i VI V i
    ['G', 'Am', 'Dm', 'E'],          // VII i iv V
    ['F', 'E', 'Am', 'G'],           // VI V i VII
    ['Em', 'Dm', 'Am', 'E'],         // v iv i V
    ['Am', 'Bm7b5', 'E7', 'Am'],    // i ii°7 V7 i — harmonic minor
    ['Dm', 'E', 'F', 'G'],           // iv V VI VII — tensione ascendente
  ],
  unplugged_outro: [
    ['Am', 'F', 'C', 'G'],            // verse reprise
    ['Am', 'G', 'F', 'E'],            // intro descend, slow fade
    ['Am', 'Am', 'Am', 'Am'],         // hold on tonic — very sparse
    ['F', 'C', 'G', 'Am'],            // chorus reprise
    ['Am', 'Em', 'F', 'G'],
    ['Am', 'G', 'Am', 'G'],          // i VII loop — fade out
    ['Dm', 'Am', 'Am', 'Am'],        // iv i i i — risoluzione lenta
    ['F', 'G', 'Am', 'Am'],          // VI VII i i — coda
  ],

  // ══════════════════════════════════════════════════════════════
  // FOLK — reference key C (major feel)
  // ══════════════════════════════════════════════════════════════
  folk_intro: [
    ['C', 'G', 'Am', 'F'],
    ['G', 'C', 'F', 'G'],
    ['C', 'F', 'C', 'G'],
    ['Am', 'F', 'G', 'C'],
    ['C', 'G', 'F', 'G'],            // I V IV V
    ['G', 'C', 'D', 'G'],            // I IV V I in G
    ['C', 'Em', 'Am', 'G'],          // I iii vi V
    ['F', 'C', 'G', 'C'],            // IV I V I
    ['C', 'F', 'C', 'G'],            // I IV I V
    ['Am', 'C', 'F', 'G'],           // vi I IV V
  ],
  folk_verse: [
    ['C', 'Am', 'F', 'G'],            // I vi IV V — Axis
    ['C', 'G', 'Am', 'F'],            // I V vi IV
    ['G', 'C', 'Em', 'D'],            // I IV vi III
    ['C', 'F', 'G', 'C'],             // I IV V I — traditional
    ['Am', 'G', 'F', 'E'],            // vi VII VI V
    ['C', 'Em', 'F', 'G'],            // I iii IV V
    ['D', 'G', 'A', 'G'],             // I IV V IV loop
    ['G', 'D', 'Em', 'C'],            // I V vi IV in G
    ['C', 'G', 'Am', 'Em'],          // I V vi iii — Canon
    ['C', 'F', 'Am', 'G'],           // I IV vi V
    ['C', 'Am', 'Em', 'G'],          // I vi iii V
    ['G', 'Em', 'C', 'D'],           // I iii IV V in G
    ['C', 'Dm', 'G', 'C'],           // I ii V I
    ['F', 'Am', 'C', 'G'],           // IV vi I V
    ['C', 'C', 'F', 'G'],            // I I IV V — country
    ['G', 'C', 'G', 'D'],            // I IV I V in G
    ['C', 'Am', 'F', 'F'],           // I vi IV IV — linger
    ['Am', 'G', 'C', 'F'],           // vi V I IV
    // Progressioni modali
    ['Dm', 'G', 'Dm', 'G'],          // dorian vamp — Am dorian i IV
    ['Am', 'G', 'Am', 'G'],          // dorian alternating — Tom Petty feel
    ['G', 'F', 'C', 'G'],            // mixolydian I bVII IV I
    ['D', 'C', 'G', 'D'],            // mixolydian in G (bVII=C, IV=G)
  ],
  folk_chorus: [
    ['F', 'G', 'C', 'Am'],            // IV V I vi
    ['F', 'C', 'G', 'Am'],
    ['C', 'G', 'F', 'C'],             // I V IV I
    ['Am', 'F', 'G', 'C'],            // vi IV V I
    ['G', 'F', 'C', 'G'],             // V IV I V
    ['F', 'G', 'Am', 'G'],            // IV V vi V
    ['C', 'F', 'Am', 'G'],
    ['Em', 'Am', 'D', 'G'],           // iii vi II V
    ['F', 'C', 'G', 'G'],            // IV I V V
    ['C', 'G', 'F', 'G'],            // I V IV V — anthem
    ['G', 'Am', 'C', 'F'],           // V vi I IV
    ['F', 'G', 'C', 'C'],            // IV V I I
    ['Am', 'C', 'G', 'G'],           // vi I V V
    ['F', 'Am', 'G', 'F'],           // IV vi V IV
    ['C', 'Am', 'C', 'G'],           // I vi I V
    ['F', 'C', 'Dm', 'G'],           // IV I ii V
    ['G', 'F', 'G', 'C'],            // V IV V I
    ['C', 'G', 'Am', 'G'],           // I V vi V — risoluzione forte
  ],
  folk_bridge: [
    ['Dm', 'G', 'Em', 'Am'],
    ['Am', 'E', 'Am', 'G'],
    ['F', 'C', 'Dm', 'G'],
    ['Em', 'Am', 'F', 'G'],
    ['Dm', 'Am', 'G', 'F'],
    ['C', 'G', 'Dm', 'Am'],
    ['C', 'Am', 'Dm', 'E'],          // I vi ii III
    ['G', 'Em', 'Am', 'D'],          // V iii vi II
    ['F', 'G', 'Am', 'E'],           // IV V vi III
    ['Am', 'G', 'F', 'C'],           // vi V IV I
    ['C', 'E', 'Am', 'G'],           // I III vi V
    ['Dm', 'Em', 'F', 'G'],          // ii iii IV V — step up
  ],
  folk_outro: [
    ['C', 'G', 'F', 'C'],
    ['G', 'C', 'Am', 'F'],
    ['C', 'Am', 'F', 'G'],
    ['F', 'G', 'C', 'C'],
    ['C', 'G', 'Am', 'F'],           // ripresa verse
    ['F', 'C', 'C', 'G'],            // IV I I V — slowing
    ['C', 'C', 'G', 'C'],            // I I V I — plagale
    ['Am', 'F', 'C', 'C'],           // vi IV I I — coda
  ],

  // ══════════════════════════════════════════════════════════════
  // JAZZ BALLAD — reference key C (major, with extensions)
  // ══════════════════════════════════════════════════════════════
  jazz_intro: [
    ['Cmaj7', 'Am7', 'Dm7', 'G7'],
    ['Fmaj7', 'Em7', 'Dm7', 'G7'],
    ['Cmaj7', 'Bm7b5', 'E7', 'Am7'],
    ['Gmaj7', 'Cmaj7', 'Fmaj7', 'G7'],    // IV I bVII V — cycle
    ['Cmaj7', 'D7', 'Gmaj7', 'G7'],        // I II7 V V — rhythm changes
    ['Em7', 'Eb7', 'Dm7', 'G7'],           // iii bIII7 ii V — cromatico
    ['Cmaj7', 'Am7', 'Abmaj7', 'G7'],  // I vi bVI V — backdoor
    ['Dm7', 'G7', 'Cmaj7', 'Cmaj7'],   // ii V I I — semplice e forte
    ['Fmaj7', 'Bm7b5', 'E7', 'Am7'],   // IV #iv° III7 vi
    ['Am7', 'Ab7', 'Gmaj7', 'G7'],     // vi bVI7 V V
  ],
  jazz_verse: [
    ['Cmaj7', 'Am7', 'Dm7', 'G7'],    // I vi ii V — the II-V-I
    ['Fmaj7', 'Em7', 'Dm7', 'G7'],    // IV iii ii V
    ['Am7', 'D7', 'Gmaj7', 'Cmaj7'],  // vi II7 I I
    ['Dm7', 'G7', 'Cmaj7', 'A7'],     // ii V I VI7
    ['Em7', 'A7', 'Dm7', 'G7'],       // iii VI7 ii V
    ['Cmaj7', 'Eb7', 'Abmaj7', 'G7'], // I bIII7 bVI V — tritone sub
    ['Am7', 'Dm7', 'G7', 'Cmaj7'],    // vi ii V I
    ['Fmaj7', 'Bb7', 'Cmaj7', 'G7'],  // IV bVII7 I V
    ['Dm7', 'G7', 'Em7', 'A7'],        // ii V iii VI — turnaround esteso
    ['Em7', 'Ebm7', 'Dm7', 'G7'],      // iii bIII ii V — cromatico
    ['Cmaj7', 'Am7', 'Abmaj7', 'G7'],  // I vi bVI V — backdoor
    ['Fmaj7', 'Fm7', 'Em7', 'Eb7'],    // IV ivm iii bIII7 — modal mixture
    ['Am7', 'Ab7', 'Gmaj7', 'G7'],     // vi bVI7 V V
    ['Cmaj7', 'D7', 'Gmaj7', 'Cmaj7'], // I II7 V I — rhythm changes
    ['Dm7', 'Db7', 'Cmaj7', 'Am7'],    // ii bII7 I vi — tritone sub
    ['Cmaj7', 'Bm7b5', 'E7', 'Am7'],   // I #iv° VII7 vi — harmonic minor
    // Progressioni con durate variabili: ii(2) V(2) I(4) — forma AABA jazz classica
    [['Dm7', 2], ['G7', 2], ['Cmaj7', 4]],         // ii-V-I con tonica lunga
    [['Em7', 2], ['A7', 2], ['Dm7', 2], ['G7', 2]], // iii-VI-ii-V ciclo (2+2+2+2)
    [['Cmaj7', 4], ['Dm7', 2], ['G7', 2]],          // I→ii-V (tonica d'apertura)
  ],
  jazz_chorus: [
    ['Fmaj7', 'Em7', 'Am7', 'Dm7'],
    ['Dm7', 'G7', 'Cmaj7', 'Fmaj7'],
    ['Am7', 'Ab7', 'Gmaj7', 'G7'],    // chromatic approach
    ['Fmaj7', 'E7', 'Am7', 'Dm7'],
    ['Cmaj7', 'Am7', 'Abmaj7', 'G7'],
    ['Em7', 'Eb7', 'Dm7', 'G7'],      // bebop chromatic
    ['Fmaj7', 'Bm7b5', 'E7', 'Am7'],
    ['Dm7', 'Db7', 'Cmaj7', 'G7'],    // tritone resolution
    ['Cmaj7', 'F#7', 'Fmaj7', 'G7'],   // I #IV7 IV V — tritone
    ['Am7', 'D7', 'Dm7', 'G7'],        // vi II7 ii V
    ['Cmaj7', 'Cm7', 'Fmaj7', 'G7'],   // I im IV V — modal mixture
    ['Dm7', 'G7', 'Fmaj7', 'Em7'],     // ii V IV iii
    ['Bm7b5', 'E7', 'Am7', 'G7'],      // viio7 VI7 vi V
    ['Em7', 'A7', 'Am7', 'D7'],        // iii VI7 ii II7
    ['Am7', 'Bm7b5', 'E7', 'Am7'],     // vi #iv° III7 vi — harmonic minor
    ['Fmaj7', 'Gm7', 'Am7', 'G7'],     // IV v vi V
    [['Fmaj7', 2], ['Em7', 2], ['Dm7', 2], ['G7', 2]], // IV-iii-ii-V (durate pari)
    [['Am7', 2], ['D7', 2], ['Gmaj7', 4]],             // vi-II7-V con risoluzione lunga
  ],
  jazz_bridge: [
    ['Dm7', 'G7', 'Cmaj7', 'A7'],
    ['Bm7b5', 'E7', 'Am7', 'D7'],
    ['Abmaj7', 'Db7', 'Cmaj7', 'G7'],
    ['Em7', 'A7', 'Dm7', 'G7'],
    ['Fm7', 'Bb7', 'Ebmaj7', 'G7'],
    ['Am7', 'Bm7b5', 'E7', 'Am7'],
    ['Cmaj7', 'B7', 'Em7', 'A7'],      // I VII7 iii VI7
    ['Gm7', 'C7', 'Fmaj7', 'G7'],     // ivm bVII7 IV V
    ['Dm7', 'E7', 'Am7', 'G7'],        // ii III7 vi V
    ['Am7', 'D7', 'Gmaj7', 'Cmaj7'],   // vi II7 V I
    ['Em7', 'Eb7', 'Dm7', 'Db7'],      // chromatic ii-V pair
    ['Cmaj7', 'F#m7b5', 'B7', 'Em7'],  // I tritone approach to vi
    [['Dm7', 2], ['G7', 2], ['Em7', 2], ['A7', 2]], // ii-V-iii-VI: turnaround classico
    [['Bm7b5', 1], ['E7', 1], ['Am7', 2], ['Dm7', 2], ['G7', 2]], // harmonic minor ii-V(1+1) → I-ii-V
  ],
  jazz_outro: [
    ['Cmaj7', 'Am7', 'Dm7', 'G7'],
    ['Fmaj7', 'G7', 'Cmaj7', 'Cmaj7'],
    ['Dm7', 'G7', 'Cmaj7', 'Cmaj7'],
    ['Cmaj7', 'Fmaj7', 'Dm7', 'G7'],      // I IV ii V — ritorno
    ['Am7', 'Dm7', 'Cmaj7', 'Cmaj7'],     // vi ii I I — risoluzione calma
    ['Dm7', 'Db7', 'Cmaj7', 'Fmaj7'],     // tritone sub finale
    ['Cmaj7', 'Cmaj7', 'Dm7', 'G7'],   // I I ii V — lento finale
    ['Cmaj7', 'Am7', 'Dm7', 'Cmaj7'],  // I vi ii I — risoluzione aperta
  ],

  // ══════════════════════════════════════════════════════════════
  // NEO SOUL — reference key Dm (dorian minor feel)
  // ══════════════════════════════════════════════════════════════
  neo_soul_intro: [
    ['Dm9', 'Gmaj7', 'Em7', 'Am7'],
    ['Am9', 'Dm9', 'Gmaj7', 'Em7'],
    ['Dm7', 'Em7', 'Fmaj7', 'Em7'],
    ['Fmaj7', 'Am7', 'Dm9', 'Em7'],       // bIII v i ii — dorian aperto
    ['Dm7', 'Gm7', 'Cmaj7', 'Am7'],       // i iv bVII v — più scuro
    ['Dm9', 'Cmaj7', 'Am9', 'Em7'],    // i bVII v ii
    ['Em11', 'Am9', 'Dm9', 'Fmaj9'],   // ii v i bIII
    ['Am7', 'Bm7b5', 'Cmaj7', 'Dm9'],  // v #v° bVII i
    ['Gmaj7', 'Em7', 'Am9', 'Dm9'],    // IV ii v i
    ['Fmaj9', 'Am9', 'Dm9', 'Gmaj7'],  // bIII v i IV
  ],
  neo_soul_verse: [
    ['Dm9', 'Gmaj7', 'Em7', 'Am7'],   // i IV ii v — dorian
    ['Am7', 'Dm7', 'Gmaj7', 'Cmaj7'], // v i IV bVII
    ['Dm9', 'Em7', 'Am9', 'Gmaj7'],   // i ii v IV
    ['Fmaj7', 'Em7', 'Dm9', 'Am9'],   // bIII ii i v
    ['Dm7', 'G7', 'Am7', 'Em7'],      // i IV v ii
    ['Am9', 'G13', 'Fmaj9', 'Em7'],
    ['Dm9', 'Am9', 'Gmaj7', 'Em11'],
    ['Dm7', 'Bbmaj7', 'Am7', 'Gm7'],
    ['Dm9', 'Cmaj7', 'Fmaj7', 'Em7'],  // i bVII bIII ii
    ['Am9', 'Gmaj7', 'Fmaj9', 'Em11'], // v IV bIII ii
    ['Dm7', 'Em7', 'Fmaj7', 'Gmaj7'],  // i ii bIII IV — dorian ascendente
    ['Fmaj9', 'Gmaj7', 'Am9', 'Em7'],  // bIII IV v ii
    ['Dm9', 'Gm9', 'Am9', 'Dm9'],      // i iv v i
    ['Dm9', 'Fmaj7', 'Gm7', 'Am7'],    // i bIII iv v — scuro
    ['Cmaj7', 'Am9', 'Dm9', 'Em11'],   // bVII v i ii
    ['Am9', 'Dm9', 'Em11', 'Gmaj7'],   // v i ii IV
    // Nuove — senza pattern Dm9-Gmaj7 dominante
    ['Em7', 'Fmaj9', 'Am9', 'Cmaj7'],  // ii bIII v bVII — Erykah Badu feel
    ['Fmaj9', 'Em11', 'Am9', 'Bm7b5'], // bIII ii v #v° — tensione modale
    ['Am9', 'Cmaj7', 'Em7', 'Fmaj9'],  // v bVII ii bIII — D'Angelo feel
    ['Gm9', 'Cmaj7', 'Fmaj9', 'Am9'],  // iv bVII bIII v — borrowed iv
    ['Em11', 'Fmaj9', 'Dm9', 'Cmaj7'], // ii bIII i bVII — discendente
  ],
  neo_soul_chorus: [
    ['Fmaj7', 'Em7', 'Dm9', 'Cmaj7'],
    ['Am9', 'Dm9', 'Gmaj7', 'Fmaj7'],
    ['Gmaj7', 'Fmaj7', 'Em7', 'Dm9'],
    ['Am7', 'G13', 'Fmaj9', 'Em11'],
    ['Dm9', 'Gmaj7', 'Am9', 'Em7'],
    ['Fmaj9', 'Em11', 'Dm9', 'Am9'],
    ['Dm9', 'Cmaj7', 'Gmaj7', 'Am9'],     // i bVII IV v — classico neo soul
    ['Am9', 'Gmaj7', 'Dm9', 'Fmaj7'],     // v IV i bIII — variante aperta
    ['Dm9', 'Gmaj7', 'Fmaj9', 'Am9'],  // i IV bIII v
    ['Em11', 'Am9', 'Dm9', 'Cmaj7'],   // ii v i bVII
    ['Fmaj9', 'Am9', 'Em7', 'Dm9'],    // bIII v ii i
    ['Am9', 'Fmaj9', 'Em11', 'Dm9'],   // v bIII ii i — discendente
    ['Gmaj7', 'Dm9', 'Fmaj9', 'Em7'],  // IV i bIII ii
    ['Am9', 'Cmaj7', 'Dm9', 'Em11'],   // v bVII i ii
    ['Dm9', 'Am9', 'Em7', 'Fmaj7'],    // i v ii bIII
    ['Fmaj9', 'Gmaj7', 'Em11', 'Am9'], // bIII IV ii v
  ],
  neo_soul_bridge: [
    ['Em7', 'A7', 'Dm9', 'Gmaj7'],
    ['Bm7b5', 'E7', 'Am9', 'Dm9'],
    ['Fmaj7', 'Em7', 'Am9', 'Dm7'],
    ['Dm7', 'C7', 'Bbmaj7', 'Am7'],
    ['Am9', 'Dm9', 'Fmaj9', 'Gmaj7'],     // v i bIII IV — tensione modale
    ['Gmaj7', 'Am9', 'Dm9', 'Em7'],       // IV v i ii — ascendente
    ['Dm9', 'Em7', 'Fmaj7', 'Gmaj7'],  // ascending tension
    ['Am9', 'E7', 'Am9', 'Dm9'],       // v III7 v i
    ['Fmaj9', 'Gmaj7', 'Am9', 'Bm7b5'],// bIII IV v #v°
    ['Dm7', 'Ebmaj7', 'Am7', 'Dm7'],   // i bII i pedal
    ['Em11', 'Ebmaj7', 'Dm9', 'Am9'],  // ii bII i v — cromatico
    ['Cmaj7', 'Bm7b5', 'Am9', 'Gmaj7'],// bVII #v° v IV
  ],
  neo_soul_outro: [
    ['Dm9', 'Gmaj7', 'Em7', 'Am7'],
    ['Am9', 'Dm9', 'Gmaj7', 'Gmaj7'],
    ['Fmaj7', 'Em7', 'Dm9', 'Dm9'],       // bIII ii i i — discesa verso tonica
    ['Dm9', 'Am9', 'Gmaj7', 'Gmaj7'],     // i v IV IV — chiusura ampia
    ['Dm9', 'Fmaj7', 'Am9', 'Em7'],    // slow fade open voicing
    ['Am9', 'Em7', 'Dm9', 'Dm9'],      // v ii i i
    ['Fmaj9', 'Dm9', 'Am9', 'Am9'],    // bIII i v v
    ['Gmaj7', 'Fmaj9', 'Em7', 'Dm9'],  // IV bIII ii i — discendente
  ],

  // ══════════════════════════════════════════════════════════════
  // CLASSICAL CHAMBER — reference key C (functional harmony)
  // ══════════════════════════════════════════════════════════════
  classical_intro: [
    ['C', 'G', 'Am', 'E'],
    ['C', 'F', 'G', 'C'],
    ['Am', 'Dm', 'E', 'Am'],
    ['C', 'G', 'Am', 'F'],            // I V vi IV
    ['C', 'Am', 'F', 'G'],            // I vi IV V
    ['G', 'C', 'F', 'G7'],            // V I IV V7
    ['Am', 'F', 'G', 'C'],            // vi IV V I
    ['C', 'Dm', 'G', 'C'],            // I ii V I
  ],
  classical_verse: [
    ['C', 'F', 'G', 'C'],             // I IV V I — tonic
    ['C', 'Am', 'Dm', 'G'],           // I vi ii V
    ['C', 'G', 'Am', 'E'],            // I V vi III — baroque
    ['F', 'C', 'Dm', 'G'],            // IV I ii V
    ['Am', 'Dm', 'G', 'C'],           // vi ii V I — circle
    ['C', 'E', 'Am', 'F'],            // I III vi IV
    ['G', 'Am', 'F', 'G'],            // V vi IV V — Pachelbel-esque
    ['C', 'Bdim', 'Am', 'G'],         // I viio vi V — Bach-like
    ['C', 'G', 'F', 'G'],             // I V IV V
    ['Am', 'E', 'F', 'G'],            // vi III IV V
    ['C', 'Dm', 'Am', 'G'],           // I ii vi V
    ['G', 'C', 'Am', 'D'],            // V I vi II — dominante secondaria
    ['C', 'G7', 'F', 'C'],            // I V7 IV I
    ['F', 'Em', 'Dm', 'C'],           // IV iii ii I — basso discendente
    ['C', 'Am', 'F', 'G7'],           // I vi IV V7
    ['Am', 'G', 'F', 'E'],            // vi V IV III — scala armonica
  ],
  classical_chorus: [
    ['F', 'C', 'G7', 'C'],            // IV I V7 I
    ['C', 'G', 'F', 'C'],             // I V IV I
    ['Am', 'E', 'Am', 'G'],           // vi III vi V
    ['F', 'G', 'Em', 'Am'],
    ['C', 'Am', 'G', 'C'],
    ['F', 'Dm', 'G', 'C'],            // IV ii V I
    ['G7', 'C', 'F', 'G7'],           // V7 I IV V7
    ['Em', 'Am', 'D', 'G'],           // iii vi II V — secondary dominants
    ['C', 'F', 'Dm', 'G7'],           // I IV ii V7
    ['F', 'Dm', 'Am', 'E'],           // IV ii vi III
    ['G', 'C', 'Dm', 'G'],            // V I ii V
    ['Am', 'F', 'Dm', 'E'],           // vi IV ii III
    ['F', 'C', 'Dm', 'Am'],           // IV I ii vi
    ['C', 'Am', 'Dm', 'G7'],          // I vi ii V7
    ['G7', 'Am', 'F', 'C'],           // V7 vi IV I — cadenza ingannevole
    ['C', 'E', 'F', 'G7'],            // I III IV V7
  ],
  classical_bridge: [
    ['Am', 'Dm', 'E', 'Am'],
    ['Dm', 'A', 'Dm', 'G'],
    ['G', 'D', 'Em', 'Am'],
    ['F', 'C', 'G', 'Am'],
    ['Am', 'E', 'Dm', 'G'],           // vi III ii V
    ['G', 'D', 'Am', 'E'],            // V II vi III
    ['Dm', 'G', 'C', 'E'],            // ii V I III
    ['C', 'Bdim', 'G', 'G7'],         // I viio V V7
    ['Am', 'Dm', 'G7', 'C'],          // vi ii V7 I
    ['F', 'G', 'Am', 'E'],            // IV V vi III
  ],
  classical_outro: [
    ['C', 'F', 'G', 'C'],
    ['Am', 'F', 'G', 'C'],
    ['F', 'G', 'C', 'C'],
    ['C', 'G', 'F', 'C'],             // I V IV I — plagale
    ['Am', 'G', 'F', 'G7'],           // vi V IV V7
    ['C', 'Am', 'G', 'C'],            // I vi V I
    ['G7', 'C', 'G7', 'C'],           // V7 I V7 I — picardy
  ],

  // ══════════════════════════════════════════════════════════════
  // POP ROCK — reference key A major / Am minor
  // ══════════════════════════════════════════════════════════════
  pop_rock_intro: [
    ['A', 'E', 'F#m', 'D'],           // I V vi IV — Axis
    ['Am', 'F', 'C', 'G'],            // i bVI bIII bVII — minor rock
    ['A', 'D', 'A', 'E'],             // I IV I V — classic rock
    ['Am', 'G', 'F', 'G'],            // i bVII bVI bVII — driving
    ['A', 'F#m', 'D', 'E'],           // I vi IV V
    ['Am', 'Am', 'F', 'G'],           // i i bVI bVII — simple
  ],
  pop_rock_verse: [
    ['A', 'E', 'F#m', 'D'],           // I V vi IV — Axis
    ['Am', 'F', 'C', 'G'],            // i bVI bIII bVII
    ['A', 'D', 'F#m', 'E'],           // I IV vi V
    ['Am', 'G', 'F', 'E'],            // i bVII bVI V — Andalusian
    ['A', 'A', 'D', 'E'],             // I I IV V — country rock
    ['Am', 'C', 'G', 'F'],            // i bIII bVII bVI
    ['A', 'E', 'D', 'A'],             // I V IV I — classic
    ['Am', 'Dm', 'G', 'C'],           // i iv bVII bIII
    ['A', 'F#m', 'D', 'A'],           // I vi IV I
    ['Am', 'G', 'Am', 'F'],           // i bVII i bVI — riff loop
    ['A', 'D', 'E', 'A'],             // I IV V I
    ['Am', 'F', 'G', 'Am'],           // i bVI bVII i
    ['A', 'Bm', 'D', 'E'],            // I ii IV V — pop anthem
    ['Am', 'Em', 'F', 'G'],           // i v bVI bVII
    ['A', 'G', 'D', 'A'],             // I bVII IV I — mixolydian rock
    ['Am', 'Dm', 'Am', 'E'],          // i iv i V — flamenco-rock
  ],
  pop_rock_chorus: [
    ['D', 'A', 'E', 'F#m'],           // IV I V vi — power chorus
    ['F', 'C', 'G', 'Am'],            // bVI bIII bVII i
    ['D', 'E', 'A', 'F#m'],           // IV V I vi
    ['F', 'G', 'Am', 'G'],            // bVI bVII i bVII — driving
    ['A', 'E', 'F#m', 'D'],           // I V vi IV — anthemic
    ['Am', 'F', 'C', 'G'],            // i bVI bIII bVII — loud
    ['D', 'A', 'F#m', 'E'],           // IV I vi V
    ['F', 'C', 'Am', 'G'],            // bVI bIII i bVII
    ['A', 'D', 'E', 'E'],             // I IV V V — punk push
    ['Am', 'G', 'F', 'G'],            // i bVII bVI bVII — repeat
    ['E', 'D', 'A', 'A'],             // V IV I I — rock resolution
    ['G', 'D', 'Am', 'F'],            // bVII IV i bVI
  ],
  pop_rock_bridge: [
    ['F#m', 'D', 'A', 'E'],           // vi IV I V
    ['F', 'Am', 'G', 'E'],            // bVI i bVII V
    ['Bm', 'E', 'A', 'D'],            // ii V I IV
    ['Dm', 'Am', 'E', 'Am'],          // iv i V i
    ['D', 'E', 'F#m', 'E'],           // IV V vi V — tension
    ['F', 'G', 'Em', 'Am'],           // bVI bVII v i
    ['A', 'C#m', 'D', 'E'],           // I iii IV V — big build
    ['Am', 'E', 'F', 'G'],            // i V bVI bVII
    ['F#m', 'A', 'D', 'E'],           // vi I IV V
    ['Dm', 'G', 'Am', 'E'],           // iv bVII i V
  ],
  pop_rock_outro: [
    ['A', 'E', 'F#m', 'D'],           // I V vi IV — ripresa chorus
    ['Am', 'F', 'C', 'G'],            // i bVI bIII bVII
    ['A', 'D', 'A', 'A'],             // I IV I I — fade
    ['Am', 'G', 'Am', 'Am'],          // i bVII i i — coda
    ['D', 'A', 'D', 'A'],             // IV I IV I — gospel close
    ['F', 'G', 'Am', 'Am'],           // bVI bVII i i — slow out
  ],

  // ══════════════════════════════════════════════════════════════
  // BOSSA NOVA — reference key A major (con estensioni jazz)
  // ══════════════════════════════════════════════════════════════
  bossa_nova_intro: [
    ['Cmaj7', 'Am7', 'Fmaj7', 'G7'],          // I vi IV V7
    ['Cmaj7', 'Dm7', 'G7', 'Cmaj7'],          // I ii V7 I
    ['Fmaj7', 'G7', 'Cmaj7', 'Cmaj7'],        // IV V7 I I
    ['Cmaj7', 'Am7', 'Dm7', 'G7'],            // I vi ii V
    ['Cm7', 'F7', 'Bbmaj7', 'G7'],            // Im bVII bVI V — bossa modal
    ['Cmaj7', 'F7', 'Cmaj7', 'G7'],           // I IV7 I V
  ],
  bossa_nova_verse: [
    ['Cmaj7', 'Am7', 'Dm7', 'G7'],            // I vi ii V
    ['Fmaj7', 'Em7', 'Dm7', 'G7'],            // IV iii ii V
    ['Am7', 'D7', 'Gmaj7', 'G7'],             // vi II7 V V
    ['Cmaj7', 'Am7', 'Fmaj7', 'Fm7'],         // I vi IV IVm — bossa plagale
    ['Dm7', 'G7', 'Cmaj7', 'A7'],             // ii V I VI7
    ['Cmaj7', 'Bm7b5', 'E7', 'Am7'],          // I vii° III7 vi — harmonic minor
    ['Fmaj7', 'Fm7', 'Cmaj7', 'G7'],          // IV IVm I V
    ['Cmaj7', 'G7', 'Am7', 'Dm7'],            // I V vi ii
    ['Cmaj7', 'B7', 'Bbmaj7', 'Eb7'],         // I bI7 bVII bIII7 — cromatico
    ['Am7', 'Ab7', 'Gm7', 'G7'],              // vi bvi v V — discesa
    [['Dm7', 2], ['G7', 2], ['Cmaj7', 4]],    // ii-V-I timed (AABA classico)
    [['Cmaj7', 2], ['Fmaj7', 2], ['Dm7', 2], ['G7', 2]],  // I IV ii V timed
  ],
  bossa_nova_chorus: [
    ['Cmaj7', 'Fmaj7', 'Dm7', 'G7'],          // I IV ii V
    ['Am7', 'D7', 'Gmaj7', 'C7'],             // vi II7 V I7
    ['Cmaj7', 'Fm7', 'Cmaj7', 'G7'],          // I IVm I V — bossa quintessenziale
    ['Dm7', 'G7', 'Cmaj7', 'C7'],             // ii V I I7
    ['Cmaj7', 'Am7', 'Fm7', 'G7'],            // I vi IVm V
    ['Fmaj7', 'Em7', 'Dm7', 'G7'],            // IV iii ii V
    ['Cmaj7', 'B7', 'Fmaj7', 'E7'],           // I bI IV bIV — tritone chain
    ['Am7', 'D7', 'Dm7', 'G7'],               // vi II7 ii V
    [['Fmaj7', 2], ['E7', 2], ['Cmaj7', 4]],  // IV tritone→I timed
  ],
  bossa_nova_bridge: [
    ['Am7', 'D7', 'Dm7', 'G7'],               // vi II7 ii V — deceptive
    ['Fm7', 'Bb7', 'Cmaj7', 'G7'],            // IVm bVII7 I V — backdoor
    ['Cm7', 'F7', 'Bbmaj7', 'Eb7'],           // im bVII bVI bV — modal bossa
    ['Dm7b5', 'G7', 'Cm7', 'G7'],             // ii° V im V — minor bossa
    ['Am7', 'E7', 'Am7', 'G7'],               // vi III7 vi V — minor excursion
    ['Fm7', 'E7', 'Cmaj7', 'A7'],             // IVm tritone I VI7
    ['Cmaj7', 'Ab7', 'Gmaj7', 'G7'],          // I bVI V V — backdoor resolution
  ],
  bossa_nova_outro: [
    ['Cmaj7', 'Dm7', 'Cmaj7', 'Cmaj7'],       // I ii I I — dissolve
    ['Cmaj7', 'Am7', 'Cmaj7', 'G7'],          // I vi I V
    ['Dm7', 'G7', 'Cmaj7', 'Cmaj7'],          // ii V I I — cadenza finale
    ['Cmaj7', 'Fmaj7', 'G7', 'Cmaj7'],        // I IV V I — plagale
    ['Am7', 'Dm7', 'G7', 'Cmaj7'],            // vi ii V I
    ['Cmaj7', 'Cmaj7', 'Fmaj7', 'G7'],        // I I IV V — aperto
  ],

  // ══════════════════════════════════════════════════════════════
  // BLUES ROCK — reference key C (dom7, shuffle feel)
  // ══════════════════════════════════════════════════════════════
  blues_rock_intro: [
    ['C7', 'C7', 'F7', 'G7'],                 // I7 I7 IV7 V7
    ['C7', 'F7', 'C7', 'C7'],                 // quick change
    ['C', 'Bb', 'F', 'C'],                    // I bVII IV I — rock
    ['C7', 'C7', 'F7', 'F7'],                 // I7 I7 IV7 IV7 — 12-bar opening
    ['Cm', 'G7', 'Cm', 'D7'],                 // minor blues
    ['C', 'Eb', 'F', 'C'],                    // I bIII IV I
  ],
  blues_rock_verse: [
    ['C7', 'F7', 'C7', 'G7'],                 // I7 IV7 I7 V7 — classic shuffle
    ['C7', 'F7', 'C7', 'C7'],                 // quick change I7 IV7 I7 I7
    ['C', 'Bb', 'F', 'C'],                    // I bVII IV I — rock feel
    ['C7', 'Eb', 'F', 'G'],                   // I bIII IV V
    ['C7', 'F7', 'G7', 'F7'],                 // I7 IV7 V7 IV7
    ['Cm', 'G7', 'Cm', 'G7'],                 // minor blues vamp
    ['C7', 'Eb7', 'F7', 'G7'],                // I7 bIII7 IV7 V7 — esteso
    ['C', 'F', 'C', 'G7'],                    // I IV I V7
    ['Am', 'F', 'C', 'G'],                    // vi IV I V
    ['C7', 'F7', 'Eb7', 'G7'],                // I7 IV7 bIII7 V7
    [['C7', 2], ['F7', 2], ['C7', 2], ['G7', 2]], // timed 8-bar shuffle
    [['C7', 4], ['F7', 4]],                   // 2-chord extended vamp
  ],
  blues_rock_chorus: [
    ['C7', 'F7', 'G7', 'C7'],                 // I7 IV7 V7 I7 — full cadence
    ['C', 'F', 'G', 'F'],                     // I IV V IV — rock anthem
    ['C7', 'Bb7', 'F7', 'C7'],                // I7 bVII7 IV7 I7
    ['C', 'G', 'F', 'C'],                     // I V IV I
    ['Cm', 'G7', 'D7', 'G7'],                 // minor blues chorus
    ['C7', 'F7', 'G7', 'F7'],                 // I7 IV7 V7 IV7 — classic
    ['C', 'Am', 'F', 'G'],                    // I vi IV V — pop blues
    ['C7', 'Eb', 'F', 'G7'],                  // I bIII IV V7
    [['C7', 2], ['F7', 2], ['G7', 4]],        // cadenza timed
  ],
  blues_rock_bridge: [
    ['F7', 'C7', 'F7', 'G7'],                 // IV7 I7 IV7 V7
    ['Dm', 'F', 'C', 'G7'],                   // ii IV I V7
    ['Fm', 'Bb7', 'C7', 'G7'],                // IVm bVII7 I7 V7
    ['C', 'Em', 'F', 'G'],                    // I iii IV V
    ['F7', 'Bb7', 'F7', 'C7'],                // IV7 bVII7 IV7 I7
    ['Dm', 'G7', 'C7', 'C7'],                 // ii V7 I I — risoluzione
  ],
  blues_rock_outro: [
    ['C7', 'F7', 'C7', 'C7'],                 // I7 IV7 I I — fade
    ['C', 'Bb', 'F', 'C'],                    // I bVII IV I — rock out
    ['C7', 'C7', 'F7', 'C7'],                 // I I IV I — bluesy close
    ['F', 'C', 'F', 'C'],                     // IV I IV I — plagale
    ['C7', 'G7', 'F7', 'C7'],                 // I7 V7 IV7 I7
  ],

  // ══════════════════════════════════════════════════════════════
  // SINGER/SONGWRITER — reference key C major (accordi aperti)
  // ══════════════════════════════════════════════════════════════
  singer_songwriter_intro: [
    ['C', 'F', 'C', 'G'],                     // I IV I V
    ['C', 'G', 'Am', 'F'],                    // I V vi IV — Axis
    ['Am', 'F', 'C', 'G'],                    // vi IV I V
    ['F', 'C', 'G', 'C'],                     // IV I V I
    ['C', 'Am', 'F', 'G'],                    // I vi IV V
    ['C', 'Fadd9', 'Am', 'G'],                // con colore add9
  ],
  singer_songwriter_verse: [
    ['C', 'G', 'Am', 'F'],                    // I V vi IV — Axis
    ['C', 'Am', 'F', 'G'],                    // I vi IV V
    ['C', 'F', 'G', 'C'],                     // I IV V I — traditional
    ['Am', 'C', 'F', 'G'],                    // vi I IV V
    ['C', 'Em', 'F', 'G'],                    // I iii IV V
    ['F', 'C', 'G', 'Am'],                    // IV I V vi
    ['Dm', 'C', 'F', 'G'],                    // ii I IV V
    ['C', 'G', 'F', 'C'],                     // I V IV I — country
    ['Am', 'F', 'G', 'C'],                    // vi IV V I
    ['C', 'Am', 'Dm', 'G'],                   // I vi ii V
    ['F', 'Dm', 'C', 'G'],                    // IV ii I V
    ['C', 'Gsus4', 'F', 'C'],                 // sus color
    ['Am', 'Dm', 'G', 'C'],                   // vi ii V I
    ['C', 'F', 'Dm', 'G'],                    // I IV ii V
    ['Em', 'Am', 'F', 'G'],                   // iii vi IV V
  ],
  singer_songwriter_chorus: [
    ['C', 'F', 'G', 'Am'],                    // I IV V vi
    ['F', 'C', 'G', 'Am'],                    // IV I V vi
    ['C', 'G', 'Dm', 'F'],                    // I V ii IV
    ['Am', 'F', 'C', 'G'],                    // vi IV I V
    ['C', 'Am', 'F', 'G'],                    // I vi IV V
    ['F', 'G', 'Am', 'C'],                    // IV V vi I
    ['C', 'F', 'C', 'G'],                     // I IV I V — anthem
    ['Dm', 'G', 'C', 'C'],                    // ii V I I — risoluzione
    ['C', 'Em', 'Dm', 'G'],                   // I iii ii V
    ['F', 'C', 'Dm', 'G'],                    // IV I ii V
  ],
  singer_songwriter_bridge: [
    ['Am', 'Dm', 'F', 'G'],                   // vi ii IV V
    ['Dm', 'F', 'C', 'G'],                    // ii IV I V
    ['Em', 'Am', 'F', 'G'],                   // iii vi IV V
    ['Am', 'F', 'Dm', 'G'],                   // vi IV ii V
    ['C', 'Dm', 'Em', 'F'],                   // I ii iii IV — rising
    ['F', 'G', 'C', 'Am'],                    // IV V I vi
  ],
  singer_songwriter_outro: [
    ['C', 'G', 'Am', 'F'],                    // ripresa verse
    ['C', 'F', 'C', 'C'],                     // I IV I I — close
    ['C', 'C', 'F', 'G'],                     // I I IV V — slow
    ['Am', 'F', 'C', 'C'],                    // vi IV I I — hold
    ['F', 'C', 'G', 'C'],                     // IV I V I — plagale
    ['C', 'F', 'G', 'C'],                     // I IV V I
  ],

  // ── LATIN / Afro-Cuban — reference key Am ──────────────────────
  latin_intro: [
    ['Am', 'Dm', 'E', 'Am'],
    ['Am', 'F', 'E', 'Am'],
    ['Am', 'Dm', 'Am', 'E'],
  ],
  latin_verse: [
    ['Am', 'Dm', 'G', 'C'],         // i iv VII III — dorian
    ['Am', 'Dm', 'E7', 'Am'],       // i iv V7 i
    ['Dm', 'Am', 'E', 'Am'],        // iv i V i
    ['Am', 'G', 'F', 'E'],          // i VII VI V — Andaluz
    ['Am', 'Dm', 'Am', 'E7'],       // i iv i V7
    ['Am', 'C', 'G', 'Dm'],         // i III VII iv
  ],
  latin_chorus: [
    ['Am', 'F', 'C', 'E'],          // i VI III V
    ['Dm', 'Am', 'E7', 'Am'],       // iv i V7 i
    ['Am', 'Dm', 'G', 'E'],         // i iv VII V
    ['F', 'G', 'Am', 'E'],          // VI VII i V
  ],
  latin_bridge: [
    ['F', 'G', 'Am', 'E'],          // VI VII i V
    ['Dm', 'E7', 'Am', 'Am'],       // iv V7 i i
    ['Am', 'F', 'Dm', 'E'],         // i VI iv V
  ],
  latin_outro: [
    ['Am', 'Dm', 'E', 'Am'],
    ['Am', 'F', 'E', 'Am'],
    ['Am', 'Am', 'Dm', 'E'],
  ],

  // ── CINEMATIC / Orchestral — reference key Am/C ─────────────────
  cinematic_intro: [
    ['C', 'Bb', 'F', 'C'],          // I bVII IV I — modale
    ['Am', 'F', 'C', 'G'],
    ['C', 'F', 'Am', 'G'],
  ],
  cinematic_verse: [
    ['C', 'Bb', 'F', 'C'],          // I bVII IV I
    ['Am', 'Em', 'F', 'G'],         // vi iii IV V
    ['C', 'Am', 'Em', 'F'],         // I vi iii IV
    ['F', 'Am', 'C', 'G'],
    ['C', 'G', 'Am', 'Em'],         // I V vi iii
    ['Am', 'G', 'F', 'E'],          // i VII VI V — discesa cromatica
  ],
  cinematic_chorus: [
    ['Am', 'F', 'C', 'G'],
    ['C', 'F', 'G', 'Am'],
    ['F', 'C', 'G', 'Am'],
    ['Am', 'Em', 'F', 'C'],
  ],
  cinematic_bridge: [
    ['Am', 'G', 'F', 'E'],
    ['Dm', 'Am', 'G', 'C'],
    ['F', 'G', 'Am', 'C'],
  ],
  cinematic_outro: [
    ['C', 'Am', 'F', 'G'],
    ['Am', 'F', 'C', 'C'],
    ['C', 'Bb', 'F', 'C'],
  ],

  // ── REGGAE / Dub — reference key C ──────────────────────────────
  reggae_intro: [
    ['C', 'F', 'G', 'C'],
    ['Am', 'F', 'C', 'G'],
  ],
  reggae_verse: [
    ['C', 'F', 'G', 'C'],           // I IV V I
    ['C', 'G', 'F', 'C'],           // I V IV I
    ['C', 'F', 'C', 'G'],           // I IV I V
    ['Am', 'G', 'F', 'G'],          // vi V IV V
    ['C', 'C', 'F', 'G'],           // I I IV V
    ['Am', 'F', 'G', 'C'],          // vi IV V I
  ],
  reggae_chorus: [
    ['F', 'C', 'G', 'C'],           // IV I V I
    ['C', 'F', 'G', 'Am'],
    ['C', 'G', 'Am', 'F'],
    ['F', 'G', 'C', 'C'],           // IV V I I
  ],
  reggae_bridge: [
    ['Am', 'F', 'G', 'C'],
    ['Dm', 'G', 'C', 'C'],          // ii V I I
    ['F', 'G', 'Am', 'G'],
  ],
  reggae_outro: [
    ['C', 'F', 'G', 'C'],
    ['C', 'G', 'F', 'C'],
    ['Am', 'F', 'C', 'C'],
  ],

  // ── WALTZ 3/4 — reference key C ────────────────────────────────
  waltz_intro: [
    ['C', 'G', 'Am', 'F'],
    ['C', 'F', 'C', 'G'],
    ['Am', 'Em', 'F', 'G'],
    ['Cmaj7', 'Am7', 'Dm7', 'G7'],
  ],
  waltz_verse: [
    ['C', 'G', 'Am', 'F'],
    ['C', 'Am', 'F', 'G'],
    ['C', 'F', 'G', 'C'],
    ['Cmaj7', 'Dm7', 'G7', 'Cmaj7'],
    ['Am', 'F', 'G', 'C'],
    ['C', 'Em', 'F', 'G'],
    ['Dm', 'G', 'C', 'Am'],
    ['C', 'G', 'F', 'Am'],
  ],
  waltz_chorus: [
    ['C', 'F', 'G', 'Am'],
    ['C', 'G', 'Am', 'F'],
    ['F', 'G', 'C', 'Am'],
    ['Cmaj7', 'Fmaj7', 'G7', 'Am7'],
    ['Am', 'F', 'C', 'G'],
    ['C', 'Am', 'Dm', 'G'],
  ],
  waltz_bridge: [
    ['Am', 'F', 'C', 'G'],
    ['Dm', 'G', 'Am', 'E7'],
    ['F', 'G', 'Em', 'Am'],
    ['Am', 'Dm', 'E7', 'Am'],
    ['F', 'C', 'Dm', 'G'],
  ],
  waltz_outro: [
    ['C', 'G', 'Am', 'F'],
    ['C', 'F', 'C', 'G'],
    ['Dm', 'G', 'C', 'C'],
    ['Am', 'F', 'G', 'C'],
  ],

  // ══════════════════════════════════════════════════════════════
  // LO-FI — reference key Dm (dorian, m7/maj7 loop-based, poche mosse)
  // ══════════════════════════════════════════════════════════════
  lo_fi_intro: [
    ['Dm7', 'Cmaj7', 'Dm7', 'Cmaj7'],       // loop i bVII
    ['Dm9', 'Gm7', 'Dm9', 'Gm7'],           // loop i iv
    ['Fmaj7', 'Em7', 'Dm7', 'Em7'],         // bIII ii i ii
    ['Dm7', 'Am7', 'Dm7', 'Am7'],           // loop i v
    ['Dm9', 'Cmaj7', 'Bbmaj7', 'Cmaj7'],    // i bVII bVI bVII
  ],
  lo_fi_verse: [
    ['Dm7', 'Cmaj7', 'Bbmaj7', 'Cmaj7'],    // i bVII bVI bVII
    ['Dm9', 'Gm7', 'Cmaj7', 'Am7'],         // i iv bVII v
    ['Fmaj7', 'Cmaj7', 'Dm7', 'Bbmaj7'],    // bIII bVII i bVI
    ['Dm7', 'Em7', 'Fmaj7', 'Em7'],         // i ii bIII ii
    ['Dm9', 'Am7', 'Gm7', 'Am7'],           // i v iv v
    ['Bbmaj7', 'Cmaj7', 'Dm7', 'Dm7'],      // bVI bVII i i
    ['Dm7', 'Fmaj7', 'Gm7', 'Am7'],         // i bIII iv v
  ],
  lo_fi_chorus: [
    ['Fmaj7', 'Cmaj7', 'Gm7', 'Am7'],       // bIII bVII iv v — apertura
    ['Dm9', 'Bbmaj7', 'Fmaj7', 'Cmaj7'],    // i bVI bIII bVII
    ['Cmaj7', 'Dm7', 'Bbmaj7', 'Cmaj7'],    // bVII i bVI bVII
    ['Dm7', 'Gm7', 'Am7', 'Dm7'],           // i iv v i
    ['Fmaj7', 'Gm7', 'Dm7', 'Cmaj7'],       // bIII iv i bVII
    ['Dm9', 'Fmaj9', 'Am7', 'Gm7'],         // i bIII v iv
  ],
  lo_fi_bridge: [
    ['Bbmaj7', 'Am7', 'Gm7', 'Am7'],        // bVI v iv v
    ['Fmaj7', 'Em7', 'Am7', 'Dm7'],         // bIII ii v i
    ['Gm7', 'Cmaj7', 'Fmaj7', 'Bbmaj7'],    // iv bVII bIII bVI
    ['Dm7', 'Bbmaj7', 'Am7', 'Gm7'],        // i bVI v iv
  ],
  lo_fi_outro: [
    ['Dm7', 'Cmaj7', 'Dm7', 'Dm7'],         // i bVII i i — dissolve
    ['Bbmaj7', 'Cmaj7', 'Dm7', 'Dm7'],      // bVI bVII i i
    ['Dm9', 'Gm7', 'Dm7', 'Dm7'],           // i iv i i
  ],

  // ══════════════════════════════════════════════════════════════
  // PUNK — reference key A (power chord, poche triadi, tutto diatonico)
  // ══════════════════════════════════════════════════════════════
  punk_intro: [
    ['A', 'D', 'A', 'D'],                   // I IV loop — driving
    ['A', 'G', 'D', 'A'],                   // I bVII IV I
    ['A', 'A', 'D', 'E'],                   // I I IV V
    ['Am', 'G', 'D', 'A'],                  // i bVII IV I (Ramones-style)
  ],
  punk_verse: [
    ['A', 'D', 'E', 'A'],                   // I IV V I — three chord
    ['A', 'G', 'D', 'A'],                   // I bVII IV I
    ['A', 'D', 'A', 'E'],                   // I IV I V
    ['D', 'A', 'G', 'A'],                   // IV I bVII I
    ['A', 'E', 'D', 'A'],                   // I V IV I
    ['A', 'A', 'D', 'D'],                   // I I IV IV — palm-mute push
  ],
  punk_chorus: [
    ['D', 'A', 'E', 'A'],                   // IV I V I — gang vocal
    ['A', 'D', 'G', 'D'],                   // I IV bVII IV
    ['D', 'G', 'A', 'A'],                   // IV bVII I I
    ['A', 'E', 'A', 'D'],                   // I V I IV
    ['G', 'D', 'A', 'A'],                   // bVII IV I I
  ],
  punk_bridge: [
    ['Bm', 'D', 'A', 'E'],                  // ii IV I V
    ['D', 'E', 'A', 'A'],                   // IV V I I
    ['G', 'A', 'D', 'E'],                   // bVII I IV V
  ],
  punk_outro: [
    ['A', 'D', 'A', 'A'],                   // I IV I I — hard stop
    ['A', 'G', 'D', 'A'],                   // I bVII IV I
    ['D', 'A', 'D', 'A'],                   // IV I IV I
  ],

  // ══════════════════════════════════════════════════════════════
  // GARAGE ROCK — reference key E (blues-ish triadi, sporco anni '60)
  // ══════════════════════════════════════════════════════════════
  garage_rock_intro: [
    ['E', 'A', 'E', 'A'],                   // I IV loop
    ['E', 'D', 'A', 'E'],                   // I bVII IV I
    ['E', 'G', 'A', 'E'],                   // I bIII IV I
  ],
  garage_rock_verse: [
    ['E', 'A', 'B', 'E'],                   // I IV V I
    ['E', 'D', 'A', 'E'],                   // I bVII IV I
    ['E', 'G', 'D', 'A'],                   // I bIII bVII IV
    ['A', 'E', 'D', 'E'],                   // IV I bVII I
    ['E', 'A', 'E', 'B'],                   // I IV I V
    ['E', 'E', 'A', 'D'],                   // I I IV bVII
  ],
  garage_rock_chorus: [
    ['A', 'D', 'E', 'E'],                   // IV bVII I I
    ['E', 'D', 'A', 'B'],                   // I bVII IV V
    ['D', 'A', 'E', 'E'],                   // bVII IV I I
    ['E', 'G', 'A', 'B'],                   // I bIII IV V
    ['A', 'B', 'E', 'E'],                   // IV V I I
  ],
  garage_rock_bridge: [
    ['C#m', 'A', 'B', 'E'],                 // vi IV V I
    ['A', 'D', 'E', 'B'],                   // IV bVII I V
    ['G', 'D', 'A', 'B'],                   // bIII bVII IV V
  ],
  garage_rock_outro: [
    ['E', 'A', 'E', 'E'],                   // I IV I I
    ['D', 'A', 'E', 'E'],                   // bVII IV I I
    ['E', 'D', 'A', 'E'],                   // I bVII IV I
  ],

  // ══════════════════════════════════════════════════════════════
  // 8-BIT / CHIPTUNE — reference key C (diatonico brillante, poco cromatismo)
  // ══════════════════════════════════════════════════════════════
  chiptune_intro: [
    ['C', 'G', 'Am', 'F'],                  // I V vi IV
    ['C', 'F', 'C', 'G'],                   // I IV I V
    ['Am', 'F', 'C', 'G'],                  // vi IV I V
  ],
  chiptune_verse: [
    ['C', 'G', 'Am', 'F'],                  // I V vi IV
    ['C', 'Am', 'F', 'G'],                  // I vi IV V
    ['F', 'C', 'G', 'Am'],                  // IV I V vi
    ['C', 'Em', 'F', 'G'],                  // I iii IV V
    ['Dm', 'G', 'C', 'Am'],                 // ii V I vi
    ['C', 'F', 'G', 'C'],                   // I IV V I
  ],
  chiptune_chorus: [
    ['F', 'G', 'C', 'Am'],                  // IV V I vi — jingle
    ['C', 'G', 'F', 'C'],                   // I V IV I
    ['Am', 'F', 'C', 'G'],                  // vi IV I V
    ['F', 'C', 'G', 'G'],                   // IV I V V — build finale livello
    ['C', 'F', 'Am', 'G'],                  // I IV vi V
  ],
  chiptune_bridge: [
    ['Dm', 'Em', 'F', 'G'],                 // ii iii IV V — scala ascendente
    ['Am', 'Em', 'F', 'G'],                 // vi iii IV V
    ['F', 'G', 'Am', 'Am'],                 // IV V vi vi — tensione
  ],
  chiptune_outro: [
    ['F', 'G', 'C', 'C'],                   // IV V I I — fanfara finale
    ['C', 'G', 'C', 'C'],                   // I V I I
    ['Am', 'F', 'C', 'C'],                  // vi IV I I
  ],
};

// Legacy alias — kept for any internal references
export const PROGRESSIONS = Object.fromEntries(
  Object.entries(PROGRESSION_POOLS).map(([k, pool]) => [k, pool[0]])
);

