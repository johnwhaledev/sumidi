import { describe, it, expect } from 'vitest';
import { MidiWriter } from '../src/MidiWriter.js';
import { parseKey, keySignatureSf } from '../src/SongArchitect.js';

// B2 di PLAN37 — l'armatura di chiave mancava in entrambi gli export di Session
// Mode: chi apriva il .mid in notazione lo vedeva in Do maggiore con ogni
// alterazione come accidente. Qui si verifica la tabella (fonte unica in
// SongArchitect) e il fatto che l'evento FF 59 finisca davvero nei byte.

// Circolo delle quinte, controllato a mano: nome → [alterazioni, minore?]
const ARMATURE = [
  ['C',  0, false], ['G',  1, false], ['D',  2, false], ['A',  3, false],
  ['E',  4, false], ['B',  5, false], ['F#', 6, false], ['F', -1, false],
  ['Bb', -2, false], ['Eb', -3, false], ['Ab', -4, false], ['Db', -5, false],
  ['Am', 0, true], ['Em', 1, true], ['Bm', 2, true], ['F#m', 3, true],
  ['Dm', -1, true], ['Gm', -2, true], ['Cm', -3, true], ['Fm', -4, true],
];

describe('keySignatureSf — armatura di chiave', () => {
  it.each(ARMATURE)('%s ha %i alterazioni', (key, sfAtteso, minAtteso) => {
    const { rootPc, isMinor } = parseKey(key);
    expect(isMinor).toBe(minAtteso);
    expect(keySignatureSf(rootPc, isMinor)).toBe(sfAtteso);
  });

  it('una minore ha la stessa armatura della sua relativa maggiore', () => {
    for (const [key, , isMin] of ARMATURE) {
      if (!isMin) continue;
      const { rootPc } = parseKey(key);
      const relativaMaggiorePc = (rootPc + 3) % 12;
      expect(keySignatureSf(rootPc, true)).toBe(keySignatureSf(relativaMaggiorePc, false));
    }
  });

  it('resta nei limiti del formato MIDI (-7..+7) su tutte le 24 tonalità', () => {
    for (let pc = 0; pc < 12; pc++) {
      for (const isMinor of [false, true]) {
        const sf = keySignatureSf(pc, isMinor);
        expect(Number.isInteger(sf)).toBe(true);
        expect(sf).toBeGreaterThanOrEqual(-7);
        expect(sf).toBeLessThanOrEqual(7);
      }
    }
  });
});

describe('MidiWriter.setKeySignature — byte prodotti', () => {
  // Cerca l'evento meta FF 59 02 nei byte del file e ne legge i due parametri.
  function leggiArmatura(bytes) {
    for (let i = 0; i + 4 < bytes.length; i++) {
      if (bytes[i] === 0xFF && bytes[i + 1] === 0x59 && bytes[i + 2] === 0x02) {
        return { sf: bytes[i + 3] > 127 ? bytes[i + 3] - 256 : bytes[i + 3], mi: bytes[i + 4] };
      }
    }
    return null;
  }

  it.each([['C', 0, 0], ['Am', 0, 1], ['F#', 6, 0], ['Eb', -3, 0], ['Bm', 2, 1]])(
    '%s finisce nel file come FF 59 sf=%i mi=%i',
    (key, sfAtteso, miAtteso) => {
      const { rootPc, isMinor } = parseKey(key);
      const writer = new MidiWriter(480);
      writer.setTempo(100);
      writer.setTimeSignature(4, 4);
      writer.setKeySignature(keySignatureSf(rootPc, isMinor), isMinor);
      writer.addTrack('vuota');
      const armatura = leggiArmatura(writer.toUint8Array());
      expect(armatura).not.toBeNull();
      expect(armatura.sf).toBe(sfAtteso);
      expect(armatura.mi).toBe(miAtteso);
    },
  );
});
