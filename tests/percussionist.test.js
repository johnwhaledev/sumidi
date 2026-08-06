import { describe, it, expect } from 'vitest';
import { buildSong } from '../src/SongArchitect.js';
import { generateDrums, STYLE_PATTERNS, GROOVE_PARAMS } from '../src/Percussionist.js';

// Test di regressione per la sessione V3 (PLAN35): punk, garage_rock e chiptune
// dovevano ottenere 3 livelli di energia (low/mid/high) realmente distinti,
// invece dei pattern piatti/fallback di prima.
const NEW_STYLES = ['punk', 'garage_rock', 'chiptune'];

describe('Percussionist — groove dedicato per punk/garage_rock/chiptune (V3)', () => {
  for (const style of NEW_STYLES) {
    it(`STYLE_PATTERNS['${style}'] esiste con 3 livelli distinti`, () => {
      const map = STYLE_PATTERNS[style];
      expect(map, `manca STYLE_PATTERNS['${style}']`).toBeDefined();
      expect(map.low).toBeDefined();
      expect(map.mid).toBeDefined();
      expect(map.high).toBeDefined();
      // I 3 livelli non devono più puntare tutti allo stesso pattern (era il bug originale).
      expect(new Set([map.low, map.mid, map.high]).size).toBe(3);
    });

    it(`i pattern low/mid/high di '${style}' esistono in GROOVE_PARAMS`, () => {
      const map = STYLE_PATTERNS[style];
      for (const level of ['low', 'mid', 'high']) {
        expect(GROOVE_PARAMS[map[level]], `manca pattern GROOVE_PARAMS['${map[level]}']`).toBeDefined();
      }
    });
  }

  it('garage_rock non ricade più sul fallback generico "rock"', () => {
    expect(STYLE_PATTERNS.garage_rock).toBeDefined();
    expect(STYLE_PATTERNS.garage_rock).not.toBe(STYLE_PATTERNS.rock);
  });

  for (const style of NEW_STYLES) {
    it(`generateDrums produce output diverso tra energia bassa e alta per '${style}'`, () => {
      const bpLow = buildSong({ style, seed: 42 });
      for (const s of bpLow.sections) s.energy = 2; // forza energia bassa
      const bpHigh = buildSong({ style, seed: 42 });
      for (const s of bpHigh.sections) s.energy = 9; // forza energia alta

      const eventsLow = generateDrums(bpLow);
      const eventsHigh = generateDrums(bpHigh);

      expect(Array.isArray(eventsLow)).toBe(true);
      expect(Array.isArray(eventsHigh)).toBe(true);
      // Non deve crashare, e il conteggio eventi non deve essere identico
      // (altrimenti l'energia non starebbe influenzando davvero il groove).
      expect(eventsLow.length).not.toBe(eventsHigh.length);
    });
  }
});
