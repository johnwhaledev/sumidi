/**
 * Percussionist.js  v0.9 — Groove LumBeat: micro-timing, flam, velocity curves
 * ─────────────────────────────────────────────────────────────────────────
 * v0.9 (Fase 1 - Groove):
 *   1. Micro-timing drift: kick anticipa 3-8ms, snare lazy backbeat +5-15ms
 *   2. Flam technique: doppio colpo snare con 5ms delay su backbeat principale
 *   3. Velocity curves esponenziali: 6 layer dinamici per più espressività
 *   4. Fill anticipation: inizio fill 1/16 prima per transizioni fluide
 *   5. Ghost notes ancorate alla griglia HH: rare sui quarti, dense sugli offbeat
 *   6. Open HH strategico: prima del fill (beat 4) e fine frase (ogni 4 bar)
 *   7. Fill con crescendo velocity: ogni fill cresce da 70% → 100% verso il downbeat
 * ─────────────────────────────────────────────────────────────────────────
 * v0.5:
 *   1. Ghost notes ancorate alla griglia HH: rare sui quarti, dense sugli offbeat
 *   2. Open HH strategico: prima del fill (beat 4) e fine frase (ogni 4 bar)
 *   3. Fill con crescendo velocity: ogni fill cresce da 70% → 100% verso il downbeat
 * ─────────────────────────────────────────────────────────────────────────
 * v0.4:
 *   1. SNARE_RIMSHOT (40) per backbeat principale — timbro realistico
 *   2. kick_extra_bar2: passo kick aggiunto solo sul bar 2 del pattern 2-bar
 *   3. 5 tipi di fill: tom_run, snare_roll, crash_accent, flam_tom, kick_burst
 *   4. Velocity ramp nei 2 beat prima del fill (pre-fill crescendo)
 *   5. Pedale HH su beat 2&4 per groove standard (non ride, non brushes)
 *   6. Variazione su ripetizioni: ghost note e HH più densi al 2°+ passaggio
 * ─────────────────────────────────────────────────────────────────────────
 */

import { makeRng } from './SongArchitect.js';
import { buildRhythmGrid, msToTick, arcVelocity } from './FlowCore.js';

// ═══════════════════════════════════════════════════════════════════
// GROOVE ENGINE — Micro-timing & Humanizing
// ═══════════════════════════════════════════════════════════════════

/**
 * Applica micro-timing drift realistico ai drum events
 * Kick anticipa (drive), snare ritarda (lazy backbeat)
 * @param {Array} events — array di eventi drum
 * @param {number} bpm — tempo in BPM
 * @param {number} ppq — pulses per quarter note
 * @param {Object} rng — random generator
 */
function applyGrooveDrift(events, bpm, ppq, rng) {
  for (const ev of events) {
    const isKick = ev.note === GM.KICK || ev.note === GM.KICK2;
    const isSnare = ev.note === GM.SNARE || ev.note === GM.SNARE_RIMSHOT || ev.note === GM.CROSS_STICK;
    
    if (isKick) {
      // Kick anticipa 3-8ms per drive (più aggressivo a tempo alto).
      // Clamp a 0: a bpm molto alti (es. punk 160-190) il drift in tick può
      // superare il tick assoluto di un kick vicino all'inizio del brano,
      // producendo tick negativi (bug latente, mai emerso ai bpm precedenti).
      const anticipationMs = rng.int(3, 8);
      const driftTick = Math.round(msToTick(anticipationMs, bpm, ppq));
      ev.tick = Math.max(0, ev.tick - driftTick);
    } else if (isSnare) {
      // Snare lazy backbeat: ritarda 5-15ms per groove rilassato
      const lazyMs = rng.int(5, 15);
      const driftTick = Math.round(msToTick(lazyMs, bpm, ppq));
      ev.tick += driftTick;
    }
    // HH e altri rimangono sulla griglia per stabilità
  }
}

/**
 * Genera flam: doppio colpo con micro-delay per snare realistico
 * @param {number} baseTick — tick di base
 * @param {number} velocity — velocity principale
 * @param {number} s16 — durata sedicesimo in tick
 * @param {number} bpm — tempo
 * @param {number} ppq — pulses per quarter
 * @param {Object} rng — random generator
 * @returns {Array} — [evento principale, evento flam]
 */
function createFlam(baseTick, velocity, s16, bpm, ppq, rng) {
  // Flam: nota principale + ghost 5ms dopo
  const flamDelayMs = 5;
  const flamDelayTick = Math.max(1, Math.round(msToTick(flamDelayMs, bpm, ppq)));
  
  const mainNote = {
    tick: baseTick,
    note: GM.SNARE_RIMSHOT,
    velocity: velocity,
    duration: Math.round(s16 * 0.6)
  };
  
  const flamNote = {
    tick: baseTick + flamDelayTick,
    note: GM.SNARE,
    velocity: Math.round(velocity * 0.35), // Ghost flam
    duration: Math.round(s16 * 0.4)
  };
  
  return [mainNote, flamNote];
}

/**
 * Velocity curve esponenziale per dinamica più naturale
 * Converte valore lineare 0-1 in curva esponenziale
 * @param {number} x — input lineare 0-1
 * @param {number} curve — fattore curva (1.5 = default, >1 = più esponenziale)
 * @returns {number} — output curvato 0-1
 */
function expCurve(x, curve = 1.5) {
  return Math.pow(x, curve);
}

/**
 * Genera velocity con curve esponenziali e 6 layer dinamici
 * @param {string} layer — nome layer (pp, p, mp, mf, f, ff)
 * @param {Object} rng — random generator
 * @param {number} intensity — intensità 0-1 (default 0.5)
 * @returns {number} — velocity 1-127
 */
function velCurved(layer, rng, intensity = 0.5) {
  const curves = {
    pp:  { lo: 15, hi: 35,  curve: 2.0 },   // pianissimo — molto esponenziale
    p:   { lo: 30, hi: 50,  curve: 1.8 },   // piano
    mp:  { lo: 45, hi: 70,  curve: 1.5 },   // mezzo-piano (default)
    mf:  { lo: 65, hi: 90,  curve: 1.4 },   // mezzo-forte
    f:   { lo: 85, hi: 110, curve: 1.3 },   // forte
    ff:  { lo: 105, hi: 127, curve: 1.2 },  // fortissimo — quasi lineare
  };
  
  const c = curves[layer] ?? curves.mf;
  const raw = rng.int(0, 1000) / 1000; // 0-1 lineare
  const curved = expCurve(raw, c.curve);
  
  // Applica intensity per variare nel range
  const range = c.hi - c.lo;
  const velocity = Math.round(c.lo + (curved * range * (0.7 + intensity * 0.3)));
  
  return Math.min(127, Math.max(1, velocity));
}

// ═══════════════════════════════════════════════════════════════════

