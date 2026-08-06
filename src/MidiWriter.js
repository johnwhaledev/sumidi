/**
 * MidiWriter.js
 * ─────────────────────────────────────────────────────────────────
 * Zero-dependency MIDI Type-1 file writer.
 * Converts absolute-tick event lists into a downloadable .mid blob.
 *
 * Usage:
 *   const writer = new MidiWriter(480);           // ppq
 *   writer.setTempo(72);                          // bpm
 *   const track = writer.addTrack('Drums');
 *   track.noteOn(0,   36, 110, 9);               // tick, note, vel, ch
 *   track.noteOff(60, 36,   0, 9);
 *   const blob = writer.toBlob();
 *   // → download or feed to AudioContext
 * ─────────────────────────────────────────────────────────────────
 */

// ── Variable-Length Quantity encoding ────────────────────────────
function encodeVLQ(value) {
  const bytes = [];
  bytes.push(value & 0x7F);
  value >>= 7;
  while (value > 0) {
    bytes.push((value & 0x7F) | 0x80);
    value >>= 7;
  }
  return bytes.reverse();
}

// ── Big-endian multi-byte helpers ─────────────────────────────────
function uint16BE(v) { return [(v >> 8) & 0xFF, v & 0xFF]; }
function uint32BE(v) { return [(v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF]; }

// ── MidiTrackBuffer ───────────────────────────────────────────────
class MidiTrackBuffer {
  constructor(name = '') {
    this.name = name;
    // events: { tick: number, data: number[] }
    this._events = [];
  }

  // ── Raw event push ────────────────────────────────────────────
  _push(tick, bytes) {
    this._events.push({ tick: Math.max(0, Math.round(tick)), data: bytes });
  }

  // ── Standard MIDI messages ────────────────────────────────────
  noteOn(tick, note, velocity, channel = 0) {
    this._push(tick, [0x90 | (channel & 0x0F), note & 0x7F, velocity & 0x7F]);
  }

  noteOff(tick, note, channel = 0) {
    this._push(tick, [0x80 | (channel & 0x0F), note & 0x7F, 0]);
  }

  /** Convenience: emit a note with duration */
  note(tick, note, velocity, durationTicks, channel = 0) {
    this.noteOn(tick,              note, velocity, channel);
    this.noteOff(tick + durationTicks, note,            channel);
  }

  programChange(tick, program, channel = 0) {
    this._push(tick, [0xC0 | (channel & 0x0F), program & 0x7F]);
  }

  controlChange(tick, cc, value, channel = 0) {
    this._push(tick, [0xB0 | (channel & 0x0F), cc & 0x7F, value & 0x7F]);
  }

  pitchBend(tick, value, channel = 0) {
    // value: -8192..+8191 → split into LSB/MSB
    const v = value + 8192;
    this._push(tick, [0xE0 | (channel & 0x0F), v & 0x7F, (v >> 7) & 0x7F]);
  }

  // ── Meta messages ─────────────────────────────────────────────
  trackName(name) {
    const bytes = Array.from(new TextEncoder().encode(name));
    this._push(0, [0xFF, 0x03, ...encodeVLQ(bytes.length), ...bytes]);
  }

  // ── Serialize to bytes ────────────────────────────────────────
  toBytes() {
    const out = [];

    // Risolve note overlap: se la stessa nota è ancora on quando viene risuonata,
    // inserisce un noteOff implicito prima del nuovo noteOn.
    // Necessario perché DAW come Logic troncano i blocchi sovrapposti sulla stessa pitch.
    const activeNotes = new Map(); // key: `ch_note` → tick di inizio
    const extraOffs   = [];
    for (const evt of this._events) {
      const status = evt.data[0] & 0xF0;
      const ch     = evt.data[0] & 0x0F;
      if (status === 0x90 && evt.data[2] > 0) {           // noteOn con velocity > 0
        const key = `${ch}_${evt.data[1]}`;
        if (activeNotes.has(key)) {                        // nota ancora aperta: chiudi prima
          extraOffs.push({ tick: evt.tick, data: [0x80 | ch, evt.data[1], 0] });
        }
        activeNotes.set(key, evt.tick);
      } else if (status === 0x80 || (status === 0x90 && evt.data[2] === 0)) {
        activeNotes.delete(`${ch}_${evt.data[1]}`);
      }
    }
    if (extraOffs.length) this._events.push(...extraOffs);

    // Sort by tick, then note-off before note-on at same tick
    const sorted = [...this._events].sort((a, b) => {
      if (a.tick !== b.tick) return a.tick - b.tick;
      // note-off (0x8x) before note-on (0x9x) at same tick
      const aOff = (a.data[0] & 0xF0) === 0x80 ? 0 : 1;
      const bOff = (b.data[0] & 0xF0) === 0x80 ? 0 : 1;
      return aOff - bOff;
    });

    // Emit track name as first event
    if (this.name) {
      const nameBytes = Array.from(new TextEncoder().encode(this.name));
      out.push(...encodeVLQ(0));
      out.push(0xFF, 0x03, ...encodeVLQ(nameBytes.length), ...nameBytes);
    }

    let lastTick = 0;
    for (const evt of sorted) {
      const delta = Math.max(0, evt.tick - lastTick);
      out.push(...encodeVLQ(delta));
      out.push(...evt.data);
      lastTick = evt.tick;
    }

    // End of track
    out.push(...encodeVLQ(0), 0xFF, 0x2F, 0x00);

    return out;
  }
}

// ── MidiWriter (File builder) ─────────────────────────────────────
export class MidiWriter {
  /**
   * @param {number} ppq  Ticks per quarter note (default 480)
   */
  constructor(ppq = 480) {
    this.ppq      = ppq;
    this._tracks  = [];
    this._tempoTrack = new MidiTrackBuffer('Tempo');
  }

  // ── Global meta ───────────────────────────────────────────────
  /**
   * Set tempo (BPM). Can be called multiple times for tempo changes.
   * @param {number} bpm
   * @param {number} tick  When to apply (default 0)
   */
  setTempo(bpm, tick = 0) {
    const microsPerBeat = Math.round(60_000_000 / bpm);
    this._tempoTrack._push(tick, [
      0xFF, 0x51, 0x03,
      (microsPerBeat >> 16) & 0xFF,
      (microsPerBeat >> 8)  & 0xFF,
       microsPerBeat        & 0xFF,
    ]);
  }

  /**
   * Set time signature.
   * @param {number} num    Numerator (default 4)
   * @param {number} den    Denominator as power-of-2 exponent (default 2 = quarter)
   * @param {number} tick
   */
  setTimeSignature(num = 4, den = 4, tick = 0) {
    const denExp = Math.round(Math.log2(den)); // 4→2, 8→3
    this._tempoTrack._push(tick, [
      0xFF, 0x58, 0x04,
      num, denExp, 24, 8,
    ]);
  }

  /**
   * Imposta la key signature MIDI (FF 59).
   * @param {number}  sf       Diesis (+) o bemolli (-), range -7..+7
   * @param {boolean} isMinor  true = minore, false = maggiore
   * @param {number}  tick
   */
  setKeySignature(sf = 0, isMinor = false, tick = 0) {
    this._tempoTrack._push(tick, [
      0xFF, 0x59, 0x02,
      sf < 0 ? (256 + sf) : sf,   // byte con segno (complemento a 2 per bemolli)
      isMinor ? 1 : 0,
    ]);
  }

  /**
   * Aggiunge un marker di sezione (FF 06) al tempo track.
   * Visibile come punto di navigazione nella timeline DAW.
   * @param {number} tick
   * @param {string} text  Etichetta (es. "Verse 1", "Chorus")
   */
  addMarker(tick, text) {
    const bytes = Array.from(new TextEncoder().encode(text));
    this._tempoTrack._push(tick, [0xFF, 0x06, ...encodeVLQ(bytes.length), ...bytes]);
  }

  // ── Track management ─────────────────────────────────────────
  /** Create and return a new MidiTrackBuffer */
  addTrack(name = '') {
    const t = new MidiTrackBuffer(name);
    this._tracks.push(t);
    return t;
  }

  // ── Serialize to Uint8Array ───────────────────────────────────
  toUint8Array() {
    const allTracks = [this._tempoTrack, ...this._tracks];
    const numTracks = allTracks.length;

    // Serialize each track
    const trackBytes = allTracks.map(t => t.toBytes());

    // MIDI File Header: MThd
    const header = [
      0x4D, 0x54, 0x68, 0x64,         // "MThd"
      ...uint32BE(6),                  // Header length = 6
      ...uint16BE(1),                  // Format = 1 (multi-track)
      ...uint16BE(numTracks),          // Number of tracks
      ...uint16BE(this.ppq),           // Ticks per quarter note
    ];

    // Assemble all track chunks
    const trackChunks = [];
    for (const bytes of trackBytes) {
      trackChunks.push(
        0x4D, 0x54, 0x72, 0x6B,       // "MTrk"
        ...uint32BE(bytes.length),     // Track length
        ...bytes,
      );
    }

    return new Uint8Array([...header, ...trackChunks]);
  }

  /** @returns {Blob} audio/midi */
  toBlob() {
    return new Blob([this.toUint8Array()], { type: 'audio/midi' });
  }

  /** @returns {string} object URL — remember to URL.revokeObjectURL() */
  toObjectURL() {
    return URL.createObjectURL(this.toBlob());
  }

  /** Trigger browser download */
  download(filename = 'output.mid') {
    const url  = this.toObjectURL();
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

// ── Convenience: build from abs-event lists (like Python modules) ─
/**
 * Convert an array of { tick, note, velocity, duration, channel }
 * into note_on / note_off pairs on a track.
 */
export function eventsToTrack(writer, trackName, events, programNumber = null, channel = 0) {
  const track = writer.addTrack(trackName);
  if (programNumber !== null) {
    track.programChange(0, programNumber, channel);
  }
  for (const e of events) {
    track.noteOn (e.tick,              e.note, e.velocity,  channel);
    track.noteOff(e.tick + e.duration, e.note,              channel);
  }
  return track;
}
