import { describe, it, expect } from 'vitest';
import { SessionManager, INSTRUMENTS } from '../src/SessionManager.js';

// B7 di PLAN37 — l'esecuzione deve essere riproducibile dal seed. Prima, il
// seed iniziale di ogni strumento veniva da Math.random(): il seed del brano
// fissava struttura, accordi, tonalita' e tempo, ma non le note suonate, e due
// aperture dello stesso link davano due file MIDI diversi. Qui si sorveglia il
// legame seed di sezione → seed degli strumenti, che e' il punto in cui il
// legame si era rotto.

/** Le stesse specifiche che smImportFromBlueprint passa a replaceAllSections:
 *  tutte le sezioni ricevono il seed del brano. */
function specDaLink(seed) {
  return [
    { type: 'intro',  bars: 4, seed },
    { type: 'verse',  bars: 8, seed },
    { type: 'chorus', bars: 8, seed },
    { type: 'verse',  bars: 8, seed },
    { type: 'outro',  bars: 4, seed },
  ];
}

/** Mappa leggibile "etichetta:strumento" → seed, senza gli id casuali. */
function mappaSeed(mgr) {
  const out = {};
  mgr.getSections().forEach((sec, i) => {
    for (const inst of INSTRUMENTS) out[`${i}:${inst}`] = sec.instruments[inst].seed;
  });
  return out;
}

describe('seed degli strumenti derivato dalla sezione', () => {

  it('due sessioni ricostruite dallo stesso link hanno gli stessi seed', () => {
    const a = new SessionManager({ key: 'Am', bpm: 100, style: 'pop_rock' });
    const b = new SessionManager({ key: 'Am', bpm: 100, style: 'pop_rock' });
    a.replaceAllSections(specDaLink(4242));
    b.replaceAllSections(specDaLink(4242));
    expect(mappaSeed(a)).toEqual(mappaSeed(b));
  });

  it('un seed di brano diverso da un arrangiamento diverso', () => {
    const a = new SessionManager();
    const b = new SessionManager();
    a.replaceAllSections(specDaLink(4242));
    b.replaceAllSections(specDaLink(4243));
    expect(mappaSeed(a)).not.toEqual(mappaSeed(b));
  });

  it('sezioni diverse non ricevono gli stessi seed, pur avendo lo stesso seed di brano', () => {
    // Serve l'ordinale nella derivazione: senza, le due strofe di un brano
    // uscirebbero identiche nota per nota, perche' smImportFromBlueprint da'
    // a tutte le sezioni lo stesso seed.
    const mgr = new SessionManager();
    mgr.replaceAllSections(specDaLink(4242));
    const perStrumento = INSTRUMENTS.map(inst =>
      new Set(mgr.getSections().map(s => s.instruments[inst].seed)).size);
    expect(perStrumento).toEqual(INSTRUMENTS.map(() => mgr.getSections().length));
  });

  it('i cinque strumenti di una sezione hanno seed distinti', () => {
    const mgr = new SessionManager();
    const sec = mgr.addSection('verse', { seed: 777 });
    const seeds = INSTRUMENTS.map(inst => sec.instruments[inst].seed);
    expect(new Set(seeds).size).toBe(INSTRUMENTS.length);
  });

  it('il seed derivato sta nello stesso intervallo dei seed casuali', () => {
    const mgr = new SessionManager();
    for (const seedSezione of [1, 4242, 99998, 12345]) {
      const sec = mgr.addSection('verse', { seed: seedSezione });
      for (const inst of INSTRUMENTS) {
        const s = sec.instruments[inst].seed;
        expect(Number.isInteger(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(1);
        expect(s).toBeLessThanOrEqual(99998);
      }
    }
  });

  it('il dado del singolo strumento randomizza ancora, su richiesta', () => {
    const mgr = new SessionManager();
    const sec = mgr.addSection('verse', { seed: 4242 });
    const prima = sec.instruments.bass.seed;
    const visti = new Set();
    for (let i = 0; i < 20; i++) {
      mgr.mutateInstrumentSeed(sec.id, 'bass');
      visti.add(sec.instruments.bass.seed);
    }
    expect(visti.size).toBeGreaterThan(1);
    expect(visti.has(prima) && visti.size === 1).toBe(false);
  });

  it('il dado non tocca uno strumento bloccato', () => {
    const mgr = new SessionManager();
    const sec = mgr.addSection('verse', { seed: 4242 });
    mgr.lockInstrument(sec.id, 'piano', true);
    const prima = sec.instruments.piano.seed;
    expect(mgr.mutateInstrumentSeed(sec.id, 'piano')).toBe(false);
    expect(sec.instruments.piano.seed).toBe(prima);
  });

  it('una sessione salvata mantiene i suoi seed, non li ri-deriva', () => {
    const mgr = new SessionManager();
    const sec = mgr.addSection('verse', { seed: 4242 });
    mgr.mutateInstrumentSeed(sec.id, 'guitar', 11111);
    const ripresa = SessionManager.fromJSON(JSON.parse(JSON.stringify(mgr.toJSON())));
    expect(ripresa.getSections()[0].instruments.guitar.seed).toBe(11111);
    expect(ripresa.getSections()[0].instruments.drums.seed)
      .toBe(sec.instruments.drums.seed);
  });

});
