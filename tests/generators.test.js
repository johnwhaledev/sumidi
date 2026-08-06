import { describe, it, expect } from 'vitest';
import { buildSong } from '../src/SongArchitect.js';
import { generateChords } from '../src/ChordGenerator.js';
import { generateBass } from '../src/BassGenerator.js';
import { generateGuitar } from '../src/GuitarGenerator.js';
import { generatePiano } from '../src/PianoGenerator.js';
import { generateDrums } from '../src/Percussionist.js';
import { generateEnsemble } from '../src/EnsembleGenerator.js';
import { buildDrumContext } from '../src/FlowCore.js';

// Smoke test end-to-end: per ogni generatore, verifica che a partire da un
// blueprint reale (buildSong) produca eventi validi senza eccezioni, sui
// principali stili storici e su quelli toccati dalle sessioni V2/V3.
const STYLES_TO_CHECK = ['unplugged', 'jazz_ballad', 'bossa_nova', 'punk', 'garage_rock', 'chiptune'];

function assertValidEvents(events, label) {
  expect(Array.isArray(events), `${label}: non è un array`).toBe(true);
  for (const ev of events) {
    expect(typeof ev.tick, `${label}: tick non numerico`).toBe('number');
    expect(ev.tick).toBeGreaterThanOrEqual(0);
  }
}

describe('Generatori — smoke test su blueprint reale', () => {
  for (const style of STYLES_TO_CHECK) {
    it(`ChordGenerator + BassGenerator + GuitarGenerator + PianoGenerator + Percussionist non crashano per '${style}'`, () => {
      const bp = buildSong({ style, seed: 999 });

      const chords = generateChords(bp);
      assertValidEvents(chords.events, 'ChordGenerator');

      const drumEvents = generateDrums(bp);
      assertValidEvents(drumEvents, 'Percussionist');

      const drumContext = buildDrumContext(drumEvents, bp.meta.ppq, bp.meta.barTicks);

      const bass = generateBass(bp, drumContext);
      assertValidEvents(bass.events, 'BassGenerator');

      const guitar = generateGuitar(bp, drumContext);
      assertValidEvents(guitar.events, 'GuitarGenerator');

      const piano = generatePiano(bp, drumContext);
      assertValidEvents(piano.events, 'PianoGenerator');
    });
  }
});

function totalEnsembleEvents(res) {
  // generateEnsemble ritorna { voiceEvents: [[...],[...],[...]], ... }
  return (res.voiceEvents ?? []).reduce((sum, voice) => sum + voice.length, 0);
}

describe('EnsembleGenerator — guard V3 su punk/garage_rock/chiptune', () => {
  it('non genera eventi d\'ensemble per punk/garage_rock/chiptune (disattivazione esplicita)', () => {
    for (const style of ['punk', 'garage_rock', 'chiptune']) {
      const bp = buildSong({ style, seed: 1 });
      const res = generateEnsemble(bp);
      expect(totalEnsembleEvents(res), `ensemble dovrebbe essere disattivato per ${style}`).toBe(0);
    }
  });

  it('genera eventi d\'ensemble per uno stile che lo prevede (es. cinematic)', () => {
    const bp = buildSong({ style: 'cinematic', seed: 1 });
    const res = generateEnsemble(bp);
    expect(totalEnsembleEvents(res)).toBeGreaterThan(0);
  });
});
