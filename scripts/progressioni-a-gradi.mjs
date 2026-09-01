/**
 * progressioni-a-gradi.mjs — conversione una-tantum dei pool di progressioni
 * (D1 di PLAN37).
 *
 * Legge i pool letterali di `SongProgressions.js`, li converte in gradi
 * rispetto alla tonica di riferimento della famiglia e scrive
 * `src/ProgressioniGradi.js`: una tabella di progressioni uniche piu' un
 * indice pool → id, che conserva l'ordine (il seed pesca per indice, quindi
 * l'ordine e' musica).
 *
 * Uso:  node scripts/progressioni-a-gradi.mjs [--scrivi]
 * Senza `--scrivi` fa solo la verifica di round-trip e non tocca niente.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const QUI  = path.dirname(fileURLToPath(import.meta.url));
const SRC  = path.join(QUI, '..', 'src');
const { PROGRESSION_POOLS } = await import(pathToFileURL(path.join(SRC, 'SongProgressions.js')).href);
const { PITCH_CLASS } = await import(pathToFileURL(path.join(SRC, 'ChordTheory.js')).href);

/** Tonica di riferimento per famiglia — la stessa tabella che usa buildSong. */
const REF_PC = { pop_rock: 9, neo_soul: 2, lo_fi: 2, punk: 9, garage_rock: 4 };

const TIPI = ['intro', 'verse', 'chorus', 'bridge', 'outro'];

/** unplugged_intro_minor → { famiglia: 'unplugged', tipo: 'intro', minore: true } */
function leggiChiave(chiave) {
  const minore = chiave.endsWith('_minor');
  const senza  = minore ? chiave.slice(0, -'_minor'.length) : chiave;
  const tipo   = TIPI.find(t => senza.endsWith(`_${t}`));
  if (!tipo) throw new Error(`chiave di pool non riconosciuta: ${chiave}`);
  return { famiglia: senza.slice(0, -(tipo.length + 1)), tipo, minore };
}