// ── GM Drum Map ───────────────────────────────────────────────────
export const GM = {
  KICK2:          35,
  KICK:           36,
  CROSS_STICK:    37,
  SNARE:          38,
  CLAP:           39,
  SNARE_RIMSHOT:  40,
  LOW_FLOOR_TOM:  41,
  CLOSED_HH:      42,
  HIGH_FLOOR_TOM: 43,
  PEDAL_HH:       44,
  LOW_TOM:        45,
  OPEN_HH:        46,
  LOW_MID_TOM:    47,
  HIGH_MID_TOM:   48,
  CRASH:          49,
  HIGH_TOM:       50,
  RIDE:           51,
  CHINA:          52,
  RIDE_BELL:      53,
  TAMBOURINE:     54,
  SPLASH:         55,
  COWBELL:        56,
  CRASH2:         57,
  VIBRASLAP:      58,
  RIDE2:          59,
  BONGO_HI:       60,
  BONGO_LO:       61,
  CAJON_HI:       62,
  CONGA_MUTE_HI:  62,
  CONGA_OPEN_HI:  63,
  CAJON_LO:       64,
  CONGA_LO:       64,
  TIMBALE_HI:     65,
  TIMBALE_LO:     66,
  AGOGO_HI:       67,
  AGOGO_LO:       68,
  CABASA:         69,
  MARACAS:        70,
  CLAVES:         75,
};

// ── Velocity Ranges Legacy (mantenuti per compatibilità) ──────────
const VEL = {
  kick_heavy:   [100, 115],
  kick_normal:  [85,  100],
  snare_heavy:  [100, 115],
  snare_normal: [80,  100],
  snare_ghost:  [20,   40],
  hh_accent:    [70,   85],
  hh_normal:    [50,   68],
  hh_brush:     [30,   50],
  ride_accent:  [75,   90],
  ride_normal:  [55,   70],
  tom:          [80,  105],
  crash:        [100, 120],
  cajon_slap:   [90,  110],
  cajon_tone:   [65,   85],
  cajon_ghost:  [25,   45],
};

function vel(key, rng) {
  const [lo, hi] = VEL[key] ?? [60, 80];
  return rng.int(lo, hi);
}

