/**
 * SectionPresets.js
 * ─────────────────────────────────────────────────────────────────
 * Preset dei moduli strumentali (drums/bass/guitar/piano/ensemble) per
 * ogni combinazione forma/sezione. Estratto da SongArchitect.js
 * (sessione R1 — PLAN35). File grande (dati densi) per costruzione.
 * ─────────────────────────────────────────────────────────────────
 */

// 4. SECTION MODULE PRESETS
// ═══════════════════════════════════════════════════════════════════

/**
 * For each style × section type: which modules are active and how.
 * energy (1-10) from the song form overrides/modulates these where noted.
 *
 * Module params here are the "style defaults" —
 * the Engine may further modulate them based on energy level.
 *
 * Structure per module:
 *   active: bool
 *   style:  string (maps to module's internal style enum)
 *   density: float 0-1
 *   dynamics: string 'ppp'|'pp'|'p'|'mp'|'mf'|'f'|'ff'
 *   extra: object (module-specific overrides)
 */
export const SECTION_PRESETS = {

  // ── MTV Unplugged style ────────────────────────────────────────
  // Arco chitarra: arpeggio (intro) → fingerpicking (verse) → strumming (chorus)
  //                → fingerpicking (bridge) → arpeggio (outro)
  unplugged: {
    intro: {
      drums:    { active: false },
      bass:     { active: false },
      guitar:   { active: true,  style: 'arpeggio',      density: 0.3, dynamics: 'pp' },
      piano:    { active: false },
      ensemble: { active: false },
    },
    verse: {
      drums:    { active: true,  style: 'brushes',       density: 0.3, dynamics: 'p',  rest_probability: 0.0  },
      bass:     { active: true,  style: 'fingerstyle',   density: 0.35,dynamics: 'p',  rest_probability: 0.10 },
      guitar:   { active: true,  style: 'fingerpicking', density: 0.5, dynamics: 'mp', rest_probability: 0.12 },
      piano:    { active: true,  style: 'ballad',        density: 0.3, dynamics: 'p',  rest_probability: 0.15 },
      ensemble: { active: true,  style: 'pad',           density: 0.2, dynamics: 'pp', rest_probability: 0.0  },
    },
    chorus: {
      drums:    { active: true,  style: 'cajon',         density: 0.6, dynamics: 'mf' },
      bass:     { active: true,  style: 'fingerstyle',   density: 0.55,dynamics: 'mp' },
      guitar:   { active: true,  style: 'strumming',     density: 0.7, dynamics: 'mf' },
      piano:    { active: true,  style: 'comping',       density: 0.5, dynamics: 'mp' },
      ensemble: { active: true,  style: 'melodic',       density: 0.5, dynamics: 'mp' },
    },
    bridge: {
      drums:    { active: false },
      bass:     { active: true,  style: 'fingerstyle',   density: 0.25,dynamics: 'pp' },
      // M2 (PLAN35): prima riusava 'fingerpicking' identico alla strofa, solo più
      // piano — ora usa 'arpeggio' (già presente in intro/outro di questo stile)
      // per dare al bridge una texture davvero diversa, non solo più silenziosa.
      guitar:   { active: true,  style: 'arpeggio',      density: 0.35,dynamics: 'p'  },
      piano:    { active: false },
      ensemble: { active: true,  style: 'pad',           density: 0.3, dynamics: 'p'  },
    },
    outro: {
      drums:    { active: false },
      bass:     { active: true,  style: 'fingerstyle',   density: 0.2, dynamics: 'pp' },
      guitar:   { active: true,  style: 'arpeggio',      density: 0.25,dynamics: 'pp' },
      piano:    { active: false },
      ensemble: { active: false },
    },
  },

  // ── Folk style ────────────────────────────────────────────────
  // Arco chitarra: arpeggio (intro) → fingerpicking (verse) → strumming (chorus)
  //                → fingerpicking (bridge) → fingerpicking (outro, fade)
  folk: {
    intro: {
      drums:    { active: false },
      bass:     { active: false },
      guitar:   { active: true,  style: 'arpeggio',      density: 0.4, dynamics: 'p'  },
      piano:    { active: false },
      ensemble: { active: false },
    },
    verse: {
      drums:    { active: true,  style: 'brushes',       density: 0.4, dynamics: 'mp', rest_probability: 0.0  },
      bass:     { active: true,  style: 'walking',       density: 0.5, dynamics: 'mp', rest_probability: 0.10 },
      guitar:   { active: true,  style: 'fingerpicking', density: 0.6, dynamics: 'mf', rest_probability: 0.08 },
      piano:    { active: true,  style: 'alberti_bass',  density: 0.4, dynamics: 'mp', rest_probability: 0.12 },
      ensemble: { active: false },
    },
    chorus: {
      drums:    { active: true,  style: 'rock',          density: 0.7, dynamics: 'f'  },
      bass:     { active: true,  style: 'walking',       density: 0.7, dynamics: 'mf' },
      guitar:   { active: true,  style: 'strumming',     density: 0.8, dynamics: 'f'  },
      piano:    { active: true,  style: 'gospel_pump',   density: 0.6, dynamics: 'f'  },
      ensemble: { active: true,  style: 'pad',           density: 0.4, dynamics: 'mp' },
    },
    bridge: {
      drums:    { active: true,  style: 'brushes',       density: 0.3, dynamics: 'p'  },
      bass:     { active: true,  style: 'fingerstyle',   density: 0.3, dynamics: 'p'  },
      // M2 (PLAN35): 'arpeggio' invece di 'fingerpicking' identico alla strofa —
      // texture già presente in intro, dà al bridge un'identità propria.
      guitar:   { active: true,  style: 'arpeggio',      density: 0.4, dynamics: 'mp' },
      piano:    { active: false },
      ensemble: { active: false },
    },
    outro: {
      drums:    { active: false },
      bass:     { active: true,  style: 'fingerstyle',   density: 0.3, dynamics: 'p'  },
      guitar:   { active: true,  style: 'fingerpicking', density: 0.3, dynamics: 'p'  },
      piano:    { active: false },
      ensemble: { active: false },
    },
  },

  // ── Neo Soul ──────────────────────────────────────────────────
  // Arco chitarra: fingerpicking (intro) → arpeggio (verse) → riff (chorus)
  //                → arpeggio (bridge, riprende quota) → fingerpicking (outro)
  neo_soul: {
    intro: {
      drums:    { active: false },
      bass:     { active: true,  style: 'fingerstyle',   density: 0.3, dynamics: 'p'  },
      guitar:   { active: true,  style: 'fingerpicking', density: 0.3, dynamics: 'p'  },
      piano:    { active: true,  style: 'new_age_flow',  density: 0.3, dynamics: 'pp' },
      ensemble: { active: false },
    },
    verse: {
      drums:    { active: true,  style: 'brushes',       density: 0.4, dynamics: 'mp', rest_probability: 0.0  },
      bass:     { active: true,  style: 'fingerstyle',   density: 0.5, dynamics: 'mp', rest_probability: 0.12 },
      guitar:   { active: true,  style: 'arpeggio',      density: 0.5, dynamics: 'mp', rest_probability: 0.10 },
      piano:    { active: true,  style: 'comping',       density: 0.4, dynamics: 'mp', rest_probability: 0.15 },
      ensemble: { active: true,  style: 'pad',           density: 0.25,dynamics: 'p',  rest_probability: 0.0  },
    },
    chorus: {
      drums:    { active: true,  style: 'cajon',         density: 0.6, dynamics: 'mf' },
      bass:     { active: true,  style: 'walking',       density: 0.6, dynamics: 'mf' },
      guitar:   { active: true,  style: 'riff',          density: 0.65,dynamics: 'mf' },
      piano:    { active: true,  style: 'comping',       density: 0.55,dynamics: 'mf' },
      ensemble: { active: true,  style: 'melodic',       density: 0.4, dynamics: 'mp' },
    },
    bridge: {
      drums:    { active: true,  style: 'brushes',       density: 0.3, dynamics: 'p'  },
      bass:     { active: true,  style: 'fingerstyle',   density: 0.35,dynamics: 'p'  },
      // M2 (PLAN35): 'fingerpicking' invece di 'arpeggio' identico alla strofa —
      // texture già presente in intro/outro, dà contrasto reale rispetto alla strofa.
      guitar:   { active: true,  style: 'fingerpicking', density: 0.4, dynamics: 'mp' },
      piano:    { active: true,  style: 'new_age_flow',  density: 0.35,dynamics: 'p'  },
      ensemble: { active: true,  style: 'pad',           density: 0.3, dynamics: 'pp' },
    },
    outro: {
      drums:    { active: false },
      bass:     { active: true,  style: 'fingerstyle',   density: 0.25,dynamics: 'pp' },
      guitar:   { active: true,  style: 'fingerpicking', density: 0.2, dynamics: 'pp' },
      piano:    { active: true,  style: 'new_age_flow',  density: 0.2, dynamics: 'pp' },
      ensemble: { active: false },
    },
  },

  // ── Jazz Ballad ────────────────────────────────────────────────
  // Arco chitarra: assente (jazz non ha chitarra rock)
  // Piano protagonista — comping jazz con swing
  jazz_ballad: {
    intro: {
      drums:    { active: false },
      bass:     { active: true,  style: 'walking',     density: 0.3, dynamics: 'pp' },
      guitar:   { active: false },
      piano:    { active: true,  style: 'ballad',      density: 0.3, dynamics: 'pp' },
      ensemble: { active: true,  style: 'pad',         density: 0.2, dynamics: 'ppp'},
    },
    verse: {
      drums:    { active: true,  style: 'jazz_trio',   density: 0.4, dynamics: 'p',  rest_probability: 0.0  },
      bass:     { active: true,  style: 'walking',     density: 0.6, dynamics: 'mp', rest_probability: 0.10 },
      guitar:   { active: false },
      piano:    { active: true,  style: 'comping',     density: 0.5, dynamics: 'mp', rest_probability: 0.12 },
      ensemble: { active: true,  style: 'pad',         density: 0.35,dynamics: 'p',  rest_probability: 0.0  },
    },
    chorus: {
      drums:    { active: true,  style: 'jazz_trio',   density: 0.6, dynamics: 'mf' },
      bass:     { active: true,  style: 'walking',     density: 0.8, dynamics: 'mf' },
      guitar:   { active: false },
      piano:    { active: true,  style: 'comping',     density: 0.7, dynamics: 'mf' },
      ensemble: { active: true,  style: 'melodic',     density: 0.6, dynamics: 'mf' },
    },
    bridge: {
      drums:    { active: true,  style: 'brushes',     density: 0.3, dynamics: 'p'  },
      bass:     { active: true,  style: 'walking',     density: 0.5, dynamics: 'mp' },
      guitar:   { active: false },
      piano:    { active: true,  style: 'ballad',      density: 0.4, dynamics: 'p'  },
      ensemble: { active: true,  style: 'pad',         density: 0.3, dynamics: 'p'  },
    },
    outro: {
      drums:    { active: false },
      bass:     { active: true,  style: 'walking',     density: 0.3, dynamics: 'pp' },
      guitar:   { active: false },
      piano:    { active: true,  style: 'ballad',      density: 0.2, dynamics: 'ppp'},
      ensemble: { active: true,  style: 'pad',         density: 0.2, dynamics: 'ppp'},
    },
  },

  // ── Pop Rock ───────────────────────────────────────────────────
  // Arco chitarra: arpeggio (intro) → strumming (verse) → powerchord (chorus)
  //                → riff (bridge) → strumming (outro)
  pop_rock: {
    intro: {
      drums:    { active: false },
      bass:     { active: false },
      guitar:   { active: true,  style: 'arpeggio',    density: 0.4, dynamics: 'p'  },
      piano:    { active: false },
      ensemble: { active: false },
    },
    verse: {
      drums:    { active: true,  style: 'rock',        density: 0.5, dynamics: 'mp' },
      bass:     { active: true,  style: 'pick',        density: 0.5, dynamics: 'mp' },
      guitar:   { active: true,  style: 'strumming',   density: 0.6, dynamics: 'mp' },
      piano:    { active: true,  style: 'comping',     density: 0.4, dynamics: 'p'  },
      ensemble: { active: true,  style: 'pad',         density: 0.3, dynamics: 'p'  },
    },
    chorus: {
      drums:    { active: true,  style: 'rock',        density: 0.8, dynamics: 'f'  },
      bass:     { active: true,  style: 'pick',        density: 0.7, dynamics: 'f'  },
      guitar:   { active: true,  style: 'powerchord',  density: 0.8, dynamics: 'f'  },
      piano:    { active: true,  style: 'comping',     density: 0.6, dynamics: 'mf' },
      ensemble: { active: true,  style: 'melodic',     density: 0.5, dynamics: 'mf' },
    },
    bridge: {
      drums:    { active: true,  style: 'rock',        density: 0.5, dynamics: 'mp' },
      bass:     { active: true,  style: 'fingerstyle', density: 0.45,dynamics: 'mp' },
      guitar:   { active: true,  style: 'riff',        density: 0.6, dynamics: 'mp' },
      piano:    { active: true,  style: 'comping',     density: 0.4, dynamics: 'p'  },
      ensemble: { active: true,  style: 'pad',         density: 0.3, dynamics: 'p'  },
    },
    outro: {
      drums:    { active: true,  style: 'rock',        density: 0.4, dynamics: 'p'  },
      bass:     { active: true,  style: 'pick',        density: 0.4, dynamics: 'p'  },
      guitar:   { active: true,  style: 'strumming',   density: 0.4, dynamics: 'p'  },
      piano:    { active: false },
      ensemble: { active: false },
    },
  },

  // ── Bossa Nova ────────────────────────────────────────────────
  // Piano protagonista, chitarra classica, basso walking, no drums pesanti
  bossa_nova: {
    intro: {
      drums:    { active: false },
      bass:     { active: true,  style: 'walking',     density: 0.3, dynamics: 'pp'  },
      guitar:   { active: true,  style: 'fingerpicking',density: 0.3, dynamics: 'p'  },
      piano:    { active: true,  style: 'ballad',      density: 0.3, dynamics: 'pp' },
      ensemble: { active: false },
    },
    verse: {
      drums:    { active: true,  style: 'bossa',       density: 0.4, dynamics: 'p'  },
      bass:     { active: true,  style: 'walking',     density: 0.6, dynamics: 'mp' },
      guitar:   { active: true,  style: 'fingerpicking',density: 0.5, dynamics: 'mp' },
      piano:    { active: true,  style: 'comping',     density: 0.5, dynamics: 'mp' },
      ensemble: { active: true,  style: 'pad',         density: 0.25,dynamics: 'p'  },
    },
    chorus: {
      drums:    { active: true,  style: 'bossa',       density: 0.6, dynamics: 'mf' },
      bass:     { active: true,  style: 'walking',     density: 0.8, dynamics: 'mf' },
      guitar:   { active: true,  style: 'fingerpicking',density: 0.65,dynamics: 'mf' },
      piano:    { active: true,  style: 'comping',     density: 0.7, dynamics: 'mf' },
      ensemble: { active: true,  style: 'melodic',     density: 0.5, dynamics: 'mp' },
    },
    bridge: {
      drums:    { active: true,  style: 'brushes',     density: 0.3, dynamics: 'p'  },
      bass:     { active: true,  style: 'walking',     density: 0.5, dynamics: 'mp' },
      guitar:   { active: true,  style: 'arpeggio',    density: 0.4, dynamics: 'p'  },
      piano:    { active: true,  style: 'ballad',      density: 0.4, dynamics: 'p'  },
      ensemble: { active: true,  style: 'pad',         density: 0.3, dynamics: 'p'  },
    },
    outro: {
      drums:    { active: false },
      bass:     { active: true,  style: 'walking',     density: 0.3, dynamics: 'pp' },
      guitar:   { active: true,  style: 'fingerpicking',density: 0.25,dynamics: 'pp' },
      piano:    { active: true,  style: 'ballad',      density: 0.2, dynamics: 'ppp'},
      ensemble: { active: false },
    },
  },

  // ── Blues Rock ────────────────────────────────────────────────
  // Chitarra protagonista (riff/powerchord), drums shuffle, ottoni su chorus
  blues_rock: {
    intro: {
      drums:    { active: false },
      bass:     { active: false },
      guitar:   { active: true,  style: 'riff',        density: 0.5, dynamics: 'mp' },
      piano:    { active: false },
      ensemble: { active: false },
    },
    verse: {
      drums:    { active: true,  style: 'blues_shuffle',density: 0.55,dynamics: 'mp' },
      bass:     { active: true,  style: 'pick',        density: 0.55,dynamics: 'mp' },
      guitar:   { active: true,  style: 'riff',        density: 0.65,dynamics: 'mf' },
      piano:    { active: true,  style: 'comping',     density: 0.4, dynamics: 'mp' },
      ensemble: { active: false },
    },
    chorus: {
      drums:    { active: true,  style: 'blues_shuffle',density: 0.8, dynamics: 'f'  },
      bass:     { active: true,  style: 'pick',        density: 0.7, dynamics: 'f'  },
      guitar:   { active: true,  style: 'powerchord',  density: 0.8, dynamics: 'f'  },
      piano:    { active: true,  style: 'comping',     density: 0.6, dynamics: 'mf' },
      ensemble: { active: true,  style: 'pad',         density: 0.4, dynamics: 'mf' },
    },
    bridge: {
      drums:    { active: true,  style: 'blues_shuffle',density: 0.5, dynamics: 'mp' },
      bass:     { active: true,  style: 'fingerstyle', density: 0.5, dynamics: 'mp' },
      // M2 (PLAN35): 'strumming' invece di 'riff' identico a intro/strofa —
      // texture già presente nell'outro, dà al bridge un colore proprio.
      guitar:   { active: true,  style: 'strumming',   density: 0.6, dynamics: 'mp' },
      piano:    { active: true,  style: 'comping',     density: 0.45,dynamics: 'mp' },
      ensemble: { active: false },
    },
    outro: {
      drums:    { active: true,  style: 'blues_shuffle',density: 0.45,dynamics: 'mp' },
      bass:     { active: true,  style: 'pick',        density: 0.4, dynamics: 'p'  },
      guitar:   { active: true,  style: 'strumming',   density: 0.45,dynamics: 'mp' },
      piano:    { active: false },
      ensemble: { active: false },
    },
  },

  // ── Singer/Songwriter ─────────────────────────────────────────
  // Chitarra acustica protagonista, arrangiamento minimalista, camera su chorus
  singer_songwriter: {
    intro: {
      drums:    { active: false },
      bass:     { active: false },
      guitar:   { active: true,  style: 'arpeggio',    density: 0.3, dynamics: 'p'  },
      piano:    { active: false },
      ensemble: { active: false },
    },
    verse: {
      drums:    { active: true,  style: 'brushes',     density: 0.3, dynamics: 'p'  },
      bass:     { active: true,  style: 'fingerstyle', density: 0.35,dynamics: 'p'  },
      guitar:   { active: true,  style: 'fingerpicking',density: 0.5, dynamics: 'mp' },
      piano:    { active: true,  style: 'ballad',      density: 0.3, dynamics: 'p'  },
      ensemble: { active: false },
    },
    chorus: {
      drums:    { active: true,  style: 'cajon',       density: 0.55,dynamics: 'mf' },
      bass:     { active: true,  style: 'fingerstyle', density: 0.55,dynamics: 'mp' },
      guitar:   { active: true,  style: 'strumming',   density: 0.65,dynamics: 'mf' },
      piano:    { active: true,  style: 'comping',     density: 0.45,dynamics: 'mp' },
      ensemble: { active: true,  style: 'pad',         density: 0.35,dynamics: 'mp' },
    },
    bridge: {
      drums:    { active: false },
      bass:     { active: true,  style: 'fingerstyle', density: 0.25,dynamics: 'pp' },
      // M2 (PLAN35): 'arpeggio' invece di 'fingerpicking' identico alla strofa —
      // texture già presente in intro/outro, dà al bridge un colore proprio.
      guitar:   { active: true,  style: 'arpeggio',    density: 0.35,dynamics: 'p'  },
      piano:    { active: true,  style: 'ballad',      density: 0.3, dynamics: 'p'  },
      ensemble: { active: true,  style: 'pad',         density: 0.25,dynamics: 'pp' },
    },
    outro: {
      drums:    { active: false },
      bass:     { active: true,  style: 'fingerstyle', density: 0.2, dynamics: 'pp' },
      guitar:   { active: true,  style: 'arpeggio',    density: 0.25,dynamics: 'pp' },
      piano:    { active: false },
      ensemble: { active: false },
    },
  },

  // ── Waltz 3/4 — arpeggio lento, ritmo ternario ────────────────
  unplugged_waltz: {
    intro: {
      drums:    { active: false },
      bass:     { active: false },
      guitar:   { active: true,  style: 'arpeggio',      density: 0.25,dynamics: 'pp' },
      piano:    { active: false },
      ensemble: { active: false },
    },
    verse: {
      drums:    { active: true,  style: 'brushes',       density: 0.25,dynamics: 'p'  },
      bass:     { active: true,  style: 'fingerstyle',   density: 0.3, dynamics: 'p'  },
      guitar:   { active: true,  style: 'waltz_8th',     density: 0.45,dynamics: 'mp' },
      piano:    { active: true,  style: 'ballad',        density: 0.25,dynamics: 'p'  },
      ensemble: { active: true,  style: 'pad',           density: 0.2, dynamics: 'pp' },
    },
    chorus: {
      drums:    { active: true,  style: 'cajon',         density: 0.5, dynamics: 'mf' },
      bass:     { active: true,  style: 'fingerstyle',   density: 0.5, dynamics: 'mp' },
      guitar:   { active: true,  style: 'waltz_8th',     density: 0.6, dynamics: 'mf' },
      piano:    { active: true,  style: 'comping',       density: 0.4, dynamics: 'mp' },
      ensemble: { active: true,  style: 'melodic',       density: 0.4, dynamics: 'mp' },
    },
    bridge: {
      drums:    { active: false },
      bass:     { active: true,  style: 'fingerstyle',   density: 0.2, dynamics: 'pp' },
      guitar:   { active: true,  style: 'arpeggio',      density: 0.3, dynamics: 'p'  },
      piano:    { active: false },
      ensemble: { active: true,  style: 'pad',           density: 0.25,dynamics: 'p'  },
    },
    outro: {
      drums:    { active: false },
      bass:     { active: true,  style: 'fingerstyle',   density: 0.18,dynamics: 'pp' },
      guitar:   { active: true,  style: 'arpeggio',      density: 0.2, dynamics: 'pp' },
      piano:    { active: false },
      ensemble: { active: false },
    },
  },

  // ── Classical Chamber ─────────────────────────────────────────
  classical: {
    intro: {
      drums:    { active: false },
      bass:     { active: false },
      guitar:   { active: false },
      piano:    { active: true,  style: 'alberti_bass',  density: 0.4, dynamics: 'p'  },
      ensemble: { active: true,  style: 'pad',           density: 0.3, dynamics: 'pp' },
    },
    verse: {
      drums:    { active: false },
      bass:     { active: true,  style: 'walking',       density: 0.5, dynamics: 'mp' },
      guitar:   { active: false },
      piano:    { active: true,  style: 'alberti_bass',  density: 0.5, dynamics: 'mp' },
      ensemble: { active: true,  style: 'pad',           density: 0.4, dynamics: 'mp' },
    },
    chorus: {
      drums:    { active: false },
      bass:     { active: true,  style: 'walking',       density: 0.6, dynamics: 'mf' },
      guitar:   { active: false },
      piano:    { active: true,  style: 'comping',       density: 0.6, dynamics: 'mf' },
      ensemble: { active: true,  style: 'melodic',       density: 0.6, dynamics: 'mf' },
    },
    bridge: {
      drums:    { active: false },
      bass:     { active: true,  style: 'fingerstyle',   density: 0.3, dynamics: 'p'  },
      guitar:   { active: false },
      piano:    { active: true,  style: 'ballad',        density: 0.3, dynamics: 'p'  },
      ensemble: { active: true,  style: 'pad',           density: 0.35,dynamics: 'p'  },
    },
    outro: {
      drums:    { active: false },
      bass:     { active: true,  style: 'walking',       density: 0.3, dynamics: 'pp' },
      guitar:   { active: false },
      piano:    { active: true,  style: 'alberti_bass',  density: 0.3, dynamics: 'pp' },
      ensemble: { active: true,  style: 'pad',           density: 0.2, dynamics: 'ppp'},
    },
  },

  // ── Latin / Afro-Cuban ────────────────────────────────────────
  // Chitarra: riff (intro) → strumming (verse) → riff (chorus/bridge) → arpeggio (outro)
  latin: {
    intro: {
      drums:    { active: false },
      bass:     { active: true,  style: 'walking',       density: 0.4, dynamics: 'mp' },
      guitar:   { active: true,  style: 'riff',          density: 0.4, dynamics: 'mp' },
      piano:    { active: true,  style: 'comping',       density: 0.35,dynamics: 'p'  },
      ensemble: { active: false },
    },
    verse: {
      drums:    { active: true,  style: 'latin',         density: 0.55,dynamics: 'mf', rest_probability: 0.0 },
      bass:     { active: true,  style: 'walking',       density: 0.65,dynamics: 'mf', rest_probability: 0.08 },
      guitar:   { active: true,  style: 'strumming',     density: 0.6, dynamics: 'mf', rest_probability: 0.08 },
      piano:    { active: true,  style: 'comping',       density: 0.55,dynamics: 'mf', rest_probability: 0.10 },
      ensemble: { active: true,  style: 'pad',           density: 0.3, dynamics: 'mp', rest_probability: 0.0  },
    },
    chorus: {
      drums:    { active: true,  style: 'latin',         density: 0.75,dynamics: 'f'  },
      bass:     { active: true,  style: 'walking',       density: 0.8, dynamics: 'f'  },
      guitar:   { active: true,  style: 'riff',          density: 0.75,dynamics: 'f'  },
      piano:    { active: true,  style: 'comping',       density: 0.7, dynamics: 'mf' },
      ensemble: { active: true,  style: 'melodic',       density: 0.55,dynamics: 'mf' },
    },
    bridge: {
      drums:    { active: true,  style: 'latin',         density: 0.5, dynamics: 'mp' },
      bass:     { active: true,  style: 'walking',       density: 0.55,dynamics: 'mp' },
      guitar:   { active: true,  style: 'riff',          density: 0.55,dynamics: 'mp' },
      piano:    { active: true,  style: 'comping',       density: 0.45,dynamics: 'mp' },
      ensemble: { active: true,  style: 'pad',           density: 0.3, dynamics: 'p'  },
    },
    outro: {
      drums:    { active: false },
      bass:     { active: true,  style: 'walking',       density: 0.4, dynamics: 'mp' },
      guitar:   { active: true,  style: 'arpeggio',      density: 0.35,dynamics: 'p'  },
      piano:    { active: true,  style: 'comping',       density: 0.3, dynamics: 'p'  },
      ensemble: { active: false },
    },
  },

  // ── Cinematic / Orchestral ────────────────────────────────────
  // Ensemble protagonista — chitarra assente, piano orchestrale, drums timpani-like
  cinematic: {
    intro: {
      drums:    { active: false },
      bass:     { active: false },
      guitar:   { active: false },
      piano:    { active: true,  style: 'new_age_flow',  density: 0.35,dynamics: 'pp' },
      ensemble: { active: true,  style: 'pad',           density: 0.4, dynamics: 'p'  },
    },
    verse: {
      drums:    { active: true,  style: 'brushes',       density: 0.35,dynamics: 'p',  rest_probability: 0.0  },
      bass:     { active: true,  style: 'walking',       density: 0.45,dynamics: 'mp', rest_probability: 0.10 },
      guitar:   { active: false },
      piano:    { active: true,  style: 'alberti_bass',  density: 0.45,dynamics: 'mp', rest_probability: 0.12 },
      ensemble: { active: true,  style: 'pad',           density: 0.5, dynamics: 'mp', rest_probability: 0.0  },
    },
    chorus: {
      drums:    { active: true,  style: 'rock',          density: 0.65,dynamics: 'mf' },
      bass:     { active: true,  style: 'walking',       density: 0.65,dynamics: 'mf' },
      guitar:   { active: false },
      piano:    { active: true,  style: 'comping',       density: 0.6, dynamics: 'mf' },
      ensemble: { active: true,  style: 'melodic',       density: 0.7, dynamics: 'f'  },
    },
    bridge: {
      drums:    { active: false },
      bass:     { active: true,  style: 'fingerstyle',   density: 0.3, dynamics: 'p'  },
      guitar:   { active: false },
      piano:    { active: true,  style: 'ballad',        density: 0.35,dynamics: 'p'  },
      ensemble: { active: true,  style: 'pad',           density: 0.45,dynamics: 'mp' },
    },
    outro: {
      drums:    { active: false },
      bass:     { active: false },
      guitar:   { active: false },
      piano:    { active: true,  style: 'new_age_flow',  density: 0.25,dynamics: 'pp' },
      ensemble: { active: true,  style: 'pad',           density: 0.35,dynamics: 'p'  },
    },
  },

  // ── Reggae / Dub ──────────────────────────────────────────────
  // Chitarra: skank (offbeat) — stile definito; basso prominente con riff
  reggae: {
    intro: {
      drums:    { active: false },
      bass:     { active: true,  style: 'fingerstyle',   density: 0.45,dynamics: 'mp' },
      guitar:   { active: true,  style: 'skank',         density: 0.5, dynamics: 'mp' },
      piano:    { active: false },
      ensemble: { active: false },
    },
    verse: {
      drums:    { active: true,  style: 'reggae',        density: 0.5, dynamics: 'mf', rest_probability: 0.0  },
      bass:     { active: true,  style: 'fingerstyle',   density: 0.65,dynamics: 'mf', rest_probability: 0.08 },
      guitar:   { active: true,  style: 'skank',         density: 0.65,dynamics: 'mf', rest_probability: 0.08 },
      piano:    { active: true,  style: 'comping',       density: 0.35,dynamics: 'mp', rest_probability: 0.15 },
      ensemble: { active: false },
    },
    chorus: {
      drums:    { active: true,  style: 'reggae',        density: 0.7, dynamics: 'f'  },
      bass:     { active: true,  style: 'fingerstyle',   density: 0.75,dynamics: 'f'  },
      guitar:   { active: true,  style: 'skank',         density: 0.75,dynamics: 'f'  },
      piano:    { active: true,  style: 'comping',       density: 0.5, dynamics: 'mf' },
      ensemble: { active: true,  style: 'pad',           density: 0.35,dynamics: 'mp' },
    },
    bridge: {
      drums:    { active: true,  style: 'reggae',        density: 0.4, dynamics: 'mp' },
      bass:     { active: true,  style: 'fingerstyle',   density: 0.5, dynamics: 'mp' },
      guitar:   { active: true,  style: 'skank',         density: 0.5, dynamics: 'mp' },
      piano:    { active: false },
      ensemble: { active: false },
    },
    outro: {
      drums:    { active: false },
      bass:     { active: true,  style: 'fingerstyle',   density: 0.4, dynamics: 'mp' },
      guitar:   { active: true,  style: 'skank',         density: 0.45,dynamics: 'mp' },
      piano:    { active: false },
      ensemble: { active: false },
    },
  },

  // ── Lo-Fi ────────────────────────────────────────────────────────
  // Piano rhodes (hip_hop_keys) protagonista, batteria boom-bap sparsa,
  // chitarra minima solo di colore — arrangiamento volutamente rado.
  lo_fi: {
    intro: {
      drums:    { active: false },
      bass:     { active: false },
      guitar:   { active: false },
      piano:    { active: true,  style: 'hip_hop_keys',  density: 0.25,dynamics: 'pp' },
      ensemble: { active: false },
    },
    verse: {
      drums:    { active: true,  style: 'lofi',          density: 0.35,dynamics: 'mp', rest_probability: 0.15 },
      bass:     { active: true,  style: 'fingerstyle',   density: 0.4, dynamics: 'mp', rest_probability: 0.10 },
      guitar:   { active: true,  style: 'fingerpicking', density: 0.25,dynamics: 'p',  rest_probability: 0.20 },
      piano:    { active: true,  style: 'hip_hop_keys',  density: 0.5, dynamics: 'mp' },
      ensemble: { active: true,  style: 'pad',           density: 0.2, dynamics: 'p'  },
    },
    chorus: {
      drums:    { active: true,  style: 'lofi',          density: 0.5, dynamics: 'mf' },
      bass:     { active: true,  style: 'fingerstyle',   density: 0.55,dynamics: 'mf' },
      guitar:   { active: true,  style: 'fingerpicking', density: 0.35,dynamics: 'mp' },
      piano:    { active: true,  style: 'hip_hop_keys',  density: 0.65,dynamics: 'mf' },
      ensemble: { active: true,  style: 'pad',           density: 0.35,dynamics: 'mp' },
    },
    bridge: {
      drums:    { active: true,  style: 'lofi',          density: 0.3, dynamics: 'p',  rest_probability: 0.20 },
      bass:     { active: true,  style: 'fingerstyle',   density: 0.35,dynamics: 'p'  },
      guitar:   { active: false },
      piano:    { active: true,  style: 'hip_hop_keys',  density: 0.4, dynamics: 'p'  },
      ensemble: { active: true,  style: 'pad',           density: 0.25,dynamics: 'p'  },
    },
    outro: {
      drums:    { active: false },
      bass:     { active: true,  style: 'fingerstyle',   density: 0.25,dynamics: 'pp' },
      guitar:   { active: false },
      piano:    { active: true,  style: 'hip_hop_keys',  density: 0.3, dynamics: 'pp' },
      ensemble: { active: false },
    },
  },

  // ── Punk ─────────────────────────────────────────────────────────
  // Three chords and the truth: chitarra powerchord densa, basso ottavi
  // sincronizzato, batteria driving. Niente piano/ensemble — trio puro.
  punk: {
    intro: {
      drums:    { active: true,  style: 'punk',          density: 0.6, dynamics: 'f'  },
      bass:     { active: true,  style: 'pick',          density: 0.6, dynamics: 'f'  },
      guitar:   { active: true,  style: 'powerchord',    density: 0.6, dynamics: 'f'  },
      piano:    { active: false },
      ensemble: { active: false },
    },
    verse: {
      drums:    { active: true,  style: 'punk',          density: 0.7, dynamics: 'f'  },
      bass:     { active: true,  style: 'pick',          density: 0.75,dynamics: 'f'  },
      guitar:   { active: true,  style: 'powerchord',    density: 0.75,dynamics: 'f'  },
      piano:    { active: false },
      ensemble: { active: false },
    },
    chorus: {
      drums:    { active: true,  style: 'punk',          density: 0.9, dynamics: 'ff' },
      bass:     { active: true,  style: 'pick',          density: 0.9, dynamics: 'ff' },
      guitar:   { active: true,  style: 'powerchord',    density: 0.9, dynamics: 'ff' },
      piano:    { active: false },
      ensemble: { active: false },
    },
    bridge: {
      drums:    { active: true,  style: 'punk',          density: 0.55,dynamics: 'mf' },
      bass:     { active: true,  style: 'pick',          density: 0.6, dynamics: 'mf' },
      guitar:   { active: true,  style: 'riff',          density: 0.6, dynamics: 'mf' },
      piano:    { active: false },
      ensemble: { active: false },
    },
    outro: {
      drums:    { active: true,  style: 'punk',          density: 0.8, dynamics: 'f'  },
      bass:     { active: true,  style: 'pick',          density: 0.8, dynamics: 'f'  },
      guitar:   { active: true,  style: 'powerchord',    density: 0.8, dynamics: 'f'  },
      piano:    { active: false },
      ensemble: { active: false },
    },
  },

  // ── Garage Rock ──────────────────────────────────────────────────
  // Riff sporchi anni '60, batteria semplice e diretta (drumLine 'acoustic'
  // → style 'rock'), niente overdub orchestrale.
  garage_rock: {
    intro: {
      drums:    { active: false },
      bass:     { active: false },
      guitar:   { active: true,  style: 'riff',          density: 0.5, dynamics: 'mf' },
      piano:    { active: false },
      ensemble: { active: false },
    },
    verse: {
      drums:    { active: true,  style: 'rock',          density: 0.5, dynamics: 'mf' },
      bass:     { active: true,  style: 'pick',          density: 0.55,dynamics: 'mf' },
      guitar:   { active: true,  style: 'riff',          density: 0.6, dynamics: 'mf' },
      piano:    { active: false },
      ensemble: { active: false },
    },
    chorus: {
      drums:    { active: true,  style: 'rock',          density: 0.8, dynamics: 'f'  },
      bass:     { active: true,  style: 'pick',          density: 0.75,dynamics: 'f'  },
      guitar:   { active: true,  style: 'powerchord',    density: 0.8, dynamics: 'f'  },
      piano:    { active: false },
      ensemble: { active: false },
    },
    bridge: {
      drums:    { active: true,  style: 'rock',          density: 0.5, dynamics: 'mp' },
      bass:     { active: true,  style: 'fingerstyle',   density: 0.5, dynamics: 'mp' },
      // M2 (PLAN35): 'powerchord' invece di 'riff' identico a intro/strofa/outro —
      // a dinamica 'mp' anticipa il colore del chorus senza copiarne la potenza.
      guitar:   { active: true,  style: 'powerchord',    density: 0.55,dynamics: 'mp' },
      piano:    { active: false },
      ensemble: { active: false },
    },
    outro: {
      drums:    { active: true,  style: 'rock',          density: 0.55,dynamics: 'mf' },
      bass:     { active: true,  style: 'pick',          density: 0.5, dynamics: 'mf' },
      guitar:   { active: true,  style: 'riff',          density: 0.5, dynamics: 'mf' },
      piano:    { active: false },
      ensemble: { active: false },
    },
  },

  // ── 8-Bit / Chiptune ───────────────────────────────────────────
  // Piano in alberti_bass simula l'onda quadra pulsante, chitarra in
  // arpeggio veloce simula l'onda triangolare — trio chip puro, niente pad.
  chiptune: {
    intro: {
      drums:    { active: false },
      bass:     { active: true,  style: 'pick',          density: 0.4, dynamics: 'mp' },
      guitar:   { active: true,  style: 'arpeggio',      density: 0.5, dynamics: 'mp' },
      piano:    { active: true,  style: 'alberti_bass',  density: 0.4, dynamics: 'mp' },
      ensemble: { active: false },
    },
    verse: {
      drums:    { active: true,  style: 'chiptune',      density: 0.55,dynamics: 'mf' },
      bass:     { active: true,  style: 'pick',          density: 0.6, dynamics: 'mf' },
      guitar:   { active: true,  style: 'arpeggio',      density: 0.65,dynamics: 'mf' },
      piano:    { active: true,  style: 'alberti_bass',  density: 0.6, dynamics: 'mf' },
      ensemble: { active: false },
    },
    chorus: {
      drums:    { active: true,  style: 'chiptune',      density: 0.8, dynamics: 'f'  },
      bass:     { active: true,  style: 'pick',          density: 0.8, dynamics: 'f'  },
      guitar:   { active: true,  style: 'arpeggio',      density: 0.85,dynamics: 'f'  },
      piano:    { active: true,  style: 'alberti_bass',  density: 0.8, dynamics: 'f'  },
      ensemble: { active: false },
    },
    bridge: {
      drums:    { active: true,  style: 'chiptune',      density: 0.7, dynamics: 'f'  },
      bass:     { active: true,  style: 'pick',          density: 0.7, dynamics: 'mf' },
      guitar:   { active: true,  style: 'riff',          density: 0.65,dynamics: 'mf' },
      piano:    { active: true,  style: 'alberti_bass',  density: 0.65,dynamics: 'mf' },
      ensemble: { active: false },
    },
    outro: {
      drums:    { active: true,  style: 'chiptune',      density: 0.6, dynamics: 'mf' },
      bass:     { active: true,  style: 'pick',          density: 0.55,dynamics: 'mf' },
      guitar:   { active: true,  style: 'arpeggio',      density: 0.55,dynamics: 'mf' },
      piano:    { active: true,  style: 'alberti_bass',  density: 0.5, dynamics: 'mp' },
      ensemble: { active: false },
    },
  },

};

