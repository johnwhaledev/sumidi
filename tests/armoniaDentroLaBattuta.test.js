import { describe, it, expect } from 'vitest';
import { regioniDellaBattuta, finestraAlTick, buildDrumContext } from '../src/FlowCore.js';
import { buildSong, buildHarmonicMap } from '../src/SongArchitect.js';
import { generateBass } from '../src/BassGenerator.js';
import { generateGuitar } from '../src/GuitarGenerator.js';
import { generatePiano } from '../src/PianoGenerator.js';
import { generateEnsemble } from '../src/EnsembleGenerator.js';
import { generateChords } from '../src/ChordGenerator.js';
import { generateDrums } from '../src/Percussionist.js';

// A1b di PLAN37 — i generatori seguono l'armonia dentro la battuta. Basso,
// chitarra, piano ed ensemble risolvevano la regione armonica una volta sola a
// inizio bar (`harmonicMap.find(r => r.start_tick <= barStart …)`) e ci
// costruivano sopra tutti e quattro i beat: su `| Dm7 G7 |` — che la griglia
// incollata di A4 sa scrivere — solo il pad suonava il secondo accordo.

const PPQ = 480;
const BAR = PPQ * 4;

const mappa = progressione =>
  buildHarmonicMap(progressione, 0, progressione.reduce(
    (n, v) => n + (Array.isArray(v) ? v[1] : 1), 0), PPQ, BAR);

describe('regioniDellaBattuta — la lista da cui i generatori pescano', () => {

  it('un accordo per battuta: una regione sola, che copre tutta la battuta', () => {
    const spans = regioniDellaBattuta(mappa(['Am', 'F']), 0, BAR);
    expect(spans).toHaveLength(1);
    expect(spans[0].region.chord).toBe('Am');
    expect(spans[0].inizio).toBe(0);
    expect(spans[0].fine).toBe(BAR);
  });

  it('due accordi nella stessa battuta: due regioni, una per metà', () => {
    const spans = regioniDellaBattuta(mappa([['Dm7', 0.5], ['G7', 0.5]]), 0, BAR);
    expect(spans.map(s => s.region.chord)).toEqual(['Dm7', 'G7']);
    expect(spans.map(s => [s.inizio, s.fine])).toEqual([[0, BAR / 2], [BAR / 2, BAR]]);
  });

  it('un accordo lungo due battute vale per tutte e due', () => {
    const hm = mappa([['Am7', 2], ['D7', 2]]);
    expect(regioniDellaBattuta(hm, 0, BAR)[0].region.chord).toBe('Am7');
    expect(regioniDellaBattuta(hm, BAR, BAR * 2)[0].region.chord).toBe('Am7');
    expect(regioniDellaBattuta(hm, BAR * 2, BAR * 3)[0].region.chord).toBe('D7');
  });

  it('fuori dalla mappa vale la prima regione, come il vecchio ripiego', () => {
    const hm = mappa(['Am', 'F']);
    const spans = regioniDellaBattuta(hm, BAR * 9, BAR * 10);
    expect(spans).toHaveLength(1);
    expect(spans[0].region.chord).toBe('Am');
  });

  it('finestraAlTick: la regione del tick, e la più vicina per chi sta fuori', () => {
    const spans = regioniDellaBattuta(mappa([['Dm7', 0.5], ['G7', 0.5]]), 0, BAR);
    expect(finestraAlTick(spans, 0).region.chord).toBe('Dm7');
    expect(finestraAlTick(spans, BAR / 2 - 1).region.chord).toBe('Dm7');
    expect(finestraAlTick(spans, BAR / 2).region.chord).toBe('G7');
    // Uno slide che parte prima del downbeat, un'anticipazione dopo l'ultimo
    // beat: prendono la prima e l'ultima invece di restare senza armonia.
    expect(finestraAlTick(spans, -40).region.chord).toBe('Dm7');
    expect(finestraAlTick(spans, BAR + 40).region.chord).toBe('G7');
  });
});