// ── Groove Params ─────────────────────────────────────────────────
// Esportati (R3) per permettere test di regressione sui pattern per stile/energia.
export const GROOVE_PARAMS = {

  rock_simple: {
    kick_steps: [0, 8], kick_extra_bar2: [10], kick_density: 0.15,
    pocket_steps: [10],
    snare_steps: [4, 12], snare_ghost: 0.10,
    hh_density: 0.50, groove: 'straight',
    flam_chance: 0.15, // v0.9: probabilità flam su backbeat
  },
  rock_busy: {
    kick_steps: [0, 6, 8, 13], kick_extra_bar2: [11], kick_density: 0.25,
    pocket_steps: [10],
    snare_steps: [4, 12], snare_ghost: 0.15, rb_ghosts: true,
    hh_density: 1.0, groove: 'straight',
    flam_chance: 0.20,
  },

  brushes_light: {
    kick_steps: [0, 8], kick_extra_bar2: [10], kick_density: 0.08,
    snare_steps: [4, 12], snare_ghost: 0.05,
    hh_density: 0.50, groove: 'straight',
    useCrossStick: true, useBrushes: true,
    flam_chance: 0.0, // No flam con brushes
  },
  brushes_medium: {
    kick_steps: [0, 8, 11], kick_extra_bar2: [10], kick_density: 0.12,
    snare_steps: [4, 7, 12], snare_ghost: 0.08,
    hh_density: 0.55, groove: 'straight',
    useCrossStick: true, useBrushes: true,
    flam_chance: 0.0,
  },

  cajon_simple: {
    kick_steps: [0, 8], kick_extra_bar2: [10], kick_density: 0.12,
    snare_steps: [4, 12], snare_ghost: 0.08,
    hh_density: 0.50, groove: 'straight',
    useCajon: true,
    flam_chance: 0.10,
  },
  cajon_syncopated: {
    kick_steps: [0, 3, 8], kick_extra_bar2: [11], kick_density: 0.22,
    snare_steps: [4, 12, 15], snare_ghost: 0.12,
    hh_density: 0.62, groove: 'straight',
    useCajon: true,
    flam_chance: 0.15,
  },

  bossa: {
    kick_steps: [0, 3, 6, 9, 12], kick_extra_bar2: [], kick_density: 0.0,
    snare_steps: [1, 4, 7, 9, 13], snare_ghost: 0.05,
    hh_density: 0.50, groove: 'bossa',
    useCrossStick: true,
    flam_chance: 0.0,
  },
  bossa_authentic: {
    kick_steps: [0, 8], kick_extra_bar2: [5], kick_density: 0.0,
    snare_steps: [2, 5, 7, 9, 12], snare_ghost: 0.05,
    hh_density: 0.50, groove: 'bossa',
    useCrossStick: true,
    flam_chance: 0.0,
  },

  // Jazz ride: 3 varianti reali (non solo volume) — sparse a bassa energia
  // (solo quarti, feel rilassato), busy ad alta energia (comping snare più
  // presente + ride più denso). rideVariant letto in _genBar (ramo useRide).
  jazz_ride_sparse: {
    kick_steps: [0], kick_extra_bar2: [], kick_density: 0.03,
    snare_steps: [], snare_ghost: 0.14,
    hh_density: 0.0, groove: 'swing',
    useRide: true, rideVariant: 'sparse',
    flam_chance: 0.0,
  },
  jazz_ride: {
    kick_steps: [0], kick_extra_bar2: [8], kick_density: 0.05,
    snare_steps: [], snare_ghost: 0.28,
    hh_density: 0.0, groove: 'swing',
    useRide: true, rideVariant: 'normal',
    flam_chance: 0.0,
  },
  jazz_ride_busy: {
    kick_steps: [0, 8], kick_extra_bar2: [6], kick_density: 0.10,
    snare_steps: [], snare_ghost: 0.38,
    hh_density: 0.0, groove: 'swing',
    useRide: true, rideVariant: 'busy',
    flam_chance: 0.0,
  },

  // Trap: 3 varianti — hi-hat e kick pattern realmente diversi, non solo volume
  trap_sparse: {
    kick_steps: [0], kick_extra_bar2: [], kick_density: 0.10,
    snare_steps: [8], snare_ghost: 0.05,
    hh_density: 0.55, groove: 'straight',
    flam_chance: 0.10,
  },
  trap: {
    kick_steps: [0, 6, 11], kick_extra_bar2: [14], kick_density: 0.22,
    snare_steps: [8], snare_ghost: 0.08,
    hh_density: 1.0, groove: 'straight',
    flam_chance: 0.25, // Trap usa molti flam
  },
  trap_busy: {
    kick_steps: [0, 3, 6, 10, 11], kick_extra_bar2: [14, 15], kick_density: 0.32,
    snare_steps: [8], snare_ghost: 0.18, rb_ghosts: true,
    hh_density: 1.0, groove: 'straight',
    flam_chance: 0.32,
    hhRoll: true, // v: raffica di 32esimi hi-hat tipica trap ad alta energia
  },

  pop_standard: {
    kick_steps: [0, 8], kick_extra_bar2: [10], kick_density: 0.12,
    pocket_steps: [10],
    snare_steps: [4, 12], snare_ghost: 0.08, rb_ghosts: true,
    hh_density: 0.50, groove: 'straight',
    flam_chance: 0.12,
  },

  blues_shuffle: {
    kick_steps: [0, 6, 8], kick_extra_bar2: [10], kick_density: 0.18,
    pocket_steps: [10],
    snare_steps: [4, 12], snare_ghost: 0.12,
    hh_density: 0.50, groove: 'shuffle',
    flam_chance: 0.18,
  },

  // Reggae: one-drop minimale a bassa energia → steppers (kick su ogni quarto)
  // ad alta energia, come nell'uso reale del genere (rockers/steppers feel).
  reggae_low: {
    kick_steps: [8], kick_extra_bar2: [], kick_density: 0.0,
    snare_steps: [8], snare_ghost: 0.02,
    hh_density: 0.35, groove: 'straight',
    useCrossStick: true,
    flam_chance: 0.0,
  },
  reggae: {
    kick_steps: [8], kick_extra_bar2: [], kick_density: 0.0,
    snare_steps: [8], snare_ghost: 0.05,
    hh_density: 0.55, groove: 'straight',
    useCrossStick: true,
    flam_chance: 0.0,
  },
  reggae_steppers: {
    kick_steps: [0, 4, 8, 12], kick_extra_bar2: [], kick_density: 0.05,
    snare_steps: [8], snare_ghost: 0.10,
    hh_density: 0.70, groove: 'straight',
    useCrossStick: true,
    flam_chance: 0.05,
  },

  waltz_light: {
    kick_steps: [0], kick_extra_bar2: [], kick_density: 0.0,
    snare_steps: [8], snare_ghost: 0.04,
    hh_density: 0.40, groove: 'straight',
    useBrushes: true, useCrossStick: true,
    flam_chance: 0.0,
  },
  waltz_full: {
    kick_steps: [0], kick_extra_bar2: [], kick_density: 0.05,
    snare_steps: [8], snare_ghost: 0.08,
    hh_density: 0.50, groove: 'straight',
    useBrushes: false, useCrossStick: false, useCajon: false,
    flam_chance: 0.0,
  },
  // Percussione latin/folk/bossa: percDensity varia lo strato di percussioni
  // effettivamente suonato (non solo il volume) — letto nel ramo usePercussion
  // di _genBar per aggiungere/togliere layer secondari (claves/tamburello/agogo extra).
  perc_latin_low: {
    usePercussion: true, percType: 'latin', percDensity: 'sparse',
    hh_density: 0.0, groove: 'straight',
    flam_chance: 0.0,
  },
  perc_latin: {
    usePercussion: true, percType: 'latin', percDensity: 'mid',
    hh_density: 0.0, groove: 'straight',
    flam_chance: 0.0,
  },
  perc_latin_high: {
    usePercussion: true, percType: 'latin', percDensity: 'dense',
    hh_density: 0.0, groove: 'straight',
    flam_chance: 0.0,
  },
  perc_folk_low: {
    usePercussion: true, percType: 'folk', percDensity: 'sparse',
    hh_density: 0.0, groove: 'straight',
    flam_chance: 0.0,
  },
  perc_folk: {
    usePercussion: true, percType: 'folk', percDensity: 'mid',
    hh_density: 0.0, groove: 'straight',
    flam_chance: 0.0,
  },
  perc_folk_high: {
    usePercussion: true, percType: 'folk', percDensity: 'dense',
    hh_density: 0.0, groove: 'straight',
    flam_chance: 0.0,
  },
  perc_bossa_low: {
    usePercussion: true, percType: 'bossa', percDensity: 'sparse',
    hh_density: 0.0, groove: 'bossa',
    flam_chance: 0.0,
  },
  perc_bossa: {
    usePercussion: true, percType: 'bossa', percDensity: 'mid',
    hh_density: 0.0, groove: 'bossa',
    flam_chance: 0.0,
  },
  perc_bossa_high: {
    usePercussion: true, percType: 'bossa', percDensity: 'dense',
    hh_density: 0.0, groove: 'bossa',
    flam_chance: 0.0,
  },

  // Lo-fi: boom-bap rilassato, hi-hat rade, molti "buchi" (rest_probability
  // fa il resto) — il groove qui resta semplice, lo swing è a livello stile.
  lofi_lazy: {
    kick_steps: [0, 8], kick_extra_bar2: [6], kick_density: 0.10,
    snare_steps: [4, 12], snare_ghost: 0.06,
    hh_density: 0.35, groove: 'swing',
    flam_chance: 0.05,
  },
  lofi_busy: {
    kick_steps: [0, 6, 8, 11], kick_extra_bar2: [10], kick_density: 0.16,
    snare_steps: [4, 12], snare_ghost: 0.10,
    hh_density: 0.45, groove: 'swing',
    flam_chance: 0.08,
  },

  // Punk: driving, tight, hi-hat quasi sempre chiuse, pochi ghost/flam
  // (raw e diretto, non ricercato). 3 varianti reali: low resta più vicino
  // a un rock semplice con hi-hat chiuso (intro/strofa), mid è il classico
  // "punk_drive" a 4/4 con kick su ogni beat, high aggiunge doppio kick,
  // ghost e rb_ghosts per i chorus/bridge più concitati.
  punk_drive_low: {
    kick_steps: [0, 8], kick_extra_bar2: [10], kick_density: 0.12,
    snare_steps: [4, 12], snare_ghost: 0.0,
    hh_density: 0.80, groove: 'straight',
    flam_chance: 0.0,
  },
  punk_drive: {
    kick_steps: [0, 4, 8, 12], kick_extra_bar2: [10], kick_density: 0.20,
    snare_steps: [4, 12], snare_ghost: 0.0,
    hh_density: 1.0, groove: 'straight',
    flam_chance: 0.05,
  },
  punk_drive_high: {
    kick_steps: [0, 4, 6, 8, 12, 14], kick_extra_bar2: [2, 10], kick_density: 0.32,
    snare_steps: [4, 12], snare_ghost: 0.10, rb_ghosts: true,
    hh_density: 1.0, groove: 'straight',
    flam_chance: 0.12, hhRoll: true,
  },

  // Garage rock: cugino "sporco" del punk — tempo percepito più lento,
  // groove 'swing' (invece di 'straight') per un pocket più sloppy, meno
  // hi-hat martellante e più ghost/flam per il feel meno preciso e più
  // umano tipico del garage. 3 varianti low/mid/high per la stessa energia
  // crescente delle altre famiglie rock-based.
  garage_rock_low: {
    kick_steps: [0, 8], kick_extra_bar2: [10], kick_density: 0.10,
    snare_steps: [4, 12], snare_ghost: 0.05,
    hh_density: 0.45, groove: 'swing',
    flam_chance: 0.10,
  },
  garage_rock: {
    kick_steps: [0, 7, 8], kick_extra_bar2: [10], kick_density: 0.16,
    snare_steps: [4, 12], snare_ghost: 0.08,
    hh_density: 0.60, groove: 'swing',
    flam_chance: 0.18,
  },
  garage_rock_high: {
    kick_steps: [0, 6, 7, 8, 11], kick_extra_bar2: [10, 14], kick_density: 0.24,
    snare_steps: [4, 12], snare_ghost: 0.14, rb_ghosts: true,
    hh_density: 0.75, groove: 'swing',
    flam_chance: 0.25,
  },

  // Chiptune: pattern quantizzato, meccanico, quasi assenza di ghost/flam
  // (l'hardware a 8 bit non aveva timing umano). 3 varianti per densità di
  // note reale (non solo volume): low è rado/minimale per intro/bridge,
  // mid è il pattern 8-bit "standard", high raddoppia hi-hat e aggiunge
  // hhRoll per il tipico arpeggio/roll meccanico dei chorus chiptune.
  chiptune_sparse: {
    kick_steps: [0, 8], kick_extra_bar2: [], kick_density: 0.04,
    snare_steps: [8], snare_ghost: 0.0,
    hh_density: 0.40, groove: 'straight',
    flam_chance: 0.0,
  },
  chiptune_drive: {
    kick_steps: [0, 4, 8, 12], kick_extra_bar2: [], kick_density: 0.10,
    snare_steps: [4, 12], snare_ghost: 0.0,
    hh_density: 0.75, groove: 'straight',
    flam_chance: 0.0,
  },
  chiptune_busy: {
    kick_steps: [0, 2, 4, 6, 8, 10, 12, 14], kick_extra_bar2: [], kick_density: 0.20,
    snare_steps: [4, 8, 12], snare_ghost: 0.05,
    hh_density: 1.0, groove: 'straight',
    flam_chance: 0.0, hhRoll: true,
  },
};