/** 'Am7' → { pc: 9, sigla: 'm7' } */
function leggiAccordo(nome) {
  const m = nome.match(/^([A-G][#b]?)(.*)$/);
  if (!m) throw new Error(`accordo non riconosciuto: ${nome}`);
  const pc = PITCH_CLASS[m[1]];
  if (pc == null) throw new Error(`nota non riconosciuta: ${nome}`);
  return { pc, sigla: m[2] };
}

const NOMI = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// ── Conversione ───────────────────────────────────────────────────

const progressioni = new Map();   // firma → { id, gradi, durate, modo, usata }
const indice       = {};          // chiave pool → [id, ...]
let contatore = 0;

for (const [chiave, pool] of Object.entries(PROGRESSION_POOLS)) {
  const { famiglia, minore } = leggiChiave(chiave);
  const refPc = REF_PC[famiglia] ?? (minore ? 9 : 0);
  indice[chiave] = [];

  for (const prog of pool) {
    const gradi = [], durate = [];
    for (const voce of prog) {
      const nome   = Array.isArray(voce) ? voce[0] : voce;
      const durata = Array.isArray(voce) ? voce[1] : 1;
      const { pc, sigla } = leggiAccordo(nome);
      gradi.push([(pc - refPc + 12) % 12, sigla]);
      durate.push(durata);
    }
    const modo   = minore ? 'minore' : 'maggiore';
    const firma  = JSON.stringify([modo, gradi, durate]);
    let rec = progressioni.get(firma);
    if (!rec) {
      rec = { id: `p${String(++contatore).padStart(3, '0')}`, gradi, durate, modo, usata: 0 };
      progressioni.set(firma, rec);
    }
    rec.usata++;
    indice[chiave].push(rec.id);
  }
}

// ── Verifica di round-trip ────────────────────────────────────────
// Si ricostruiscono i pool dai gradi e si confrontano con quelli di partenza.
// Il confronto e' su pitch class + sigla + durata, non sulla stringa: la
// grafia (Bb contro A#) non arriva mai all'uscita, perche' `transposeChord`
// riscrive il nome a ogni trasposizione, anche a distanza zero.

const perId = new Map([...progressioni.values()].map(r => [r.id, r]));
let controllati = 0;
const errori = [];

for (const [chiave, pool] of Object.entries(PROGRESSION_POOLS)) {
  const { famiglia, minore } = leggiChiave(chiave);
  const refPc = REF_PC[famiglia] ?? (minore ? 9 : 0);
  if (indice[chiave].length !== pool.length) {
    errori.push(`${chiave}: ${indice[chiave].length} progressioni invece di ${pool.length}`);
    continue;
  }
  pool.forEach((prog, i) => {
    const rec = perId.get(indice[chiave][i]);
    if (prog.length !== rec.gradi.length) {
      errori.push(`${chiave}[${i}]: lunghezza diversa`);
      return;
    }
    prog.forEach((voce, j) => {
      const nome   = Array.isArray(voce) ? voce[0] : voce;
      const durata = Array.isArray(voce) ? voce[1] : 1;
      const atteso = leggiAccordo(nome);
      const [grado, sigla] = rec.gradi[j];
      const pcRicostruito = (refPc + grado) % 12;
      controllati++;
      if (pcRicostruito !== atteso.pc || sigla !== atteso.sigla || durata !== rec.durate[j]) {
        errori.push(`${chiave}[${i}][${j}]: ${nome} → ${NOMI[pcRicostruito]}${sigla} (durata ${rec.durate[j]} invece di ${durata})`);
      }
    });
  });
}

console.log(`pool ${Object.keys(PROGRESSION_POOLS).length} | progressioni ${Object.values(PROGRESSION_POOLS).reduce((n, p) => n + p.length, 0)} → record unici ${progressioni.size} | accordi verificati ${controllati}`);
const doppie = [...progressioni.values()].filter(r => r.usata > 1);
console.log(`record usati da piu' di un pool: ${doppie.length} (${doppie.reduce((n, r) => n + r.usata - 1, 0)} copie risparmiate)`);
if (errori.length) {
  console.error(`\nROUND-TRIP FALLITO: ${errori.length} differenze`);
  console.error(errori.slice(0, 10).join('\n'));
  process.exit(1);
}
console.log('round-trip: identico, accordo per accordo');

// ── Scrittura ─────────────────────────────────────────────────────

if (!process.argv.includes('--scrivi')) {
  console.log('\n(esecuzione di sola verifica: rilancia con --scrivi per generare il file)');
  process.exit(0);
}

const righeProg = [...progressioni.values()].map(r => {
  const gradi = r.gradi.map(([g, s]) => `[${g},${JSON.stringify(s)}]`).join(',');
  const durate = r.durate.every(d => d === 1) ? '' : `, durate: [${r.durate.join(',')}]`;
  return `  ${r.id}: { modo: '${r.modo}', gradi: [${gradi}]${durate} },`;
}).join('\n');

const righeIndice = Object.entries(indice).map(([chiave, ids]) =>
  `  ${chiave}: [${ids.map(id => `'${id}'`).join(', ')}],`).join('\n');

const contenuto = `/**
 * ProgressioniGradi.js — le progressioni scritte in GRADI, non in accordi
 * ─────────────────────────────────────────────────────────────────
 * D1 di PLAN37. Prima le 940 progressioni erano letterali di accordi concreti
 * scritti in una tonalita' di riferimento che cambiava per famiglia (Do/Lam per
 * i pool storici, La per pop_rock e punk, Mi per garage_rock, Rem per neo_soul
 * e lo_fi): i gradi esistevano solo nei commenti, la stessa progressione era
 * copiata fino a 25 volte, e chi aggiungeva uno stile doveva ricordarsi a mente
 * la tonalita' di riferimento — se la sbagliava il bug non si vedeva (accordi in
 * una tonalita', scala in un'altra: il "punk stonato" del 20 agosto).
 *
 * FORMATO. Ogni progressione e' un record con:
 *   modo    — 'maggiore' | 'minore', cioe' da quale dei due pool viene
 *   gradi   — [semitoni dalla tonica, sigla dell'accordo] per ogni accordo
 *   durate  — battute per accordo; assente = tutte da una battuta
 * L'indice \`POOL_INDICE\` dice quali record stanno in quale pool **e in che
 * ordine**: l'ordine e' musica, perche' il seed pesca per indice.
 *
 * NON SI MODIFICA A MANO. E' generato da \`scripts/progressioni-a-gradi.mjs\`
 * a partire dai pool letterali; il round-trip (ricostruire gli accordi dai
 * gradi e confrontarli con i pool di partenza) e' verificato accordo per
 * accordo dallo script. La ricostruzione a runtime vive in
 * \`SongProgressions.js\`, che continua a esportare \`PROGRESSION_POOLS\` nella
 * forma di sempre: nessun consumatore e' cambiato.
 */

/** Le progressioni uniche: ${progressioni.size} record per ${Object.values(PROGRESSION_POOLS).reduce((n, p) => n + p.length, 0)} usi. */
export const PROGRESSIONI = {
${righeProg}
};

/** Quali progressioni stanno in quale pool, nell'ordine che conta. */
export const POOL_INDICE = {
${righeIndice}
};
`;

fs.writeFileSync(path.join(SRC, 'ProgressioniGradi.js'), contenuto);
console.log(`scritto src/ProgressioniGradi.js (${(contenuto.length / 1024).toFixed(1)} KB)`);
