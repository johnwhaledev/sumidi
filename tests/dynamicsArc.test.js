import { describe, it, expect } from 'vitest';
import { buildSong } from '../src/SongArchitect.js';
import { generateDrums } from '../src/Percussionist.js';
import { generateEnsemble } from '../src/EnsembleGenerator.js';
import { generateBass } from '../src/BassGenerator.js';
import { buildDrumContext } from '../src/FlowCore.js';

// Sessione M3 (PLAN35): batteria ed ensemble devono seguire lo stesso arco
// dinamico di sezione (velocityArcType) già usato da basso/chitarra/piano —
// prima non lo leggevano affatto e restavano "piatti" lungo la sezione anche
// quando gli altri strumenti crescevano/calavano.

function avgVelocityByBar(events, barTicks, sectionStartTick, bars) {
  const sums = Array.from({ length: bars }, () => ({ sum: 0, n: 0 }));
  for (const ev of events) {
    if (ev.velocity == null) continue;
    const idx = Math.floor((ev.tick - sectionStartTick) / barTicks);
    if (idx >= 0 && idx < bars) { sums[idx].sum += ev.velocity; sums[idx].n++; }
  }
  return sums.map(s => (s.n ? s.sum / s.n : null));
}

describe('M3 — arco dinamico condiviso tra batteria/ensemble e basso/chitarra/piano', () => {
  it('la batteria ha velocity media diversa tra le battute di una sezione lunga (non più piatta)', () => {
    // pop_rock ha un chorus con arco 'peak_mid' (vedi arcTypeMap in SongArchitect.js)
    const bp = buildSong({ style: 'pop_rock', seed: 55, form: 'pop_rock_standard' });
    const chorus = bp.sections.find(s => s.type === 'chorus' && s.bars >= 4);
    expect(chorus, 'serve una sezione chorus di almeno 4 bar per il test').toBeTruthy();

    const drumEvents = generateDrums(bp);
    const byBar = avgVelocityByBar(drumEvents, bp.meta.barTicks, chorus.startTick, chorus.bars)
      .filter(v => v !== null);

    expect(byBar.length).toBeGreaterThan(1);
    // Non tutte le battute devono avere la stessa velocity media — altrimenti
    // l'arco di sezione non starebbe influenzando la batteria (regressione).
    const distinct = new Set(byBar.map(v => Math.round(v)));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('generateDrums non crasha e produce eventi validi anche senza velocityArcType (retro-compatibilità)', () => {
    const bp = buildSong({ style: 'unplugged', seed: 3 });
    for (const s of bp.sections) for (const m of Object.values(s.modules)) delete m.velocityArcType;
    expect(() => generateDrums(bp)).not.toThrow();
  });

  it("l'ensemble varia la velocity tra le battute quando l'arco non è 'flat'", () => {
    const bp = buildSong({ style: 'cinematic', seed: 8 });
    const section = bp.sections.find(s => s.modules?.ensemble?.active && s.bars >= 4);
    expect(section, "serve una sezione con ensemble attivo e >= 4 bar").toBeTruthy();

    const res = generateEnsemble(bp);
    const allEvents = res.voiceEvents.flat().filter(e => e.velocity != null);
    const byBar = avgVelocityByBar(allEvents, bp.meta.barTicks, section.startTick, section.bars)
      .filter(v => v !== null);

    expect(byBar.length).toBeGreaterThan(1);
    const distinct = new Set(byBar.map(v => Math.round(v)));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('basso/batteria/ensemble condividono lo stesso arcType per la stessa sezione', () => {
    const bp = buildSong({ style: 'pop_rock', seed: 55, form: 'pop_rock_standard' });
    for (const s of bp.sections) {
      const arcTypes = ['bass', 'drums', 'ensemble', 'guitar', 'piano']
        .map(inst => s.modules[inst]?.velocityArcType)
        .filter(Boolean);
      if (arcTypes.length > 1) {
        expect(new Set(arcTypes).size, `sezione ${s.type}: arcType disallineati tra strumenti`).toBe(1);
      }
    }
  });

  it('BassGenerator continua a funzionare invariato (nessuna regressione da M3)', () => {
    const bp = buildSong({ style: 'pop_rock', seed: 55 });
    const drumEvents = generateDrums(bp);
    const drumContext = buildDrumContext(drumEvents, bp.meta.ppq, bp.meta.barTicks);
    const bass = generateBass(bp, drumContext);
    expect(Array.isArray(bass.events)).toBe(true);
    expect(bass.events.length).toBeGreaterThan(0);
  });
});