// Stile → GROOVE_PARAMS key per livello di energia
export const STYLE_PATTERNS = {
  brushes:       { low: 'brushes_light',  mid: 'brushes_light',  high: 'brushes_medium'   },
  cajon:         { low: 'cajon_simple',   mid: 'cajon_simple',   high: 'cajon_syncopated' },
  rock:          { low: 'rock_simple',    mid: 'rock_simple',    high: 'rock_busy'        },
  bossa:         { low: 'bossa',          mid: 'bossa_authentic',high: 'bossa_authentic'  },
  // Bug preesistente: SongArchitect.js usa lo style string 'jazz_trio' (mai
  // 'jazz' da solo) per i preset jazz_ballad — mancava questa chiave, quindi
  // il jazz ripiegava silenziosamente sul pattern 'rock' generico (nessuna
  // ride cymbal). Alias esplicito verso le stesse varianti jazz.
  jazz:          { low: 'jazz_ride_sparse', mid: 'jazz_ride',    high: 'jazz_ride_busy'   },
  jazz_trio:     { low: 'jazz_ride_sparse', mid: 'jazz_ride',    high: 'jazz_ride_busy'   },
  trap:          { low: 'trap_sparse',    mid: 'trap',           high: 'trap_busy'        },
  pop:           { low: 'pop_standard',  mid: 'pop_standard',   high: 'pop_standard'     },
  blues_shuffle: { low: 'blues_shuffle', mid: 'blues_shuffle',  high: 'blues_shuffle'    },
  reggae:        { low: 'reggae_low',    mid: 'reggae',         high: 'reggae_steppers'  },
  waltz_8th:     { low: 'waltz_light',  mid: 'waltz_light',    high: 'waltz_full'       },
  latin:         { low: 'perc_latin_low', mid: 'perc_latin',    high: 'perc_latin_high'  },
  folk_perc:     { low: 'perc_folk_low',  mid: 'perc_folk',     high: 'perc_folk_high'   },
  bossa_perc:    { low: 'perc_bossa_low', mid: 'perc_bossa',    high: 'perc_bossa_high'  },
  lofi:          { low: 'lofi_lazy',      mid: 'lofi_lazy',     high: 'lofi_busy'        },
  punk:          { low: 'punk_drive_low', mid: 'punk_drive',    high: 'punk_drive_high'  },
  garage_rock:   { low: 'garage_rock_low',mid: 'garage_rock',   high: 'garage_rock_high' },
  chiptune:      { low: 'chiptune_sparse',mid: 'chiptune_drive',high: 'chiptune_busy'    },
};

const FILL_TYPES = ['tom_run', 'snare_roll', 'crash_accent', 'flam_tom', 'kick_burst'];

// ═══════════════════════════════════════════════════════════════════
export function generateDrums(blueprint, seedOverride = null) {
  const { sections, meta } = blueprint;
  const ppq         = meta.ppq;
  const s16         = ppq / 4;
  const barTicks    = meta.barTicks;
  const stepsPerBar = (meta.beatsPerBar ?? 4) * 4;
  const bpm         = meta.bpm ?? 120; // v0.9: necessario per micro-timing
  const rng         = makeRng((seedOverride ?? meta.seed) ^ 0xDEAD);
  const events   = [];

  for (let si = 0; si < sections.length; si++) {
    const section    = sections[si];
    const drumPreset = section.modules.drums;
    if (!drumPreset?.active) continue;

    const style      = drumPreset.style ?? 'rock';
    const energy     = drumPreset.energyOverride ?? section.energy;
    // M3 (PLAN35): stesso arco dinamico per sezione già usato da basso/chitarra/
    // piano (velocityArcType, assegnato per tipo di sezione in SongArchitect.js).
    // Prima la batteria ignorava questo arco: la sua intensità dipendeva solo
    // dall'energia fissa della sezione, senza il crescendo/decrescendo di bar
    // in bar condiviso col resto della band.
    const arcType    = drumPreset.velocityArcType ?? 'flat';
    const energyKey  = energy <= 3 ? 'low' : energy <= 6 ? 'mid' : 'high';
    const fillChance = drumPreset.fillDensity != null
      ? drumPreset.fillDensity
      : (0.35 + (energy / 10) * 0.3);
    const repeatIdx  = section.index ?? 0;

    const patternLib  = STYLE_PATTERNS[style] ?? STYLE_PATTERNS['rock'];
    const patternName = patternLib[energyKey];
    const gp          = GROOVE_PARAMS[patternName] ?? GROOVE_PARAMS['rock_simple'];

    // Tipo e qualità armonica della prossima sezione attiva — determinano il fill di chiusura
    const nextSection      = sections.slice(si + 1).find(s => s.modules?.drums?.active);
    const nextSectionType  = nextSection?.type ?? null;
    const nextChordStr     = nextSection?.harmonicMap?.[0]?.chord ?? null;

    // Pre-decide fill bars: sempre l'ultimo; possibile anche a metà sezione lunga
    const fillBars = new Set();
    if (rng.bool(fillChance)) fillBars.add(section.bars - 1);
    if (section.bars >= 8 && rng.bool(fillChance * 0.4)) {
      const mid = Math.floor(section.bars / 2) - 1;
      if (mid > 0 && !fillBars.has(mid)) fillBars.add(mid);
    }

    for (let b = 0; b < section.bars; b++) {
      const barStart  = section.startTick + b * barTicks;
      const isFill    = fillBars.has(b);
      const isPreFill = fillBars.has(b + 1);

      // S3-C: Fill lunghezza variabile: 0.5/1/2 bar
      const fillLength = isFill ? _selectFillLength(nextSectionType, energy, rng) : 0;
      const isPreFill2 = fillLength === 2 && fillBars.has(b + 2); // if 2 bar fill
      
      const anticipationTicks = isFill && stepsPerBar === 16 ? Math.round(s16 * 0.5) : 0;
      const effectiveBarStart = barStart - anticipationTicks;

      if (isFill && stepsPerBar === 16) {
        if (fillLength === 0.5) {
          // Genera prima mezza battuta normale, mezza battuta fill
          _genBar(events, barStart, s16, ppq, rng, gp, b, { isPreFill, repeatIdx, energy, sectionBars: section.bars, maxStep: 8, ghostBoost: drumPreset.ghostBoost ?? 1.0, arcType }, stepsPerBar, bpm);
          _genFill(events, effectiveBarStart, s16, rng, gp, nextSectionType, bpm, ppq, anticipationTicks, 0.5, nextChordStr);
        } else if (fillLength === 2) {
          _genFill(events, effectiveBarStart, s16, rng, gp, nextSectionType, bpm, ppq, anticipationTicks, 2, nextChordStr);
        } else {
          _genFill(events, effectiveBarStart, s16, rng, gp, nextSectionType, bpm, ppq, anticipationTicks, 1, nextChordStr);
        }
      } else {
        _genBar(events, barStart, s16, ppq, rng, gp, b, { isPreFill, repeatIdx, energy, sectionBars: section.bars, ghostBoost: drumPreset.ghostBoost ?? 1.0, arcType }, stepsPerBar, bpm);
      }
    }
  }

  // v0.9: Applica micro-timing drift a tutti gli eventi generati
  applyGrooveDrift(events, bpm, ppq, rng);

  return events;
}