// ── I generatori su una griglia | Dm7 G7 | ────────────────────────────────
// Le note misurate il 2026-09-01 su folk/4242: la seconda metà della battuta
// aveva 12 note del Dm7 e 0 del G7 su chitarra e piano.

const DM7_SOLO = [9, 0];   // LA, DO — nel Dm7 e non nel G7
const G7_SOLO  = [7, 11];  // SOL, SI — nel G7 e non nel Dm7

function partiConGriglia(style, seed) {
  const bp = buildSong({ style, key: 'Am', bpm: 90, seed });
  const quante = s => ['bass', 'guitar', 'piano', 'ensemble'].filter(m => s.modules?.[m]?.active).length;
  const sec = [...bp.sections].sort((a, b) => quante(b) - quante(a))[0];
  // Prima battuta | Dm7 G7 |, le altre un accordo per battuta
  const griglia = [];
  for (let b = 0; b < sec.bars; b++) griglia.push(...(b === 0 ? [['Dm7', 0.5], ['G7', 0.5]] : ['Cmaj7']));
  sec.progression  = griglia;
  sec.harmonicMap  = buildHarmonicMap(griglia, sec.startTick, sec.bars, bp.meta.ppq, bp.meta.barTicks);

  const ctx = buildDrumContext(generateDrums(bp), bp.meta.ppq, bp.meta.barTicks);
  return {
    sec,
    barTicks: bp.meta.barTicks,
    parti: {
      basso:    generateBass(bp, ctx, seed).events,
      chitarra: generateGuitar(bp, ctx, seed).events,
      piano:    generatePiano(bp, ctx, seed).events,
      pad:      generateChords(bp).events,
      ensemble: generateEnsemble(bp, seed).voiceEvents.flat(),
    },
  };
}

/** Le pitch class suonate nella seconda metà della prima battuta. */
function secondaMeta(eventi, sec, barTicks) {
  const da = sec.startTick + barTicks / 2, a = da + barTicks / 2;
  return eventi
    .filter(e => e.cc == null && e.note != null && e.tick >= da && e.tick < a)
    .map(e => e.note % 12);
}

describe('| Dm7 G7 | — la seconda metà è il G7, per tutti', () => {

  it('folk: chitarra, piano, pad ed ensemble suonano il G7 e non più il Dm7', () => {
    const { parti, sec, barTicks } = partiConGriglia('folk', 4242);
    for (const parte of ['chitarra', 'piano', 'pad', 'ensemble']) {
      const pcs = secondaMeta(parti[parte], sec, barTicks);
      expect(pcs.length, `${parte} non suona nella seconda metà`).toBeGreaterThan(0);
      expect(pcs.filter(pc => G7_SOLO.includes(pc)).length,
        `${parte}: nessuna nota del G7`).toBeGreaterThan(0);
      expect(pcs.filter(pc => DM7_SOLO.includes(pc)),
        `${parte}: suona ancora le note del Dm7`).toEqual([]);
    }
  });

  it('folk: il basso arriva sul G7 (le note di passaggio restano sue)', () => {
    const { parti, sec, barTicks } = partiConGriglia('folk', 4242);
    const pcs = secondaMeta(parti.basso, sec, barTicks);
    expect(pcs.filter(pc => G7_SOLO.includes(pc)).length).toBeGreaterThan(0);
  });

  it('pop_rock e neo_soul: nessuno resta fermo sul primo accordo', () => {
    for (const style of ['pop_rock', 'neo_soul']) {
      const { parti, sec, barTicks } = partiConGriglia(style, 4242);
      for (const parte of ['chitarra', 'piano', 'pad', 'ensemble']) {
        const pcs = secondaMeta(parti[parte], sec, barTicks);
        if (!pcs.length) continue;   // strumento spento in questa sezione
        expect(pcs.filter(pc => G7_SOLO.includes(pc)).length,
          `${style}/${parte}: nessuna nota del G7`).toBeGreaterThan(0);
      }
    }
  });
});
