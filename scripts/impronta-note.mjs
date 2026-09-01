#!/usr/bin/env node
/**
 * impronta-note.mjs — l'impronta di tutte le note generate
 * ─────────────────────────────────────────────────────────────────
 * La rete di sicurezza per i lavori che toccano i generatori: 13 stili x 4 seed
 * x 2 tonalità, tutti gli strumenti, ~275.000 note. Se una modifica non deve
 * cambiare la musica, questo lo dimostra in tre secondi; se deve cambiarla solo
 * in un punto, questo dice esattamente dove.
 *
 * Uso:
 *   node scripts/impronta-note.mjs                        → conteggio e SHA-256
 *   node scripts/impronta-note.mjs --scrivi prima.txt     → salva l'impronta
 *   node scripts/impronta-note.mjs --confronta prima.txt  → diff con un'impronta salvata
 *
 * Nel confronto stampa quante note differiscono e le prime differenze nella
 * forma `stile:tonalità:seed:strumento:tick:nota:velocity:durata`, così si vede
 * subito SE la differenza è dove doveva essere.
 * ─────────────────────────────────────────────────────────────────
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(QUI, '..', 'src');
const u = f => pathToFileURL(path.join(SRC, f)).href;

const { buildSong, STYLES } = await import(u('SongArchitect.js'));
const { generateBass }      = await import(u('BassGenerator.js'));
const { generateGuitar }    = await import(u('GuitarGenerator.js'));
const { generatePiano }     = await import(u('PianoGenerator.js'));
const { generateEnsemble }  = await import(u('EnsembleGenerator.js'));
const { generateChords }    = await import(u('ChordGenerator.js'));
const { generateDrums }     = await import(u('Percussionist.js'));
const { buildDrumContext }  = await import(u('FlowCore.js'));

const SEEDS = [4242, 777, 31337, 90210];
const KEYS  = ['Am', 'C'];

const righe = [];
for (const style of Object.keys(STYLES)) {
  for (const seed of SEEDS) {
    for (const key of KEYS) {
      const bp  = buildSong({ style, key, bpm: 90, seed });
      const ctx = buildDrumContext(generateDrums(bp), bp.meta.ppq, bp.meta.barTicks);
      const strumenti = {
        bass:   generateBass(bp, ctx, seed).events,
        guitar: generateGuitar(bp, ctx, seed).events,
        piano:  generatePiano(bp, ctx, seed).events,
        chords: generateChords(bp).events,
        ens:    generateEnsemble(bp, seed).voiceEvents.flat(),
      };
      for (const [strumento, eventi] of Object.entries(strumenti)) {
        for (const e of eventi) {
          if (e.note == null || e.cc != null) continue;
          righe.push(`${style}:${key}:${seed}:${strumento}:${e.tick}:${e.note}:${e.velocity}:${e.duration}`);
        }
      }
    }
  }
}

const testo = righe.join('\n');
const sha = crypto.createHash('sha256').update(testo).digest('hex').slice(0, 24);
console.log(`${righe.length} note | sha ${sha}`);

const iScrivi = process.argv.indexOf('--scrivi');
if (iScrivi > -1 && process.argv[iScrivi + 1]) {
  fs.writeFileSync(process.argv[iScrivi + 1], testo);
  console.log(`impronta salvata in ${process.argv[iScrivi + 1]}`);
}

const iConfronta = process.argv.indexOf('--confronta');
if (iConfronta > -1 && process.argv[iConfronta + 1]) {
  const prima = fs.readFileSync(process.argv[iConfronta + 1], 'utf8').split('\n');
  if (prima.length === righe.length && prima.every((r, i) => r === righe[i])) {
    console.log('IDENTICA: nessuna nota cambiata');
    process.exit(0);
  }
  const diverse = [];
  for (let i = 0; i < Math.max(prima.length, righe.length); i++) {
    if (prima[i] !== righe[i]) diverse.push(`  - ${prima[i] ?? '(assente)'}\n  + ${righe[i] ?? '(assente)'}`);
  }
  console.log(`DIVERSA: ${diverse.length} note su ${Math.max(prima.length, righe.length)}`);
  // Per stile, cosi' si vede subito se la differenza e' dove doveva essere
  const perStile = {};
  for (let i = 0; i < Math.max(prima.length, righe.length); i++) {
    if (prima[i] === righe[i]) continue;
    const stile = (righe[i] ?? prima[i]).split(':')[0];
    perStile[stile] = (perStile[stile] ?? 0) + 1;
  }
  for (const [stile, n] of Object.entries(perStile)) console.log(`  ${stile.padEnd(18)} ${n}`);
  console.log('\nprime differenze:');
  console.log(diverse.slice(0, 5).join('\n'));
  process.exit(1);
}
