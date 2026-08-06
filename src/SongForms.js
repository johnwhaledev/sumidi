/**
 * SongForms.js
 * ─────────────────────────────────────────────────────────────────
 * Forme di canzone (sequenza di sezioni con bar count ed energia).
 * Estratto da SongArchitect.js (sessione R1 — PLAN35).
 * ─────────────────────────────────────────────────────────────────
 */

// 3. SONG FORMS
// ═══════════════════════════════════════════════════════════════════

/**
 * SONG_FORMS
 * Each form defines the section sequence. Bar counts can be fixed
 * or a [min, max] range — buildSong() picks from range using RNG.
 * energy: 1-10 guides module density/dynamics for that section.
 */
export const SONG_FORMS = {
  // ── MTV Unplugged ──────────────────────────────────────────────
  unplugged_ballad: [
    { type: 'intro',   bars: [4, 4],   energy: 2 },
    { type: 'verse',   bars: [8, 8],   energy: 4 },
    { type: 'verse',   bars: [8, 8],   energy: 5 },
    { type: 'chorus',  bars: [8, 8],   energy: 8 },
    { type: 'verse',   bars: [8, 8],   energy: 5 },
    { type: 'chorus',  bars: [8, 8],   energy: 8 },
    { type: 'bridge',  bars: [4, 8],   energy: 4 },
    { type: 'chorus',  bars: [8, 8],   energy: 9 },
    { type: 'outro',   bars: [4, 4],   energy: 2 },
  ],
  unplugged_short: [
    { type: 'intro',   bars: [4, 4],   energy: 2 },
    { type: 'verse',   bars: [6, 8],   energy: 5 },
    { type: 'chorus',  bars: [8, 8],   energy: 8 },
    { type: 'verse',   bars: [6, 8],   energy: 5 },
    { type: 'chorus',  bars: [8, 8],   energy: 9 },
    { type: 'outro',   bars: [4, 6],   energy: 2 },
  ],
  unplugged_no_bridge: [
    { type: 'intro',   bars: [4, 4],   energy: 2 },
    { type: 'verse',   bars: [8, 8],   energy: 4 },
    { type: 'chorus',  bars: [8, 8],   energy: 8 },
    { type: 'verse',   bars: [8, 8],   energy: 5 },
    { type: 'chorus',  bars: [8, 8],   energy: 8 },
    { type: 'chorus',  bars: [8, 8],   energy: 9 },
    { type: 'outro',   bars: [4, 8],   energy: 2 },
  ],
  unplugged_extended: [
    { type: 'intro',   bars: [8, 8],   energy: 2 },
    { type: 'verse',   bars: [8, 8],   energy: 4 },
    { type: 'verse',   bars: [8, 8],   energy: 4 },
    { type: 'chorus',  bars: [8, 8],   energy: 7 },
    { type: 'verse',   bars: [8, 8],   energy: 5 },
    { type: 'chorus',  bars: [8, 8],   energy: 8 },
    { type: 'bridge',  bars: [8, 8],   energy: 5 },
    { type: 'chorus',  bars: [8, 8],   energy: 9 },
    { type: 'chorus',  bars: [4, 8],   energy: 9 },
    { type: 'outro',   bars: [8, 8],   energy: 2 },
  ],
  unplugged_waltz: [
    { type: 'intro',   bars: [6, 6],   energy: 2, beatsPerBar: 3 },
    { type: 'verse',   bars: [12, 12], energy: 4, beatsPerBar: 3 },
    { type: 'chorus',  bars: [12, 12], energy: 7, beatsPerBar: 3 },
    { type: 'verse',   bars: [12, 12], energy: 5, beatsPerBar: 3 },
    { type: 'chorus',  bars: [12, 12], energy: 8, beatsPerBar: 3 },
    { type: 'bridge',  bars: [6, 8],   energy: 5, beatsPerBar: 3 },
    { type: 'chorus',  bars: [12, 12], energy: 9, beatsPerBar: 3 },
    { type: 'outro',   bars: [6, 6],   energy: 2, beatsPerBar: 3 },
  ],

  // ── Folk ───────────────────────────────────────────────────────
  folk_standard: [
    { type: 'intro',   bars: [4, 4],   energy: 3 },
    { type: 'verse',   bars: [8, 8],   energy: 5 },
    { type: 'chorus',  bars: [8, 8],   energy: 7 },
    { type: 'verse',   bars: [8, 8],   energy: 6 },
    { type: 'chorus',  bars: [8, 8],   energy: 8 },
    { type: 'bridge',  bars: [4, 8],   energy: 5 },
    { type: 'chorus',  bars: [8, 8],   energy: 8 },
    { type: 'outro',   bars: [4, 4],   energy: 3 },
  ],
  folk_short: [
    { type: 'intro',   bars: [4, 4],   energy: 3 },
    { type: 'verse',   bars: [6, 8],   energy: 5 },
    { type: 'chorus',  bars: [8, 8],   energy: 7 },
    { type: 'verse',   bars: [6, 8],   energy: 6 },
    { type: 'chorus',  bars: [8, 8],   energy: 8 },
    { type: 'outro',   bars: [4, 6],   energy: 3 },
  ],

  // ── Jazz ───────────────────────────────────────────────────────
  jazz_standard: [
    { type: 'intro',   bars: [4, 4],   energy: 4 },
    { type: 'verse',   bars: [8, 8],   energy: 5 },
    { type: 'chorus',  bars: [8, 8],   energy: 7 },
    { type: 'bridge',  bars: [8, 8],   energy: 6 },
    { type: 'chorus',  bars: [8, 8],   energy: 8 },
    { type: 'outro',   bars: [4, 4],   energy: 3 },
  ],
  jazz_aaba: [                         // classic AABA jazz form (32 bars)
    { type: 'intro',   bars: [4, 4],   energy: 4 },
    { type: 'verse',   bars: [8, 8],   energy: 5 },  // A
    { type: 'verse',   bars: [8, 8],   energy: 6 },  // A
    { type: 'bridge',  bars: [8, 8],   energy: 7 },  // B
    { type: 'verse',   bars: [8, 8],   energy: 7 },  // A
    { type: 'outro',   bars: [4, 8],   energy: 3 },
  ],

  // ── Neo Soul ───────────────────────────────────────────────────
  neo_soul_standard: [
    { type: 'intro',   bars: [4, 8],   energy: 3 },
    { type: 'verse',   bars: [8, 8],   energy: 5 },
    { type: 'chorus',  bars: [8, 8],   energy: 7 },
    { type: 'verse',   bars: [8, 8],   energy: 6 },
    { type: 'chorus',  bars: [8, 8],   energy: 8 },
    { type: 'bridge',  bars: [4, 8],   energy: 5 },
    { type: 'chorus',  bars: [8, 8],   energy: 9 },
    { type: 'outro',   bars: [4, 8],   energy: 3 },
  ],

  // ── Pop Rock ───────────────────────────────────────────────────
  pop_rock_standard: [
    { type: 'intro',  bars: [4, 4],  energy: 3 },
    { type: 'verse',  bars: [8, 8],  energy: 5 },
    { type: 'chorus', bars: [8, 8],  energy: 8 },
    { type: 'verse',  bars: [8, 8],  energy: 6 },
    { type: 'chorus', bars: [8, 8],  energy: 9 },
    { type: 'bridge', bars: [4, 8],  energy: 5 },
    { type: 'chorus', bars: [8, 8],  energy: 10 },
    { type: 'outro',  bars: [4, 4],  energy: 3 },
  ],
  pop_rock_short: [
    { type: 'intro',  bars: [4, 4],  energy: 3 },
    { type: 'verse',  bars: [8, 8],  energy: 5 },
    { type: 'chorus', bars: [8, 8],  energy: 8 },
    { type: 'verse',  bars: [8, 8],  energy: 6 },
    { type: 'chorus', bars: [8, 8],  energy: 9 },
    { type: 'outro',  bars: [4, 4],  energy: 3 },
  ],

  // ── Bossa Nova ─────────────────────────────────────────────────
  bossa_nova_standard: [
    { type: 'intro',   bars: [4, 4],   energy: 3 },
    { type: 'verse',   bars: [8, 8],   energy: 5 },
    { type: 'chorus',  bars: [8, 8],   energy: 7 },
    { type: 'verse',   bars: [8, 8],   energy: 6 },
    { type: 'chorus',  bars: [8, 8],   energy: 8 },
    { type: 'bridge',  bars: [8, 8],   energy: 5 },
    { type: 'chorus',  bars: [8, 8],   energy: 8 },
    { type: 'outro',   bars: [4, 4],   energy: 3 },
  ],
  bossa_nova_aaba: [                     // forma AABA jazz — 32 bar
    { type: 'intro',   bars: [4, 4],   energy: 3 },
    { type: 'verse',   bars: [8, 8],   energy: 5 },  // A
    { type: 'verse',   bars: [8, 8],   energy: 6 },  // A
    { type: 'bridge',  bars: [8, 8],   energy: 7 },  // B
    { type: 'verse',   bars: [8, 8],   energy: 7 },  // A
    { type: 'outro',   bars: [4, 4],   energy: 3 },
  ],

  // ── Blues Rock ─────────────────────────────────────────────────
  blues_rock_standard: [
    { type: 'intro',   bars: [4, 4],   energy: 4 },
    { type: 'verse',   bars: [8, 8],   energy: 5 },
    { type: 'chorus',  bars: [8, 8],   energy: 8 },
    { type: 'verse',   bars: [8, 8],   energy: 6 },
    { type: 'chorus',  bars: [8, 8],   energy: 9 },
    { type: 'bridge',  bars: [4, 8],   energy: 6 },
    { type: 'chorus',  bars: [8, 8],   energy: 10 },
    { type: 'outro',   bars: [4, 4],   energy: 4 },
  ],

  // ── Singer/Songwriter ──────────────────────────────────────────
  singer_songwriter_standard: [
    { type: 'intro',   bars: [4, 4],   energy: 2 },
    { type: 'verse',   bars: [8, 8],   energy: 4 },
    { type: 'chorus',  bars: [8, 8],   energy: 7 },
    { type: 'verse',   bars: [8, 8],   energy: 5 },
    { type: 'chorus',  bars: [8, 8],   energy: 8 },
    { type: 'bridge',  bars: [4, 8],   energy: 4 },
    { type: 'chorus',  bars: [8, 8],   energy: 8 },
    { type: 'outro',   bars: [4, 4],   energy: 2 },
  ],

  // ── Classical Chamber ──────────────────────────────────────────
  classical_standard: [
    { type: 'intro',   bars: [4, 4],   energy: 4 },
    { type: 'verse',   bars: [8, 8],   energy: 5 },
    { type: 'chorus',  bars: [8, 8],   energy: 7 },
    { type: 'verse',   bars: [8, 8],   energy: 6 },
    { type: 'chorus',  bars: [8, 8],   energy: 8 },
    { type: 'bridge',  bars: [4, 8],   energy: 5 },
    { type: 'chorus',  bars: [8, 8],   energy: 9 },
    { type: 'outro',   bars: [4, 8],   energy: 3 },
  ],

  // ── Latin / Afro-Cuban ─────────────────────────────────────────
  latin_standard: [
    { type: 'intro',   bars: [4, 4],   energy: 4 },
    { type: 'verse',   bars: [8, 8],   energy: 6 },
    { type: 'chorus',  bars: [8, 8],   energy: 8 },
    { type: 'verse',   bars: [8, 8],   energy: 7 },
    { type: 'chorus',  bars: [8, 8],   energy: 9 },
    { type: 'bridge',  bars: [4, 8],   energy: 6 },
    { type: 'chorus',  bars: [8, 8],   energy: 10 },
    { type: 'outro',   bars: [4, 4],   energy: 4 },
  ],

  // ── Cinematic / Orchestral ─────────────────────────────────────
  cinematic_standard: [
    { type: 'intro',   bars: [8, 8],   energy: 3 },
    { type: 'verse',   bars: [8, 8],   energy: 5 },
    { type: 'chorus',  bars: [8, 8],   energy: 7 },
    { type: 'verse',   bars: [8, 8],   energy: 6 },
    { type: 'chorus',  bars: [8, 8],   energy: 9 },
    { type: 'bridge',  bars: [8, 8],   energy: 5 },
    { type: 'chorus',  bars: [8, 8],   energy: 10 },
    { type: 'outro',   bars: [8, 8],   energy: 3 },
  ],

  // ── Reggae / Dub ───────────────────────────────────────────────
  reggae_standard: [
    { type: 'intro',   bars: [4, 4],   energy: 4 },
    { type: 'verse',   bars: [8, 8],   energy: 6 },
    { type: 'chorus',  bars: [8, 8],   energy: 8 },
    { type: 'verse',   bars: [8, 8],   energy: 6 },
    { type: 'chorus',  bars: [8, 8],   energy: 8 },
    { type: 'bridge',  bars: [4, 8],   energy: 5 },
    { type: 'chorus',  bars: [8, 8],   energy: 9 },
    { type: 'outro',   bars: [4, 4],   energy: 4 },
  ],

  // ── Lo-Fi ────────────────────────────────────────────────────────
  // Dinamica volutamente contenuta — il genere vive di ripetizione rilassata,
  // non di picchi drammatici.
  lo_fi_standard: [
    { type: 'intro',   bars: [4, 4],   energy: 2 },
    { type: 'verse',   bars: [8, 8],   energy: 4 },
    { type: 'chorus',  bars: [8, 8],   energy: 6 },
    { type: 'verse',   bars: [8, 8],   energy: 4 },
    { type: 'chorus',  bars: [8, 8],   energy: 6 },
    { type: 'bridge',  bars: [4, 8],   energy: 3 },
    { type: 'chorus',  bars: [8, 8],   energy: 7 },
    { type: 'outro',   bars: [4, 4],   energy: 2 },
  ],

  // ── Punk ─────────────────────────────────────────────────────────
  // Canzoni brevi, dirette, quasi sempre a piena energia — three chords
  // and the truth. Poche battute per sezione, niente indugi.
  punk_standard: [
    { type: 'intro',   bars: [4, 4],   energy: 6 },
    { type: 'verse',   bars: [8, 8],   energy: 7 },
    { type: 'chorus',  bars: [8, 8],   energy: 9 },
    { type: 'verse',   bars: [8, 8],   energy: 7 },
    { type: 'chorus',  bars: [8, 8],   energy: 9 },
    { type: 'bridge',  bars: [4, 4],   energy: 6 },
    { type: 'chorus',  bars: [8, 8],   energy: 10 },
    { type: 'outro',   bars: [4, 4],   energy: 8 },
  ],
  punk_short: [
    { type: 'intro',   bars: [4, 4],   energy: 6 },
    { type: 'verse',   bars: [8, 8],   energy: 7 },
    { type: 'chorus',  bars: [8, 8],   energy: 9 },
    { type: 'verse',   bars: [8, 8],   energy: 7 },
    { type: 'chorus',  bars: [8, 8],   energy: 10 },
    { type: 'outro',   bars: [4, 4],   energy: 8 },
  ],

  // ── Garage Rock ──────────────────────────────────────────────────
  garage_rock_standard: [
    { type: 'intro',   bars: [4, 4],   energy: 5 },
    { type: 'verse',   bars: [8, 8],   energy: 6 },
    { type: 'chorus',  bars: [8, 8],   energy: 8 },
    { type: 'verse',   bars: [8, 8],   energy: 6 },
    { type: 'chorus',  bars: [8, 8],   energy: 9 },
    { type: 'bridge',  bars: [4, 8],   energy: 5 },
    { type: 'chorus',  bars: [8, 8],   energy: 10 },
    { type: 'outro',   bars: [4, 4],   energy: 6 },
  ],

  // ── 8-Bit / Chiptune ───────────────────────────────────────────
  // Energia sempre alta e brillante, tipica dei loop da videogioco.
  chiptune_standard: [
    { type: 'intro',   bars: [4, 4],   energy: 5 },
    { type: 'verse',   bars: [8, 8],   energy: 6 },
    { type: 'chorus',  bars: [8, 8],   energy: 8 },
    { type: 'verse',   bars: [8, 8],   energy: 7 },
    { type: 'chorus',  bars: [8, 8],   energy: 9 },
    { type: 'bridge',  bars: [4, 8],   energy: 8 },   // "boss battle" section
    { type: 'chorus',  bars: [8, 8],   energy: 10 },
    { type: 'outro',   bars: [4, 4],   energy: 6 },
  ],
};