// ── Utilità per Lunghezza Fill ────────────────────────────────────
function _selectFillLength(nextSectionType, energy, rng) {
  if (nextSectionType === 'chorus') return rng.bool(0.3) ? 2 : 1;
  if (energy <= 4) return 0.5;
  return 1;
}

// ── Generatore di battuta ─────────────────────────────────────────
function _genBar(events, barStart, s16, ppq, rng, gp, barIdx, opts = {}, stepsPerBar = 16, bpm = 120) {
  const { isPreFill = false, repeatIdx = 0, energy = 5, sectionBars = 4, maxStep = stepsPerBar, ghostBoost = 1.0, arcType = 'flat' } = opts;
  const startIdx = events.length;

  // S3-A: Kick density reattiva (+30% fine sezione, -20% bar 0)
  let phraseBuildFactor = 1.0;
  if (sectionBars > 0) {
    const phrasePos = barIdx / sectionBars;
    if (barIdx === 0) phraseBuildFactor = 0.8;
    else if (phrasePos >= 0.7) phraseBuildFactor = 1.3;
  }

  const useCrossStick = gp.useCrossStick ?? false;
  const useBrushes    = gp.useBrushes    ?? false;
  const useCajon      = gp.useCajon      ?? false;
  const useRide       = gp.useRide       ?? false;

  // v0.9: Intensità per velocity curves
  // M3: nudge dell'intensità in base all'arco dinamico della sezione (stesso
  // arcType di basso/chitarra/piano) — influenza smorzata (× 0.5) perché qui
  // resta un accento sopra la dinamica energy-based esistente, non una
  // sostituzione: non vogliamo alterare accenti/ghost note già calibrati.
  const arcDelta  = (arcVelocity(64, barIdx, sectionBars, arcType) - 64) / 64;
  const intensity = Math.max(0.05, Math.min(1.0, energy / 10 + arcDelta * 0.5));

  if (gp.usePercussion) {
    const type = gp.percType;
    const durStep = Math.round(s16 * 0.7);
    // percDensity: varia il layer di percussioni REALMENTE suonato tra le
    // sezioni (non solo il volume) — 'sparse' toglie i layer secondari,
    // 'dense' aggiunge accenti extra sugli offbeat.
    const percDensity = gp.percDensity ?? 'mid';
    const isSparse = percDensity === 'sparse';
    const isDense  = percDensity === 'dense';

    if (type === 'latin') {
      for (let s = 0; s < stepsPerBar; s++) {
        const pos = s % 8;
        if (pos === 0 || pos === 2 || pos === 6) {
          events.push({ tick: barStart + s * s16, note: GM.CONGA_LO, velocity: velCurved('mf', rng, intensity), duration: durStep });
        } else if (pos === 4) {
          events.push({ tick: barStart + s * s16, note: GM.CONGA_OPEN_HI, velocity: velCurved('f', rng, intensity), duration: durStep });
        } else if (pos === 3 || pos === 7) {
          // Sparse: toglie del tutto le mute conga; dense: quasi sempre presenti
          const muteProb = isSparse ? 0.25 : isDense ? 0.90 : 0.7;
          if (rng.bool(muteProb)) events.push({ tick: barStart + s * s16, note: GM.CONGA_MUTE_HI, velocity: velCurved('mp', rng, intensity), duration: durStep });
        }
        // Sparse: solo le claves portanti (0,6); dense: aggiunge accenti extra
        const claveSteps = isSparse ? [0, 6]
                          : isDense ? [0, 3, 6, 9, 10, 12, 14]
                          : [0, 3, 6, 10, 12];
        if (claveSteps.includes(s)) {
          events.push({ tick: barStart + s * s16, note: GM.CLAVES, velocity: velCurved('f', rng, intensity), duration: durStep });
        }
      }
    } else if (type === 'folk') {
      for (let s = 0; s < stepsPerBar; s++) {
        // Sparse: shaker solo sui quarti; dense: shaker su ogni sedicesimo
        if (isSparse && s % 4 !== 0) { /* skip shaker */ }
        else {
          const shkLayer = (s % 2 === 0) ? 'mp' : 'p';
          events.push({ tick: barStart + s * s16, note: GM.CABASA, velocity: velCurved(shkLayer, rng, intensity), duration: durStep });
        }
        if (s % 4 === 2) {
          events.push({ tick: barStart + s * s16, note: GM.TAMBOURINE, velocity: velCurved('f', rng, intensity), duration: durStep });
        } else if (!isSparse && s % 2 === 0 && rng.bool(isDense ? 0.45 : 0.2)) {
          events.push({ tick: barStart + s * s16, note: GM.TAMBOURINE, velocity: velCurved('mp', rng, intensity), duration: durStep });
        }
      }
    } else if (type === 'bossa') {
      for (let s = 0; s < stepsPerBar; s++) {
        if (s % 2 === 0) {
          const layer = (s % 4 === 0) ? 'mf' : 'mp';
          events.push({ tick: barStart + s * s16, note: GM.MARACAS, velocity: velCurved(layer, rng, intensity), duration: durStep });
        } else if (isDense) {
          // Alta energia: maracas anche sugli offbeat per un feel più mosso
          events.push({ tick: barStart + s * s16, note: GM.MARACAS, velocity: velCurved('p', rng, intensity), duration: Math.round(durStep * 0.6) });
        }
        // Sparse: solo agogo lo (beat forti); dense: aggiunge colpi extra
        const agogoSteps = isSparse ? [0, 8]
                          : isDense ? [0, 3, 5, 6, 8, 11, 13, 14]
                          : [0, 3, 6, 8, 11, 14];
        if (agogoSteps.includes(s)) {
          const note = (s === 0 || s === 8) ? GM.AGOGO_LO : GM.AGOGO_HI;
          events.push({ tick: barStart + s * s16, note, velocity: velCurved('mf', rng, intensity), duration: durStep });
        }
      }
    }

    if (isPreFill) {
      const halfBar = barStart + ppq * 2;
      for (let i = startIdx; i < events.length; i++) {
        if (events[i].tick >= halfBar) {
          events[i] = { ...events[i], velocity: Math.min(127, events[i].velocity + 15) };
        }
      }
    }
    return;
  }

  // Backbeat principale: SNARE_RIMSHOT per timbro realistico
  const mainSnare = useCrossStick ? GM.CROSS_STICK : GM.SNARE_RIMSHOT;
  const velSuffix = useBrushes   ? 'hh_brush'     : 'hh_normal';
  const durHH     = Math.round(s16 * 0.5);
  const durKick   = Math.round(s16 * 0.7);
  const durSnare  = Math.round(s16 * 0.6);

  // Ripetizioni: ghost e HH leggermente più densi al 2°+ passaggio
  const repeatBoost = Math.min(0.20, repeatIdx * 0.07);
  const ghostProb   = Math.min(0.40, (gp.snare_ghost ?? 0.10) * ghostBoost + repeatBoost);
  const hhBoost     = Math.min(0.15, repeatIdx * 0.05);

  // ── Kick: anchor (sempre) + extra sul bar 2 + pocket a energia >= mid ──
  const isBar2       = barIdx % 2 === 1;
  const extraSteps   = isBar2 ? new Set(gp.kick_extra_bar2 ?? []) : new Set();
  const pocketSteps  = energy >= 5 ? new Set(gp.pocket_steps ?? []) : new Set();
  const kickAnchor   = new Set([...gp.kick_steps, ...pocketSteps]);

  const syncKickTicks = new Set(); // S3-B track syncopated kicks

  for (let step = 0; step < maxStep; step++) {
    const isAnchor = kickAnchor.has(step) || extraSteps.has(step);
    if (!isAnchor) {
      const syncProb = (step % 4 === 2)
        ? (gp.kick_density ?? 0) * 1.5 * phraseBuildFactor
        : (gp.kick_density ?? 0) * 0.4 * phraseBuildFactor;
      if (!rng.bool(syncProb)) continue;
    }
    const tick   = barStart + step * s16;
    const isDown = step % 4 === 0;
    if (!isDown) syncKickTicks.add(tick); // S3-B

    if (useCajon) {
      // v0.9: Velocity curves per cajon
      const layer = isDown ? 'f' : 'mf';
      events.push({ tick, note: GM.CAJON_LO, velocity: velCurved(layer, rng, intensity), duration: durKick });
    } else {
      // v0.9: Velocity curves esponenziali per kick
      const layer = isDown ? 'f' : 'mf';
      events.push({ tick, note: GM.KICK, velocity: velCurved(layer, rng, intensity), duration: durKick });
    }
  }

  // ── Snare: rimshot sui beat principali, SNARE su ghost ───────────
  const snareSet = new Set(gp.snare_steps);
  const flamChance = gp.flam_chance ?? 0.15;
  
  for (let step = 0; step < stepsPerBar; step++) {
    const isMain = snareSet.has(step);
    const isDownbeat  = step % 4 === 0;
    const ghostWeight = isDownbeat ? ghostProb * 0.15 : ghostProb;
    const isGhost     = !isMain && rng.bool(ghostWeight);
    if (!isMain && !isGhost) continue;

    const tick = barStart + step * s16;
    if (useCajon) {
      const layer = isMain ? 'f' : 'p';
      events.push({ tick, note: GM.CAJON_HI, velocity: velCurved(layer, rng, intensity), duration: durSnare });
    } else {
      // v0.9: Flam technique su backbeat principale
      const isBackbeat = step === 4 || step === 12;
      const useFlam = isMain && isBackbeat && !useCrossStick && rng.bool(flamChance);
      
      if (useFlam) {
        // Genera flam: main + ghost delay
        const layer = 'f';
        const v = velCurved(layer, rng, intensity);
        const flamEvents = createFlam(tick, v, s16, bpm, ppq, rng);
        events.push(...flamEvents);
      } else {
        const note = isMain ? mainSnare : GM.SNARE;
        const layer = isMain ? 'f' : 'pp';
        const v = velCurved(layer, rng, intensity);
        const d = isGhost ? Math.round(s16 * 0.4) : durSnare;
        events.push({ tick, note, velocity: v, duration: d });
      }
    }
  }

  // Se maxStep limita la battuta, non generare snare nel resto della battuta
  if (maxStep < stepsPerBar) {
    snareSet.clear();
  }

  // ── Ghost snare R&B: sedicesimi adiacenti agli snare principali ──
  if (gp.rb_ghosts && !useCajon && !useBrushes && energy >= 4) {
    const rbSteps = [2, 3, 6, 10, 11, 14];
    const rbProb  = 0.30 + Math.min(0.25, repeatBoost);
    for (const step of rbSteps) {
      if (snareSet.has(step)) continue;
      if (!rng.bool(rbProb)) continue;
      events.push({ tick: barStart + step * s16, note: GM.SNARE,
                    velocity: velCurved('pp', rng, intensity), duration: Math.round(s16 * 0.35) });
    }
  }

  // ── Hi-hat / Ride ─────────────────────────────────────────────
  if (useRide) {
    // Jazz ride: 3 varianti reali, non solo di volume.
    //  sparse → solo quarti (feel rilassato, "meno è meglio")
    //  normal → "ding ding-a ding" classico
    //  busy   → normal + comping snare leggero sugli "e" (voicing sincopato)
    const rideVariant = gp.rideVariant ?? 'normal';
    for (let step = 0; step < stepsPerBar; step++) {
      const isQuarter = step % 4 === 0;
      const isSkip    = step % 4 === 3;
      const play = rideVariant === 'sparse' ? isQuarter : (isQuarter || isSkip);
      if (play) {
        const layer = isQuarter ? 'mf' : 'mp';
        events.push({ tick: barStart + step * s16, note: GM.RIDE, velocity: velCurved(layer, rng, intensity), duration: durHH });
      }
    }
    if (rideVariant === 'busy') {
      // Comping snare leggero sugli "and" per un feel più mosso e interattivo
      for (const step of [2, 6, 10, 14]) {
        if (rng.bool(0.30)) {
          events.push({ tick: barStart + step * s16, note: GM.SNARE,
                        velocity: velCurved('pp', rng, intensity), duration: Math.round(s16 * 0.35) });
        }
      }
    }
    events.push({ tick: barStart + 4  * s16, note: GM.PEDAL_HH, velocity: velCurved('mp', rng, intensity), duration: durHH });
    if (stepsPerBar > 12) {
      events.push({ tick: barStart + 12 * s16, note: GM.PEDAL_HH, velocity: velCurved('mp', rng, intensity), duration: durHH });
    }
  } else {
    const effectiveDensity = Math.min(1.0, (gp.hh_density ?? 0.5) + hhBoost);
    const hhGrid = buildRhythmGrid(effectiveDensity, gp.groove, rng, ppq, barStart, stepsPerBar / 4);
    for (const { tick, weight } of hhGrid) {
      const step     = Math.round((tick - barStart) / s16);
      if (step >= maxStep) continue;
      
      // S3-B: HH ghost su kick sincopato
      if (syncKickTicks.has(tick)) {
        if (rng.bool(0.65)) continue; // skip
        events.push({ tick, note: GM.CLOSED_HH, velocity: rng.int(18, 28), duration: durHH });
        continue;
      }

      const isAccent = weight >= 0.7;
      const layer = isAccent ? 'mf' : 'mp';
      const isPhraseMark = barIdx % 4 === 3;
      const openHH = !useBrushes && (
        (isPreFill  && step === 12) ||
        (isPhraseMark && step === 14 && rng.bool(0.55)) ||
        (step % 4 === 3 && rng.bool(0.08))
      );
      const hhNote = openHH ? GM.OPEN_HH : GM.CLOSED_HH;
      events.push({ tick, note: hhNote, velocity: velCurved(layer, rng, intensity), duration: durHH });
    }

    // Pedale HH su beat 2&4
    if (!useBrushes && !useCajon) {
      events.push({ tick: barStart + 4  * s16, note: GM.PEDAL_HH, velocity: velCurved('mp', rng, intensity), duration: Math.round(s16 * 0.3) });
      if (stepsPerBar > 12) {
        events.push({ tick: barStart + 12 * s16, note: GM.PEDAL_HH, velocity: velCurved('mp', rng, intensity), duration: Math.round(s16 * 0.3) });
      }
    }

    // hhRoll: raffica di hi-hat chiuso in 32esimi tipica del trap ad alta
    // energia, su un beat scelto casualmente — differenzia davvero trap_busy
    // dal semplice aumento di volume.
    if (gp.hhRoll && rng.bool(0.5)) {
      const rollStep = rng.choice([2, 6, 10, 14]);
      const rollTick = barStart + rollStep * s16;
      for (let k = 0; k < 3; k++) {
        events.push({ tick: rollTick + k * Math.round(s16 / 3), note: GM.CLOSED_HH,
                      velocity: velCurved('mp', rng, intensity) - k * 6, duration: Math.round(s16 * 0.25) });
      }
    }
  }

  // ── Crash sul primo bar di sezione ────────────────────────────
  if (barIdx === 0) {
    const crashNote = repeatIdx === 0
      ? GM.CRASH
      : rng.bool(0.35) ? GM.SPLASH : rng.bool(0.23) ? GM.CHINA : GM.CRASH;
    events.push({ tick: barStart, note: crashNote, velocity: velCurved('ff', rng, intensity), duration: durSnare });
  }

  // ── Pre-fill ramp: ultimi 2 beat +15 velocity ─────────────────
  if (isPreFill) {
    const halfBar = barStart + ppq * 2;
    for (let i = startIdx; i < events.length; i++) {
      if (events[i].tick >= halfBar) {
        events[i] = { ...events[i], velocity: Math.min(127, events[i].velocity + 15) };
      }
    }
  }
}

