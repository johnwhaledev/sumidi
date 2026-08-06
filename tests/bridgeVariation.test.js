import { describe, it, expect } from 'vitest';
import { buildSong } from '../src/SongArchitect.js';
import { SECTION_PRESETS } from '../src/SectionPresets.js';
import { PROGRESSION_POOLS } from '../src/SongProgressions.js';

// Sessione M2 (PLAN35): il bridge deve suonare come un'idea musicale diversa
// dalla strofa, non solo più piano. Due parti: (1) l'armonia — già presente
// nel motore, qui solo blindata da regressione; (2) lo stile di chitarra —
// 6 preset riusavano lo stesso stile della strofa, corretto in questa sessione.

describe('M2 — armonia del bridge realmente diversa dalla strofa', () => {
  const FAMILIES = ['unplugged', 'folk', 'jazz', 'pop_rock', 'blues_rock', 'punk', 'garage_rock', 'chiptune'];

  for (const family of FAMILIES) {
    it(`esiste un pool di progressioni dedicato al bridge per "${family}"`, () => {
      const bridgePool = PROGRESSION_POOLS[`${family}_bridge`];
      const versePool  = PROGRESSION_POOLS[`${family}_verse`];
      expect(bridgePool, `manca ${family}_bridge`).toBeDefined();
      expect(versePool, `manca ${family}_verse`).toBeDefined();

      // Il pool del bridge non deve essere IDENTICO a quello della strofa —
      // qualche progressione condivisa è normale vocabolario armonico (es. ii-V-I
      // in stili jazz), ma i due pool nel loro insieme devono restare distinti.
      const bridgeSet = new Set(bridgePool.map(p => JSON.stringify(p)));
      const verseSet  = new Set(versePool.map(p => JSON.stringify(p)));
      const identical = bridgeSet.size === verseSet.size &&
        [...bridgeSet].every(p => verseSet.has(p));
      expect(identical, `${family}: pool bridge e verse sono identici`).toBe(false);
    });
  }

  it('buildSong assegna al bridge una progressione diversa dalla strofa (smoke test end-to-end)', () => {
    const bp = buildSong({ style: 'pop_rock', seed: 21, form: 'pop_rock_standard' });
    const verse  = bp.sections.find(s => s.type === 'verse');
    const bridge = bp.sections.find(s => s.type === 'bridge');
    if (!verse || !bridge) return; // la forma potrebbe non avere entrambe le sezioni
    const verseChords  = verse.harmonicMap.map(r => r.chord).join(',');
    const bridgeChords = bridge.harmonicMap.map(r => r.chord).join(',');
    expect(bridgeChords).not.toBe(verseChords);
  });
});

describe('M2 — stile di chitarra del bridge distinto dalla strofa', () => {
  const STYLES_TO_CHECK = [
    'unplugged', 'folk', 'neo_soul', 'blues_rock', 'singer_songwriter', 'garage_rock',
  ];

  for (const style of STYLES_TO_CHECK) {
    it(`'${style}': la chitarra del bridge non riusa più lo stesso stile della strofa`, () => {
      const verse  = SECTION_PRESETS[style]?.verse?.guitar;
      const bridge = SECTION_PRESETS[style]?.bridge?.guitar;
      expect(verse, `manca verse.guitar per ${style}`).toBeDefined();
      expect(bridge, `manca bridge.guitar per ${style}`).toBeDefined();
      if (verse.active && bridge.active) {
        expect(bridge.style, `${style}: bridge guitar riusa lo stile della strofa`).not.toBe(verse.style);
      }
    });
  }

  it('gli stili di chitarra usati nel bridge sono sempre token validi (nessun typo)', () => {
    const VALID = new Set(['fingerpicking', 'arpeggio', 'strumming', 'classical', 'powerchord', 'riff', 'skank']);
    for (const [styleName, sections] of Object.entries(SECTION_PRESETS)) {
      const g = sections.bridge?.guitar;
      if (g?.active) {
        expect(VALID.has(g.style), `${styleName}: stile chitarra bridge non valido: ${g.style}`).toBe(true);
      }
    }
  });
});
