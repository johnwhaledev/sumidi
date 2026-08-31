import { describe, it, expect } from 'vitest';
import { buildSong } from '../src/SongArchitect.js';
import { generateChords } from '../src/ChordGenerator.js';

// A3 di PLAN37 — il pad di riferimento armonico. Riassegnava il voicing da zero
// a ogni regione (sempre le note più gravi disponibili), quindi fra un accordo e
// il successivo le voci si spostavano senza continuità. Ora, quando c'è un
// accordo prima, si sceglie fra le posizioni possibili quella che muove meno le
// voci, appaiandole per posizione. Questi test guardano la conseguenza udibile.

const STILI = ['unplugged', 'folk', 'jazz_ballad', 'neo_soul', 'classical',
               'pop_rock', 'blues_rock', 'cinematic', 'lo_fi', 'punk'];

/** I voicing del pad, in ordine di tick: un array di note per accordo. */
function voicings(bp) {
  const perTick = new Map();
  for (const e of generateChords(bp).events) {
    if (!perTick.has(e.tick)) perTick.set(e.tick, []);
    perTick.get(e.tick).push(e.note);
  }
  return [...perTick.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, note]) => note.sort((a, b) => a - b));
}

/** Movimento medio per voce fra due voicing, appaiando grave con grave. */
function movimento(prev, cur) {
  const n = Math.min(prev.length, cur.length);
  let somma = 0;
  for (let i = 0; i < n; i++) somma += Math.abs(cur[i] - prev[i]);
  return somma / n;
}

/** La vecchia strategia: sempre le 4 note più gravi con pitch class distinte. */
function voicingPiuGrave(region) {
  const v = [], pc = new Set();
  for (const n of (region.chord_tones ?? []).slice().sort((a, b) => a - b)) {
    if (n < 52 || n > 76) continue;
    if (pc.has(n % 12)) continue;
    pc.add(n % 12);
    v.push(n);
    if (v.length >= 4) break;
  }
  return v;
}

describe('il voicing del pad', () => {

  it.each(STILI)('su %s resta dentro il registro E3–E5 e sull’accordo', style => {
    const bp = buildSong({ style, key: 'Am', bpm: 90, seed: 4242 });
    const regioni = bp.sections.flatMap(s => s.harmonicMap ?? []);
    const v = voicings(bp);
    expect(v.length).toBeGreaterThan(0);
    for (const note of v) {
      for (const n of note) {
        expect(n).toBeGreaterThanOrEqual(52);
        expect(n).toBeLessThanOrEqual(76);
      }
      // Nessuna nota inventata: ogni nota è un chord tone di qualche regione.
      for (const n of note) {
        expect(regioni.some(r => (r.chord_tones ?? []).includes(n))).toBe(true);
      }
    }
  });

  it('il primo accordo è ancora la posizione più grave', () => {
    // Senza un accordo prima non c'è niente da collegare: il comportamento
    // resta quello di sempre.
    const bp = buildSong({ style: 'unplugged', key: 'Am', bpm: 90, seed: 4242 });
    const prima = bp.sections[0].harmonicMap[0];
    expect(voicings(bp)[0]).toEqual(voicingPiuGrave(prima));
  });

  it('le voci si muovono meno di quanto facevano prendendo sempre la più grave', () => {
    let conVoiceLeading = 0, sempreGrave = 0, passaggi = 0;
    for (const style of STILI) {
      const bp = buildSong({ style, key: 'Am', bpm: 90, seed: 4242 });
      const nuovo = voicings(bp);
      const vecchio = bp.sections.flatMap(s => s.harmonicMap ?? [])
        .map(voicingPiuGrave).filter(v => v.length);
      for (let i = 1; i < Math.min(nuovo.length, vecchio.length); i++) {
        conVoiceLeading += movimento(nuovo[i - 1], nuovo[i]);
        sempreGrave     += movimento(vecchio[i - 1], vecchio[i]);
        passaggi++;
      }
    }
    expect(passaggi).toBeGreaterThan(100);
    expect(conVoiceLeading).toBeLessThan(sempreGrave);
  });

  it('nessun accordo salta: il movimento per voce resta sotto i 5 semitoni', () => {
    for (const style of STILI) {
      const v = voicings(buildSong({ style, key: 'Am', bpm: 90, seed: 4242 }));
      for (let i = 1; i < v.length; i++) {
        expect(movimento(v[i - 1], v[i]),
          `${style}: da ${v[i - 1]} a ${v[i]}`).toBeLessThan(5);
      }
    }
  });

});
