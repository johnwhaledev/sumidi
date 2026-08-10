#!/usr/bin/env node
/**
 * download-soundfonts.mjs
 * ─────────────────────────────────────────────────────────────────
 * Scarica in locale (cartella soundfonts/) tutti i timbri WebAudioFont
 * usati da Playback.js, così l'app non dipende più a runtime dal CDN
 * https://surikov.github.io/webaudiofontdata/ (utile per un uso offline
 * o per non dipendere per sempre da un servizio di terzi).
 *
 * Uso:
 *   node scripts/download-soundfonts.mjs
 *
 * Dopo l'esecuzione, in src/Playback.js cambia:
 *   const WAF_CDN_BASE = 'https://surikov.github.io/webaudiofontdata/sound';
 * in:
 *   const WAF_CDN_BASE = './soundfonts';
 * (e allo stesso modo WAF_PLAYER_URL se vuoi vendorizzare anche la libreria
 * player, scaricabile da https://surikov.github.io/webaudiofont/npm/dist/WebAudioFontPlayer.js)
 * ─────────────────────────────────────────────────────────────────
 */

import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'soundfonts');
const BASE = 'https://surikov.github.io/webaudiofontdata/sound';

// Program GM → codice preset (FluidR3_GM) — stessa lista di src/Playback.js.
// NOTA: dal fix "mixer override anche in anteprima", i codici usati SOLO
// dal mixer (non dai generatori) NON sono più obbligatori qui — Playback.js
// li recupera al volo dal CDN se mancano in locale. Restano elencati per
// chi preferisce un set completo scaricato in anticipo (uso offline).
const MELODIC_CODES = [
  '0000', // Piano
  '0010', // Bright Piano (mixer)
  '0040', // Rhodes
  '0050', // El. Piano 2 (mixer)
  '0060', // Harpsichord (mixer)
  '0070', // Clavinet (mixer)
  '0240', '0250', '0260', '0270', '0280', '0290', '0300', // chitarre (+ Jazz/Clean/Muted mixer)
  '0320', '0330', '0340', '0350', '0360', '0380', // bassi (+ Synth Bass mixer)
  '0400', '0410', '0420', // violino/viola/cello
  '0480', '0490', '0500', // string ensemble 1/2 (+ Synth Strings mixer)
  '0520', // Choir (mixer)
  '0610', // brass section
  '0730', // flute
];

const DRUM_NOTES = [
  35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52,
  53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 75,
];
const DRUM_VARIANTS = [0, 1, 2, 3, 4, 6];

async function fetchOk(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  const text = await res.text();
  // I file vuoti/placeholder del CDN a volte rispondono 200 con corpo vuoto
  if (!text || text.trim().length < 20) return null;
  return text;
}

async function downloadMelodic(code) {
  const fname = `${code}_FluidR3_GM_sf2_file.js`;
  const dest  = path.join(OUT_DIR, fname);
  if (await exists(dest)) { console.log(`  · ${fname} — già presente (skip)`); return; }
  const url = `${BASE}/${fname}`;
  const text = await fetchOk(url);
  if (!text) { console.warn(`  ! ${fname} — non trovato (skip)`); return; }
  await writeFile(dest, text, 'utf-8');
  console.log(`  ✓ ${fname}`);
}

async function downloadDrum(note) {
  // Se una qualunque variante per questa nota è già stata scaricata in una
  // run precedente, non serve ricontrollare le altre.
  for (const v of DRUM_VARIANTS) {
    const fname = `128${note}_${v}_FluidR3_GM_sf2_file.js`;
    if (await exists(path.join(OUT_DIR, fname))) {
      console.log(`  · ${fname} — già presente (skip)`);
      return;
    }
  }
  for (const v of DRUM_VARIANTS) {
    const fname = `128${note}_${v}_FluidR3_GM_sf2_file.js`;
    const url = `${BASE}/${fname}`;
    const text = await fetchOk(url);
    if (text) {
      await writeFile(path.join(OUT_DIR, fname), text, 'utf-8');
      console.log(`  ✓ ${fname} (nota ${note}, variante ${v})`);
      return;
    }
  }
  console.warn(`  ! nota percussiva ${note} — nessuna variante trovata (skip, resterà silenziosa)`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log(`Scarico ${MELODIC_CODES.length} timbri melodici in ${OUT_DIR}...`);
  for (const code of MELODIC_CODES) await downloadMelodic(code);

  console.log(`\nScarico timbri percussivi per ${DRUM_NOTES.length} note...`);
  for (const note of DRUM_NOTES) await downloadDrum(note);

  console.log('\nFatto. Ricorda di aggiornare WAF_CDN_BASE in src/Playback.js su "./soundfonts".');
}

main().catch(err => { console.error(err); process.exit(1); });
