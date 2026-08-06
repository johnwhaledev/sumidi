import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createGlide, BASS_GLIDE_PROFILE, STRINGS_GLIDE_PROFILE } from '../src/Ornaments.js';

// Sessione R4 (PLAN35): createGlide() sostituisce createSlide() (BassGenerator)
// e createPortamento() (EnsembleGenerator) con un motore condiviso guidato da
// "profili" per strumento. Questo test confronta byte-a-byte l'output del
// nuovo motore con l'output catturato dalle funzioni originali PRIMA del
// refactor (tests/fixtures/golden_ornaments.json), per garantire zero
// scostamento sonoro: stessa musica, codice non duplicato.

const __dirname = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'golden_ornaments.json'), 'utf8')
);

describe('R4 — createGlide() riproduce esattamente createSlide()/createPortamento() originali', () => {
  golden.cases.forEach((args, i) => {
    it(`createSlide (bass) — caso ${i}: [${args.join(', ')}]`, () => {
      const actual = createGlide(...args, BASS_GLIDE_PROFILE);
      expect(actual).toEqual(golden.results.createSlide[i]);
    });
  });

  golden.cases.forEach((args, i) => {
    it(`createPortamento (archi) — caso ${i}: [${args.join(', ')}]`, () => {
      const actual = createGlide(...args, STRINGS_GLIDE_PROFILE);
      expect(actual).toEqual(golden.results.createPortamento[i]);
    });
  });
});

describe('R4 — comportamento generico del motore createGlide()', () => {
  it('sotto la soglia minima di semitoni (profilo archi) produce una singola nota diretta', () => {
    const events = createGlide(60, 61, 0, 480, 90, 120, 480, STRINGS_GLIDE_PROFILE);
    expect(events).toEqual([{ tick: 0, note: 61, velocity: 90, duration: 480 }]);
  });

  it('il profilo del basso non ha soglia minima: anche 1 semitono genera un glissando a piu note', () => {
    const events = createGlide(60, 61, 0, 480, 90, 120, 480, BASS_GLIDE_PROFILE);
    expect(events.length).toBeGreaterThan(1);
    expect(events[0].note).toBe(60);
    expect(events[events.length - 1].note).toBe(61);
  });

  it('funziona in entrambe le direzioni (ascendente e discendente) senza asimmetrie di arrotondamento', () => {
    const up = createGlide(40, 43, 0, 480, 90, 120, 480, BASS_GLIDE_PROFILE);
    const down = createGlide(43, 40, 0, 480, 90, 120, 480, BASS_GLIDE_PROFILE);
    // Le note intermedie devono essere simmetriche rispetto alla direzione.
    const upNotes = up.map(e => e.note);
    const downNotes = down.map(e => e.note);
    expect(upNotes).toEqual([40, 42, 43]);
    expect(downNotes).toEqual([43, 41, 40]);
  });
});
