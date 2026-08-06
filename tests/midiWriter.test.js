import { describe, it, expect } from 'vitest';
import { MidiWriter, eventsToTrack } from '../src/MidiWriter.js';

describe('MidiWriter — output binario', () => {
  it('produce un file MIDI valido (header MThd + numero tracce corretto)', () => {
    const writer = new MidiWriter(480);
    writer.setTempo(120);
    writer.setTimeSignature(4, 4);

    eventsToTrack(writer, 'Bass', [
      { tick: 0, note: 40, velocity: 90, duration: 480 },
      { tick: 480, note: 43, velocity: 85, duration: 480 },
    ], 33, 1);

    const bytes = writer.toUint8Array();
    expect(bytes).toBeInstanceOf(Uint8Array);

    // "MThd"
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x4D, 0x54, 0x68, 0x64]);
    // Header length = 6
    expect(Array.from(bytes.slice(4, 8))).toEqual([0, 0, 0, 6]);
    // Numero tracce: tempo track + 1 traccia bass = 2
    const numTracks = (bytes[10] << 8) | bytes[11];
    expect(numTracks).toBe(2);
    // Ogni traccia deve iniziare con "MTrk"
    expect(Array.from(bytes.slice(14, 18))).toEqual([0x4D, 0x54, 0x72, 0x6B]);
  });
});
