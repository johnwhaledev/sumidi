/**
 * SongProgressions.js
 * ─────────────────────────────────────────────────────────────────
 * Progressioni di accordi per stile e tipo di sezione (pool + variante
 * di default per ciascuna combinazione). Estratto da SongArchitect.js
 * (sessione R1 — PLAN35). I pool vivono in gradi da D1 (PLAN37): qui restano
 * la ricostruzione e la tabella dei gradi diatonici.
 * ─────────────────────────────────────────────────────────────────
 */

import { PROGRESSIONI, POOL_INDICE } from './ProgressioniGradi.js';

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
 *
 * D1 di PLAN37 — i pool non sono piu' scritti a mano come accordi concreti: si
 * ricostruiscono qui dai gradi di `ProgressioniGradi.js`. La forma esportata e'
 * identica a quella di prima ('Am' quando dura una battuta, ['Am7', 2] quando
 * ne dura di piu'), quindi nessun consumatore e' cambiato; a cambiare e' che la
 * tonalita' di riferimento non va piu' ricordata a mente, sta in una tabella
 * sola (PROG_FAMILY_REF_PC, qui sotto) e viene applicata in un punto solo.
 *
 * La grafia dei nomi qui dentro non arriva mai all'uscita: `transposeChord`
 * riscrive il nome a ogni trasposizione, anche a distanza zero. Per questo si
 * usano sempre i diesis, e il confronto con i pool di prima e' su pitch class,
 * sigla e durata — verificato accordo per accordo (3.752) dallo script che ha
 * fatto la conversione.
 */

/**
 * Tonica di riferimento in cui e' scritta ogni famiglia di progressioni.
 * Chi non e' elencato qui usa Lam (9) per il materiale minore e Do (0) per
 * quello maggiore. Era una tabella dentro buildSong: sta con i dati che
 * descrive, ed e' l'unica copia.
 */
export const PROG_FAMILY_REF_PC = {
  pop_rock:    9,  // A / Am
  neo_soul:    2,  // Dm (dorian)
  lo_fi:       2,  // Dm
  punk:        9,  // A
  garage_rock: 4,  // E
};

const _TIPI_SEZIONE = ['intro', 'verse', 'chorus', 'bridge', 'outro'];
const _NOMI_NOTA = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** La tonica di riferimento di un pool, dal suo nome. */
function _refPcDelPool(chiave) {
  const minore = chiave.endsWith('_minor');
  const senza  = minore ? chiave.slice(0, -'_minor'.length) : chiave;
  const tipo   = _TIPI_SEZIONE.find(t => senza.endsWith(`_${t}`));
  const famiglia = tipo ? senza.slice(0, -(tipo.length + 1)) : senza;
  return PROG_FAMILY_REF_PC[famiglia] ?? (minore ? 9 : 0);
}

/** Dai gradi agli accordi, nella forma mista che il motore usa da sempre. */
function _ricostruisci(ids, refPc) {
  return ids.map(id => {
    const rec = PROGRESSIONI[id];
    return rec.gradi.map(([grado, sigla], i) => {
      const nome = _NOMI_NOTA[(refPc + grado) % 12] + sigla;
      const durata = rec.durate?.[i] ?? 1;
      return durata === 1 ? nome : [nome, durata];
    });
  });
}

export const PROGRESSION_POOLS = Object.fromEntries(
  Object.entries(POOL_INDICE).map(([chiave, ids]) => [chiave, _ricostruisci(ids, _refPcDelPool(chiave))])
);

// Legacy alias — kept for any internal references
export const PROGRESSIONS = Object.fromEntries(
  Object.entries(PROGRESSION_POOLS).map(([k, pool]) => [k, pool[0]])
);

