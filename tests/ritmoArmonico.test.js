import { describe, it, expect } from 'vitest';
import {
  accordiPerFinestra, accordiPerBattuta, etichettePerBattuta, FINESTRE_PER_BATTUTA,
} from '../src/ChordTheory.js';
import { buildHarmonicMap } from '../src/SongArchitect.js';
import { generateChords } from '../src/ChordGenerator.js';

// A1 di PLAN37 — il ritmo armonico sub-battuta. Il motore aveva un accordo per
// battuta su tutti e 13 gli stili, sempre: `accordiPerBattuta` normalizzava
// ogni voce in [accordo, battute] con la durata intera, e buildHarmonicMap
// scriveva lo stesso accordo nelle due mezze battute. Non c'era modo di
// rappresentare un ii-V dentro la battuta o una cadenza che stringe.

const PPQ = 480;
const BAR = PPQ * 4;

describe('accordiPerFinestra — la base', () => {

  it('una progressione a battute intere si espande come prima', () => {
    expect(accordiPerBattuta(['Am', 'F', 'C', 'G'], 4)).toEqual(['Am', 'F', 'C', 'G']);
    expect(accordiPerBattuta([['Am7', 2], ['D7', 2]], 4)).toEqual(['Am7', 'Am7', 'D7', 'D7']);
    expect(accordiPerBattuta(['Am', 'F'], 5)).toEqual(['Am', 'F', 'Am', 'F', 'Am']);
  });

  it('due finestre per battuta, con lo stesso accordo se dura una battuta', () => {
    expect(accordiPerFinestra(['Am', 'F'], 2)).toEqual(['Am', 'Am', 'F', 'F']);
    expect(FINESTRE_PER_BATTUTA).toBe(2);
  });

  it('mezza battuta: due accordi dentro la stessa battuta', () => {
    const prog = [['Dm7', 0.5], ['G7', 0.5], ['Cmaj7', 1]];
    expect(accordiPerFinestra(prog, 2)).toEqual(['Dm7', 'G7', 'Cmaj7', 'Cmaj7']);
    // Chi vuole un accordo per battuta prende quello su cui la battuta parte.
    expect(accordiPerBattuta(prog, 2)).toEqual(['Dm7', 'Cmaj7']);
    // Chi legge li vede tutti e due.
    expect(etichettePerBattuta(prog, 2)).toEqual(['Dm7 G7', 'Cmaj7']);
  });

  it('una durata più corta di mezza battuta vale mezza battuta', () => {
    // Meglio sentirla dove non era prevista che perderla del tutto.
    expect(accordiPerFinestra([['Am', 0.25], ['F', 0.25]], 1)).toEqual(['Am', 'F']);
  });

  it('progressione vuota o battute a zero non producono niente', () => {
    expect(accordiPerFinestra([], 4)).toEqual([]);
    expect(accordiPerFinestra(['Am'], 0)).toEqual([]);
    expect(accordiPerBattuta(null, 4)).toEqual([]);
    expect(etichettePerBattuta(['Am'], 0)).toEqual([]);
  });

});

describe('buildHarmonicMap — le regioni seguono le durate reali', () => {

  it('a battute intere produce due finestre uguali per battuta, come prima', () => {
    const map = buildHarmonicMap(['Am', 'F'], 0, 2, PPQ, BAR);
    expect(map).toHaveLength(4);
    expect(map.map(r => r.chord)).toEqual(['Am', 'Am', 'F', 'F']);
    expect(map.map(r => r.start_tick)).toEqual([0, BAR / 2, BAR, BAR + BAR / 2]);
    for (const r of map) expect(r.end_tick - r.start_tick).toBe(BAR / 2);
  });

  it('con mezze battute la seconda metà cambia accordo davvero', () => {
    const map = buildHarmonicMap([['Dm7', 0.5], ['G7', 0.5]], 0, 1, PPQ, BAR);
    expect(map.map(r => r.chord)).toEqual(['Dm7', 'G7']);
    // Non solo il nome: cambiano radice, gradi e pool di note dell'accordo.
    expect(map[0].rootPc).not.toBe(map[1].rootPc);
    expect(map[0].chord_tones).not.toEqual(map[1].chord_tones);
    // E cambia anche la scala suggerita: dorico sul minore, misolidio sul dom7.
    expect([map[0].scale, map[1].scale]).toEqual(['dorian', 'mixolydian']);
  });

  it('il tick di partenza della sezione viene rispettato', () => {
    const map = buildHarmonicMap([['Dm7', 0.5], ['G7', 0.5]], 5 * BAR, 1, PPQ, BAR);
    expect(map.map(r => r.start_tick)).toEqual([5 * BAR, 5 * BAR + BAR / 2]);
  });

});

describe('i generatori seguono il ritmo armonico', () => {

  it('il pad suona due accordi diversi nella stessa battuta', () => {
    // I generatori leggono le regioni e non sanno quanto durino: e' la ragione
    // per cui A1 tocca solo accordiPerFinestra e buildHarmonicMap.
    const harmonicMap = buildHarmonicMap([['Dm7', 0.5], ['G7', 0.5]], 0, 1, PPQ, BAR);
    const bp = { sections: [{ harmonicMap, energy: 5, bars: 1, startTick: 0 }] };
    const tick = [...new Set(generateChords(bp).events.map(e => e.tick))].sort((a, b) => a - b);
    expect(tick).toEqual([0, BAR / 2]);
  });

});
