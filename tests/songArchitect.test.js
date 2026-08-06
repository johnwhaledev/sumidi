import { describe, it, expect } from 'vitest';
import { buildSong, STYLES } from '../src/SongArchitect.js';

// Stili rappresentativi: alcuni storici, alcuni recenti (toccati da V2/V3).
const SAMPLE_STYLES = [
  'unplugged', 'jazz_ballad', 'blues_rock', 'bossa_nova',
  'latin', 'cinematic', 'reggae', 'lo_fi',
  'punk', 'garage_rock', 'chiptune',
];

describe('buildSong — smoke test su tutti gli stili', () => {
  it('STYLES contiene tutti gli stili di esempio', () => {
    for (const style of SAMPLE_STYLES) {
      expect(STYLES[style], `stile mancante: ${style}`).toBeDefined();
    }
  });

  for (const style of SAMPLE_STYLES) {
    it(`genera una struttura valida per "${style}"`, () => {
      const bp = buildSong({ style, seed: 12345 });

      expect(bp).toBeTruthy();
      expect(Array.isArray(bp.sections)).toBe(true);
      expect(bp.sections.length).toBeGreaterThan(0);
      expect(bp.meta).toBeTruthy();
      expect(bp.meta.ppq).toBeGreaterThan(0);
      expect(bp.meta.bpm).toBeGreaterThan(0);

      for (const section of bp.sections) {
        expect(section.bars).toBeGreaterThan(0);
        expect(section.modules).toBeTruthy();
        expect(Array.isArray(section.harmonicMap)).toBe(true);
        expect(section.harmonicMap.length).toBeGreaterThan(0);
      }
    });
  }
});

describe('buildSong — determinismo del seed (base della feature "Lock seed" V1)', () => {
  it('lo stesso seed produce sempre la stessa struttura', () => {
    const a = buildSong({ style: 'pop_rock', seed: 777 });
    const b = buildSong({ style: 'pop_rock', seed: 777 });
    expect(a.sections.map(s => s.type)).toEqual(b.sections.map(s => s.type));
    expect(a.sections[0].harmonicMap[0].chord).toEqual(b.sections[0].harmonicMap[0].chord);
  });

  it('seed diversi tendono a produrre progressioni diverse (varietà — V1)', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    const firstChords = seeds.map(
      seed => buildSong({ style: 'pop_rock', seed }).sections[0].harmonicMap[0].chord
    );
    const distinct = new Set(firstChords);
    // Non deve essere identico per tutti gli 8 seed — altrimenti la regressione
    // "il brano non cambia mai" (bug V1 originale) sarebbe tornata.
    expect(distinct.size).toBeGreaterThan(1);
  });
});
