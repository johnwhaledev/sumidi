import { describe, it, expect } from 'vitest';
import { CHORD_INTERVALS, SCALE_INTERVALS, PITCH_CLASS } from '../src/ChordTheory.js';
import { PROGRESSION_POOLS, PROGRESSIONS } from '../src/SongProgressions.js';
import { SONG_FORMS } from '../src/SongForms.js';
import { SECTION_PRESETS } from '../src/SectionPresets.js';
import { STYLES } from '../src/Styles.js';

// Sessione R1 (PLAN35): verifica che i 5 moduli-dati estratti da
// SongArchitect.js siano importabili in modo indipendente e non vuoti —
// regressione diretta contro un'estrazione fatta a metà o un file corrotto.
describe('Moduli dati estratti da SongArchitect.js (R1)', () => {
  it('ChordTheory.js espone teoria armonica di base', () => {
    expect(Object.keys(CHORD_INTERVALS).length).toBeGreaterThan(0);
    expect(Object.keys(SCALE_INTERVALS).length).toBeGreaterThan(0);
    // Include entrambe le grafie enarmoniche (es. C# e Db), quindi >12 chiavi.
    expect(Object.keys(PITCH_CLASS).length).toBeGreaterThanOrEqual(12);
  });

  it('SongProgressions.js espone i pool di progressioni', () => {
    expect(Object.keys(PROGRESSION_POOLS).length).toBeGreaterThan(0);
    expect(Object.keys(PROGRESSIONS).length).toBe(Object.keys(PROGRESSION_POOLS).length);
  });

  it('SongForms.js espone le forme di canzone', () => {
    expect(Object.keys(SONG_FORMS).length).toBeGreaterThan(0);
  });

  it('SectionPresets.js espone i preset di sezione', () => {
    expect(Object.keys(SECTION_PRESETS).length).toBeGreaterThan(0);
  });

  it('Styles.js espone tutti i 16 generi', () => {
    expect(Object.keys(STYLES).length).toBe(16);
    for (const style of ['punk', 'garage_rock', 'chiptune', 'latin', 'cinematic', 'reggae']) {
      expect(STYLES[style], `manca STYLES['${style}']`).toBeDefined();
    }
  });
});