// ── 5 tipi di fill (transizioni di sezione) ──────────────────────
// v0.9: Aggiunti parametri bpm, ppq, anticipationTicks per timing avanzato
function _genFill(events, barStart, s16, rng, gp, nextSectionType = null, bpm = 120, ppq = 480, anticipationTicks = 0, fillLenBars = 1, nextChordStr = null) {
  // S3-C: Supporto a 0.5, 1, 2 bar (step offset e step limite)
  const stepsMax = fillLenBars * 16;
  const sStart   = fillLenBars === 0.5 ? 8 : 0;
  if (fillLenBars === 2) barStart -= 16 * s16; // anticipa l'inizio se è 2 bar

  // Pool contestuale — combina tipo sezione e qualità armonica del prossimo accordo
  const chord   = nextChordStr ?? '';
  const isDom   = /7|dom/.test(chord) && !/maj7|min7/.test(chord); // dom7, 9, 13 ecc.
  const isBorr  = /dim|aug/.test(chord);
  const isMinor = /m(?!aj)|min/.test(chord);

  const fillPool = isDom
    ? ['snare_roll', 'crash_accent', 'flam_tom']       // tensione dominante → roll
    : isBorr
      ? ['tom_run', 'kick_burst', 'tom_run']            // cromatico/alterato → tom run
      : nextSectionType === 'chorus' || nextSectionType === 'bridge'
        ? ['crash_accent', 'tom_run', 'crash_accent', 'flam_tom']
        : nextSectionType === 'outro'
          ? ['snare_roll', 'flam_tom', 'kick_burst']
          : isMinor
            ? ['tom_run', 'snare_roll', 'flam_tom']     // minore → leggermente più pesante
            : FILL_TYPES;
  const fillType = rng.choice(fillPool);
  const cymbal   = gp.useRide ? GM.RIDE : GM.CRASH;
  const useCajon = gp.useCajon ?? false;
  const intensity = 0.8; // I fill sono sempre energici

  // Helper crescendo: scala da sStart a stepsMax.
  // Bug fix: alcuni rami (cajon) iterano step FISSI (0,2,4...14) invece che
  // il range [sStart, stepsMax) — con fill da 0.5 barra (sStart==stepsMax==8)
  // pos poteva finire ben fuori dal range atteso, facendo esplodere il
  // moltiplicatore (frazione negativa o >>1) e producendo velocity MIDI
  // fuori [1,127] (byte non validi). La frazione va sempre clampata a [0,1].
  const cresc = pos => {
    const frac = (pos - sStart) / (stepsMax - sStart || 1);
    return 0.70 + 0.30 * Math.max(0, Math.min(1, frac));
  };

  // v0.9: Se c'è anticipation, aggiungi un "pickup" prima del fill
  if (anticipationTicks > 0) {
    const pickupTick = barStart + sStart * s16;
    // Pickup: ghost note o kick leggero prima del fill
    if (!useCajon && !gp.useBrushes) {
      events.push({ 
        tick: pickupTick, 
        note: GM.SNARE, 
        velocity: velCurved('p', rng, 0.6), 
        duration: Math.round(s16 * 0.4) 
      });
    }
  }

  if (gp.usePercussion) {
    const notes = gp.percType === 'latin' ? [GM.CONGA_OPEN_HI, GM.CONGA_LO, GM.TIMBALE_HI] :
                  gp.percType === 'bossa' ? [GM.BONGO_HI, GM.BONGO_LO, GM.AGOGO_HI] :
                  [GM.TAMBOURINE, GM.CABASA];

    for (let s = sStart; s < stepsMax; s++) {
      if (s % 2 === 0 || rng.bool(0.6)) {
        const note = rng.choice(notes);
        const v = Math.round(velCurved('mf', rng, intensity) * cresc(s));
        events.push({ tick: barStart + s * s16 + anticipationTicks, note, velocity: v, duration: Math.round(s16 * 0.6) });
      }
    }
    return;
  }

  // Cajon: fill slap-tone con crescendo
  if (useCajon) {
    const cajonFill = [
      { s:  0, note: GM.CAJON_LO, layer: 'mf' },
      { s:  2, note: GM.CAJON_HI, layer: 'p' },
      { s:  4, note: GM.CAJON_HI, layer: 'f' },
      { s:  6, note: GM.CAJON_LO, layer: 'mf' },
      { s:  8, note: GM.CAJON_HI, layer: 'f' },
      { s: 10, note: GM.CAJON_HI, layer: 'p' },
      { s: 12, note: GM.CAJON_HI, layer: 'f' },
      { s: 14, note: GM.CAJON_HI, layer: 'ff' },
    ];
    cajonFill.forEach(({ s, note, layer }) => {
      const v = Math.round(velCurved(layer, rng, intensity) * cresc(s));
      events.push({ tick: barStart + s * s16 + anticipationTicks, note, velocity: v, duration: Math.round(s16 * 0.6) });
    });
    return;
  }

  // Brushes: swirl leggero + roll sedicesimi
  if (gp.useBrushes) {
    for (let s = 0; s < 8; s += 4) {
      const v = Math.round(velCurved('mp', rng, intensity) * (0.55 + 0.15 * (s / 4)));
      events.push({ tick: barStart + s * s16 + anticipationTicks, note: GM.SNARE, velocity: v, duration: Math.round(s16 * 0.8) });
    }
    for (let s = 8; s < 16; s++) {
      const v = Math.round(velCurved('mp', rng, intensity) * (0.55 + 0.45 * ((s - 8) / 7)));
      events.push({ tick: barStart + s * s16 + anticipationTicks, note: GM.SNARE, velocity: v, duration: Math.round(s16 * 0.5) });
    }
    events.push({ tick: barStart + 15 * s16 + anticipationTicks, note: cymbal, velocity: velCurved('ff', rng, intensity), duration: Math.round(s16 * 0.7) });
    return;
  }

  // Tutti i fill aprono con kick + crash sul beat 1 (se partono da 0)
  if (sStart === 0) {
    events.push({ tick: barStart + anticipationTicks, note: GM.KICK,  velocity: velCurved('ff', rng, intensity), duration: Math.round(s16 * 0.7) });
    events.push({ tick: barStart + anticipationTicks, note: cymbal,   velocity: velCurved('ff', rng, intensity), duration: Math.round(s16 * 0.7) });
  }

  switch (fillType) {
    case 'tom_run': {
      const toms = [GM.HIGH_TOM, GM.HIGH_MID_TOM, GM.LOW_MID_TOM, GM.LOW_TOM, GM.SNARE_RIMSHOT];
      const step = rng.bool(0.5) ? 2 : 4;
      for (let s = Math.max(sStart, step); s < stepsMax; s += step) {
        const idx = Math.min(toms.length - 1, Math.floor(((s - sStart) / (stepsMax - sStart)) * toms.length));
        const v   = Math.round(velCurved('f', rng, intensity) * cresc(s));
        events.push({ tick: barStart + s * s16 + anticipationTicks, note: toms[idx], velocity: v, duration: Math.round(s16 * 0.6) });
      }
      break;
    }
    case 'snare_roll': {
      // v0.9: Snare roll con flam integrati
      const rollStart = Math.max(sStart, Math.floor(stepsMax / 2)); // inizia a metà fill length
      for (let s = rollStart; s < stepsMax; s++) {
        const baseV = velCurved('mf', rng, intensity);
        const v = Math.round(baseV * (0.60 + 0.40 * (s - rollStart) / (stepsMax - rollStart - 1 || 1)));
        
        // Ogni 2 sedicesimi, aggiungi un flam
        if (s % 2 === 0 && s < stepsMax - 2) {
          const flamEvents = createFlam(barStart + s * s16 + anticipationTicks, v, s16, bpm, ppq, rng);
          events.push(...flamEvents);
        } else {
          events.push({ tick: barStart + s * s16 + anticipationTicks, note: GM.SNARE_RIMSHOT, velocity: v, duration: Math.round(s16 * 0.5) });
        }
      }
      break;
    }
    case 'crash_accent': {
      events.push({ tick: barStart + 4  * s16 + anticipationTicks, note: GM.SNARE_RIMSHOT, velocity: Math.round(velCurved('f', rng, intensity) * 0.72), duration: Math.round(s16 * 0.6) });
      events.push({ tick: barStart + 8  * s16 + anticipationTicks, note: GM.KICK,          velocity: Math.round(velCurved('mf', rng, intensity) * 0.82), duration: Math.round(s16 * 0.7) });
      events.push({ tick: barStart + 8  * s16 + anticipationTicks, note: GM.HIGH_TOM,      velocity: Math.round(velCurved('f', rng, intensity) * 0.82), duration: Math.round(s16 * 0.6) });
      events.push({ tick: barStart + 10 * s16 + anticipationTicks, note: GM.HIGH_MID_TOM,  velocity: Math.round(velCurved('f', rng, intensity) * 0.88), duration: Math.round(s16 * 0.6) });
      events.push({ tick: barStart + 12 * s16 + anticipationTicks, note: GM.LOW_MID_TOM,   velocity: Math.round(velCurved('f', rng, intensity) * 0.94), duration: Math.round(s16 * 0.6) });
      events.push({ tick: barStart + 14 * s16 + anticipationTicks, note: GM.SNARE_RIMSHOT, velocity: velCurved('ff', rng, intensity),                     duration: Math.round(s16 * 0.6) });
      break;
    }
    case 'flam_tom': {
      events.push({ tick: barStart + 4 * s16 + anticipationTicks, note: GM.SNARE_RIMSHOT, velocity: Math.round(velCurved('mf', rng, intensity) * 0.72), duration: Math.round(s16 * 0.6) });
      const cascade = [GM.HIGH_TOM, GM.HIGH_MID_TOM, GM.LOW_TOM, GM.SNARE_RIMSHOT];
      cascade.forEach((note, i) => {
        const pos = 8 + i * 2;
        const v   = Math.round(velCurved('f', rng, intensity) * cresc(pos));
        events.push({ tick: barStart + pos * s16 + anticipationTicks, note, velocity: v, duration: Math.round(s16 * 0.6) });
      });
      break;
    }
    case 'kick_burst': {
      events.push({ tick: barStart + 4 * s16 + anticipationTicks, note: GM.SNARE_RIMSHOT, velocity: Math.round(velCurved('f', rng, intensity) * 0.72), duration: Math.round(s16 * 0.6) });
      [8, 10, 12, 14].forEach(s => {
        const v = Math.round(velCurved('mf', rng, intensity) * cresc(s));
        events.push({ tick: barStart + s * s16 + anticipationTicks, note: GM.KICK, velocity: v, duration: Math.round(s16 * 0.5) });
      });
      events.push({ tick: barStart + 15 * s16 + anticipationTicks, note: GM.SNARE_RIMSHOT, velocity: velCurved('ff', rng, intensity), duration: Math.round(s16 * 0.6) });
      break;
    }
  }
}
