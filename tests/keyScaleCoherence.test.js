import { describe, it, expect } from 'vitest';
import { buildSong, buildScalePool, STYLES } from '../src/SongArchitect.js';

// ─────────────────────────────────────────────────────────────────────────────
// Regressione: coerenza fra ACCORDI e SCALA GLOBALE (meta.keyScaleNotes)
//
// Il bug corretto il 2026-08-20 (effectiveTonicPc in SongArchitect.js) faceva
// convivere due tonalità nello stesso brano: sugli stili non mode-aware gli
// accordi venivano trasposti sulla RELATIVA della tonalità richiesta, mentre
// keyScaleNotes restava ancorata alla radice richiesta con la scala dello
// stile. Risultato: unplugged in Do maggiore dava accordi in La minore e scala
// melodica in Do minore, con il 48% delle note d'accordo fuori dal pool.
//
// keyScaleNotes non è un dato di comodo: BassGenerator (hook), GuitarGenerator
// (riff), PianoGenerator (hook) ed EnsembleGenerator ci pescano le note
// melodiche. Se non concorda con gli accordi, il brano stona per costruzione.
//
// È la SECONDA volta che questa classe di bug si presenta (la prima era il
// "punk stonato", sul versante accordi anziché scala), da qui il test.
//
// METODO — deriva dallo script di misura della sessione 2026-08-20:
// 13 stili × 8 seed × 2 tonalità richieste (Do maggiore e La minore), si conta
// la quota di note d'accordo fuori da keyScaleNotes. Si lavora su PITCH CLASS
// (rootPc + chord_degrees dell'harmonicMap) e non su note MIDI: chord_tones è
// filtrato su un registro fisso, quindi il suo conteggio cambia con la
// trasposizione e renderebbe il confronto fra le due tonalità non esatto.
// ─────────────────────────────────────────────────────────────────────────────

const SEEDS = [11, 22, 33, 44, 55, 66, 77, 88];

/** Quota di note d'accordo fuori dalla scala globale, su tutti i SEEDS. */
function misuraFuoriScala(style, key) {
  let fuori = 0;
  let totali = 0;
  let scale = null;

  for (const seed of SEEDS) {
    const bp = buildSong({ style, key, seed });
    const poolPc = new Set((bp.meta.keyScaleNotes ?? []).map(n => n % 12));
    expect(poolPc.size, `${style}/${key}: keyScaleNotes vuota`).toBeGreaterThan(0);
    scale = bp.meta.scale;

    for (const sezione of bp.sections) {
      for (const regione of sezione.harmonicMap ?? []) {
        for (const intervallo of regione.chord_degrees ?? []) {
          totali++;
          if (!poolPc.has((regione.rootPc + intervallo) % 12)) fuori++;
        }
      }
    }
  }

  expect(totali, `${style}/${key}: nessun accordo generato`).toBeGreaterThan(0);
  return { fuori, totali, scale, quota: fuori / totali };
}

describe('coerenza accordi ↔ keyScaleNotes', () => {
  for (const style of Object.keys(STYLES)) {
    it(`"${style}": la quota di note fuori scala non dipende dal modo richiesto`, () => {
      const maggiore = misuraFuoriScala(style, 'C');
      const minore = misuraFuoriScala(style, 'Am');

      // Uno stile è mode-aware se la scala consegnata segue davvero la tonalità
      // richiesta. Si ricava a runtime invece di duplicare qui la lista
      // MODE_AWARE_FAMILIES, che è interna a buildSong e cambia nel tempo.
      const modeAware = maggiore.scale !== minore.scale;

      if (modeAware) {
        // Pool distinti per i due modi: un po' di differenza è fisiologica.
        // Misurato il 2026-08-20: da −3,49 a +2,96 punti. Soglia a 5 punti.
        const delta = Math.abs(minore.quota - maggiore.quota) * 100;
        expect(delta, `${style}: delta ${delta.toFixed(2)} punti fra i due modi`)
          .toBeLessThanOrEqual(5);
      } else {
        // Stesso pool trasposto: gli accordi e la scala si spostano insieme,
        // quindi i conteggi devono coincidere ESATTAMENTE. È qui che il bug
        // si manifestava (unplugged: 10% richiedendo minore, 48% maggiore).
        expect(
          [minore.fuori, minore.totali],
          `${style}: conteggi diversi fra Do maggiore e La minore`,
        ).toEqual([maggiore.fuori, maggiore.totali]);
      }
    });
  }
});

describe('keyScaleNotes è ancorata alla tonica effettiva del materiale', () => {
  for (const style of Object.keys(STYLES)) {
    for (const key of ['C', 'Am']) {
      it(`"${style}" in ${key}: keyScaleNotes = scala su effectiveTonicPc`, () => {
        const bp = buildSong({ style, key, seed: 4242 });

        expect(bp.meta.effectiveTonicPc, 'effectiveTonicPc assente dai meta')
          .toBeTypeOf('number');

        // La riga corretta nel fix: buildScalePool(effectiveTonicPc, ...).
        // Se qualcuno la riporta a keyInfo.rootPc, qui si vede subito.
        const atteso = buildScalePool(bp.meta.effectiveTonicPc, bp.meta.scale, 36, 96);
        expect(bp.meta.keyScaleNotes).toEqual(atteso);
      });
    }
  }
});
