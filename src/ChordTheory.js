/**
 * ChordTheory.js
 * ─────────────────────────────────────────────────────────────────
 * Teoria armonica di base: pitch class, intervalli di accordo e di scala.
 * Estratto da SongArchitect.js (sessione R1 — PLAN35) per separare i dati
 * statici dalla logica di building. Nessuna dipendenza da altri moduli.
 * ─────────────────────────────────────────────────────────────────
 */

// ═══════════════════════════════════════════════════════════════════
// 1. CHORD THEORY
// ═══════════════════════════════════════════════════════════════════

/**
 * All 12 chromatic pitch classes (index = semitones from C).
 * Used to resolve chord names to MIDI root numbers.
 */
export const PITCH_CLASS = {
  'C': 0,  'C#': 1, 'Db': 1,
  'D': 2,  'D#': 3, 'Eb': 3,
  'E': 4,
  'F': 5,  'F#': 6, 'Gb': 6,
  'G': 7,  'G#': 8, 'Ab': 8,
  'A': 9,  'A#': 10,'Bb': 10,
  'B': 11,
};

/**
 * Chord interval maps (semitones from root).
 * Covers all 28 chord types referenced in the Python codebase.
 */
export const CHORD_INTERVALS = {
  // Triads
  'maj':        [0, 4, 7],
  'min':        [0, 3, 7],
  'dim':        [0, 3, 6],
  'aug':        [0, 4, 8],
  // 7ths
  'maj7':       [0, 4, 7, 11],
  'min7':       [0, 3, 7, 10],
  'dom7':       [0, 4, 7, 10],
  '7':          [0, 4, 7, 10],   // alias
  'dim7':       [0, 3, 6, 9],
  'hdim7':      [0, 3, 6, 10],
  'aug7':       [0, 4, 8, 10],
  'minmaj7':    [0, 3, 7, 11],
  // 9ths
  'maj9':       [0, 4, 7, 11, 14],
  'min9':       [0, 3, 7, 10, 14],
  'dom9':       [0, 4, 7, 10, 14],
  'add9':       [0, 4, 7, 14],
  // Suspended
  'sus2':       [0, 2, 7],
  'sus4':       [0, 5, 7],
  'dom7sus4':   [0, 5, 7, 10],
  // 6ths
  '6':          [0, 4, 7, 9],
  'min6':       [0, 3, 7, 9],
  'm6':         [0, 3, 7, 9],    // alias
  'maj69':      [0, 4, 7, 9, 14],
  // Extended
  'dom11':      [0, 4, 7, 10, 14, 17],
  'dom13':      [0, 4, 7, 10, 14, 21],
  'min11':      [0, 3, 7, 10, 14, 17],
  'maj7sh11':   [0, 4, 7, 11, 18],
  '7sh9':       [0, 4, 7, 10, 15],  // Hendrix chord
};

/**
 * Scale interval patterns (semitones from root).
 */
export const SCALE_INTERVALS = {
  'major':           [0, 2, 4, 5, 7, 9, 11],
  'minor':           [0, 2, 3, 5, 7, 8, 10],
  'dorian':          [0, 2, 3, 5, 7, 9, 10],
  'mixolydian':      [0, 2, 4, 5, 7, 9, 10],
  'phrygian':        [0, 1, 3, 5, 7, 8, 10],
  'lydian':          [0, 2, 4, 6, 7, 9, 11],
  'harmonic_minor':  [0, 2, 3, 5, 7, 8, 11],
  'blues':           [0, 3, 5, 6, 7, 10],
  'pentatonic_minor':[0, 3, 5, 7, 10],
  'pentatonic_major':[0, 2, 4, 7, 9],
};
