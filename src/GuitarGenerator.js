/**
 * GuitarGenerator.js  v0.8 — roll_up cap, CC76 vibrato, pattern p-i-m-a classico
 * ─────────────────────────────────────────────────────────────────────
 * v0.6:
 *   1. Riff: beat forte (step 0 e 8) → chord tone più vicina all'ancora
 *      Risolve il problema "riff melodicamente sconnesso dall'armonia"
 * ─────────────────────────────────────────────────────────────────────
 * v0.5:
 *   1. Stili powerchord e riff: _genPowerBar / _genRiffBar
 *   2. Groove offset su arpeggio: swing nudge +20% s16 su step dispari
 *   3. Treble velocity arc: hi voice +8, bass voice -6 (profilo dinamico)
 * ─────────────────────────────────────────────────────────────────────
 */

import { makeRng, clampToRegister, buildChordTonePool } from './SongArchitect.js';
import { PhraseMemory, chromaticApproach, selectContextualNote, arcVelocity, getMelodicCharacter } from './FlowCore.js';

export const GUITAR_PROGRAMS = {
  fingerpicking: 25,
  arpeggio:      25,
  strumming:     25,
  classical:     24,
  powerchord:    30,   // Overdriven guitar
  riff:          29,   // Muted/overdrive guitar
};

const BASS_STR   = { lo: 40, hi: 57 };
const TREBLE_STR = { lo: 55, hi: 76 };

// ── Fingerpicking patterns ────────────────────────────────────────
const TRAVIS_PATTERNS = {
  classic: [
    { step16: 0,  voice: 'bass'  },
    { step16: 2,  voice: 'mid'   },
    { step16: 4,  voice: 'fifth' },
    { step16: 6,  voice: 'hi'    },
    { step16: 8,  voice: 'bass'  },
    { step16: 10, voice: 'mid'   },
    { step16: 12, voice: 'fifth' },
    { step16: 14, voice: 'hi'    },
  ],
  pinch: [
    { step16: 0,  voice: 'pinch' },
    { step16: 4,  voice: 'mid'   },
    { step16: 6,  voice: 'hi'    },
    { step16: 8,  voice: 'pinch' },
    { step16: 12, voice: 'mid'   },
    { step16: 14, voice: 'hi'    },
  ],
  ballad: [
    { step16: 0,  voice: 'bass'  },
    { step16: 4,  voice: 'mid'   },
    { step16: 8,  voice: 'bass'  },
    { step16: 10, voice: 'hi'    },
    { step16: 12, voice: 'mid'   },
  ],
  // p-i-m-a classico: pollice(bass) → indice(low) → medio(mid) → anulare(hi)
  // Schema ascendente a ottavi con ritorno sull'upbeat — tecnica chitarra classica
  pima: [
    { step16: 0,  voice: 'bass' },  // p
    { step16: 2,  voice: 'low'  },  // i
    { step16: 4,  voice: 'mid'  },  // m
    { step16: 6,  voice: 'hi'   },  // a
    { step16: 7,  voice: 'mid'  },  // m (ritorno)
    { step16: 8,  voice: 'bass' },  // p
    { step16: 10, voice: 'low'  },  // i
    { step16: 12, voice: 'mid'  },  // m
    { step16: 14, voice: 'hi'   },  // a
    { step16: 15, voice: 'mid'  },  // m (ritorno)
  ],
  roll_up: [
    { step16: 0,  voice: 'bass'  },
    { step16: 1,  voice: 'low'   },
    { step16: 2,  voice: 'mid'   },
    { step16: 3,  voice: 'hi'    },
    { step16: 4,  voice: 'bass'  },
    { step16: 5,  voice: 'low'   },
    { step16: 6,  voice: 'mid'   },
    { step16: 7,  voice: 'hi'    },
    { step16: 8,  voice: 'bass'  },
    { step16: 9,  voice: 'low'   },
    { step16: 10, voice: 'mid'   },
    { step16: 11, voice: 'hi'    },
    { step16: 12, voice: 'bass'  },
    { step16: 13, voice: 'mid'   },
    { step16: 14, voice: 'hi'    },
    { step16: 15, voice: 'hi'    },
  ],
};

// ── Arpeggio patterns ─────────────────────────────────────────────
const ARPEGGIO_PATTERNS = {
  ascending:  [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 3],
  descending: [3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0],
  up_down:    [0, 1, 2, 3, 3, 2, 1, 0, 0, 1, 2, 3, 3, 2, 1, 0],
  pendulum:   [0, 2, 1, 3, 0, 2, 1, 3, 0, 2, 1, 3, 0, 2, 3, 0],
  waltz_8th:  [0, 1, 2, 1, 2, 1, 0, 1, 2, 1, 2, 1, 0, 1, 2, 1],
  sparse:     [0,-1, 1,-1, 2,-1, 1,-1, 0,-1, 2,-1, 3,-1, 2,-1],
};

// ── Strum patterns ────────────────────────────────────────────────
// Ogni entry: { step16, dir }  dir: 'D'=downstroke  'U'=upstroke
// Rappresentano i pattern D/U più comuni su chitarra acustica
const STRUM_PATTERNS = {
  // Folk semplice: D . D U . U D U
  folk: [
    { step16: 0,  dir: 'D' },
    { step16: 4,  dir: 'D' },
    { step16: 6,  dir: 'U' },
    { step16: 10, dir: 'U' },
    { step16: 12, dir: 'D' },
    { step16: 14, dir: 'U' },
  ],
  // Pop standard: D D U . U D U
  pop: [
    { step16: 0,  dir: 'D' },
    { step16: 4,  dir: 'D' },
    { step16: 6,  dir: 'U' },
    { step16: 10, dir: 'U' },
    { step16: 12, dir: 'D' },
    { step16: 14, dir: 'U' },
  ],
  // Ballad lenta: D . . . D . . .  (solo quarti)
  ballad: [
    { step16: 0,  dir: 'D' },
    { step16: 8,  dir: 'D' },
  ],
  // Rock energico: D D U D U D U D
  rock: [
    { step16: 0,  dir: 'D' },
    { step16: 2,  dir: 'D' },
    { step16: 4,  dir: 'U' },
    { step16: 6,  dir: 'D' },
    { step16: 8,  dir: 'U' },
    { step16: 10, dir: 'D' },
    { step16: 12, dir: 'U' },
    { step16: 14, dir: 'D' },
  ],
  // Reggae skank: upstroke sull'ottavo off-beat
  skank: [
    { step16: 2,  dir: 'U' },
    { step16: 6,  dir: 'U' },
    { step16: 10, dir: 'U' },
    { step16: 14, dir: 'U' },
  ],
};

// Step-array per power chords (beat 16th su bar da 16 step)
// sparse = quarti, mid = ottavi sincopati, dense = ottavi + anticipi 16th
const POWER_STEPS = {
  sparse: [0, 4, 8, 12],
  mid:    [0, 2, 4, 8, 10, 12],
  dense:  [0, 2, 3, 4, 8, 10, 11, 12, 14],
};

// Step-array per riff melodico — step in sedicesimi (0–15)
// Basati su schemi reali di riff rock/funk su ottavi e sedicesimi
const RIFF_STEPS = {
  sparse: [0, 2, 8, 10],
  mid:    [0, 2, 4, 6, 8, 10, 12],
  dense:  [0, 1, 2, 4, 6, 8, 9, 10, 12, 14],
};

// Groove con swing — s16 dispari ricevono nudge +20%
const SWING_GROOVES = new Set(['jazz_swing', 'folk_swing']);

const STYLE_MAP = {
  fingerpicking: {
    low:  { pattern: 'ballad',    grid: 'travis' },
    mid:  { pattern: 'classic',   grid: 'travis' },
    high: { pattern: 'pinch',     grid: 'travis' },
  },
  arpeggio: {
    low:  { pattern: 'sparse',    grid: 'arp' },
    mid:  { pattern: 'ascending', grid: 'arp' },
    high: { pattern: 'up_down',   grid: 'arp' },
  },
  strumming: {
    low:  { pattern: 'ballad', grid: 'strum' },
    mid:  { pattern: 'folk',   grid: 'strum' },
    high: { pattern: 'rock',   grid: 'strum' },
  },
  powerchord: {
    low:  { pattern: 'sparse', grid: 'power' },
    mid:  { pattern: 'mid',    grid: 'power' },
    high: { pattern: 'dense',  grid: 'power' },
  },
  riff: {
    low:  { pattern: 'sparse',    grid: 'riff' },
    mid:  { pattern: 'mid',       grid: 'riff' },
    high: { pattern: 'dense',     grid: 'riff' },
  },
  // Arpeggio ternario per waltz 3/4
  waltz_8th: {
    low:  { pattern: 'waltz_8th', grid: 'arp' },
    mid:  { pattern: 'waltz_8th', grid: 'arp' },
    high: { pattern: 'waltz_8th', grid: 'arp' },
  },
  // Reggae skank: upstroke sull'ottavo off-beat
  skank: {
    low:  { pattern: 'skank', grid: 'strum' },
    mid:  { pattern: 'skank', grid: 'strum' },
    high: { pattern: 'skank', grid: 'strum' },
  },
};

// Varianti per grid+pattern, indicizzate per numero di occorrenza dello STESSO
// tipo di sezione (verse1→idx0, verse2→idx1, verse3→idx2, ...) — sostituisce il
// vecchio PATTERN_BUMP che scattava su qualunque section.index>0 (bridge/outro
// venivano "bumpate" anche se non erano affatto una ripetizione).
// idx0 = pattern originale (nessuna variazione sulla prima occorrenza).
const PATTERN_VARIANTS = {
  travis: {
    ballad:  ['ballad',  'pima',   'classic'],
    pima:    ['pima',    'classic','pinch'],
    classic: ['classic', 'pinch',  'pima'],
    pinch:   ['pinch',   'pima',   'roll_up'],
    roll_up: ['roll_up', 'pinch',  'classic'],
  },
  arp: {
    sparse:     ['sparse',     'pendulum',  'waltz_8th'],
    ascending:  ['ascending',  'pendulum',  'descending'],
    descending: ['descending', 'up_down',   'pendulum'],
    up_down:    ['up_down',    'pendulum',  'ascending'],
    waltz_8th:  ['waltz_8th'],
  },
  strum: {
    ballad: ['ballad', 'folk'],
    folk:   ['folk',   'pop',  'rock'],
    pop:    ['pop',    'rock', 'folk'],
    rock:   ['rock',   'pop'],
    skank:  ['skank'],
  },
  riff: {
    sparse: ['sparse', 'mid'],
    mid:    ['mid',    'dense', 'sparse'],
    dense:  ['dense',  'mid'],
  },
  power: {
    sparse: ['sparse', 'mid'],
    mid:    ['mid',    'dense', 'sparse'],
    dense:  ['dense',  'mid'],
  },
};

/** Sceglie una variante del pattern in base a quante volte lo STESSO tipo di
 *  sezione è già apparso prima di questa (0 = prima occorrenza, pattern originale). */
function _varyPattern(gridType, patternName, occurrenceIdx) {
  const pool = PATTERN_VARIANTS[gridType]?.[patternName];
  if (!pool || occurrenceIdx <= 0) return patternName;
  return pool[occurrenceIdx % pool.length];
}

// ═══════════════════════════════════════════════════════════════════
export function generateGuitar(blueprint, drumContext = null, seedOverride = null, crossMemory = null) {
  const { sections, meta } = blueprint;
  const ppq         = meta.ppq;
  const s16         = ppq / 4;
  const barTicks    = meta.barTicks;
  const beatsPerBar = meta.beatsPerBar ?? 4;
  const rng         = makeRng((seedOverride ?? meta.seed) ^ 0xCAFE);
  const events   = [];

  // Carattere melodico per stile: jazz/blues ottengono più cromatismo,
  // folk/reggae restano puramente diatonici — invece del motore identico
  // ovunque, differenziato solo dai pesi di densità/registro a monte.
  const character = getMelodicCharacter(meta.style);

  // Memoria frase condivisa per la linea treble
  const trebleMemory = new PhraseMemory();

  // Occorrenza per TIPO di sezione (verse1→0, verse2→1, chorus1→0, chorus2→1, ...)
  // usata per variare i pattern tra ripetizioni reali dello stesso tipo, invece del
  // vecchio comportamento che bumpava qualunque sezione con index globale > 0.
  const sectionTypeOccurrence = new Map(); // sectionKey -> occurrenceIdx
  {
    const seenCount = {};
    for (const section of sections) {
      const t = section.type ?? 'verse';
      const idx = seenCount[t] ?? 0;
      sectionTypeOccurrence.set(section.id ?? section.index, idx);
      seenCount[t] = idx + 1;
    }
  }

  // Lista piana di bar con lookahead
  const allBars = [];
  for (const section of sections) {
    const preset = section.modules.guitar;
    if (!preset?.active) continue;
    for (let b = 0; b < section.bars; b++) {
      const barStart = section.startTick + b * barTicks;
      const region   = _regionAt(barStart, section.harmonicMap);
      if (!region) continue;
      allBars.push({
        barStart, region, section,
        barIdxInSection:    b,
        totalBarsInSection: section.bars,
      });
    }
  }

  let prevSectionIdx = -1;

  for (let i = 0; i < allBars.length; i++) {
    const { barStart, region, section, barIdxInSection } = allBars[i];
    const nextRegion = allBars[i + 1]?.region ?? null;
    const preset     = section.modules.guitar;

    // Q2: soft reset a ogni cambio di sezione — preserva lastNote per voice leading continuo
    if ((section.index ?? 0) !== prevSectionIdx) {
      const carryNote = trebleMemory.lastNote;            // ultima nota della sezione precedente
      trebleMemory.reset();
      trebleMemory.lastNote = crossMemory?.getEntryNote('guitar') ?? carryNote;
      prevSectionIdx = section.index ?? 0;
    }

    const style          = preset.style   ?? 'fingerpicking';
    const energy         = section.energy;
    const energyKey      = energy <= 3 ? 'low' : energy <= 6 ? 'mid' : 'high';
    // Density/rest_probability dal blueprint (0.2 intro pp → 0.8 chorus f) — prima
    // ignorati dal generatore, che suonava sempre tutti gli step del pattern
    // indipendentemente dalla dinamica dichiarata ("chitarra sempre piena").
    const density        = preset.density ?? 0.5;
    const restProb       = preset.rest_probability ?? 0;
    const velBaseSection = preset.velocityBase ?? 62;
    const arcType        = preset.velocityArcType ?? 'flat';
    // T7: velocity arc per bar nella sezione
    const velBase        = arcVelocity(velBaseSection, barIdxInSection, allBars[i]?.totalBarsInSection ?? 1, arcType);

    // Fase D: Voice Allocation — vincola range chitarra al registro
    const reg      = preset.register;
    const bassLo   = reg ? Math.max(BASS_STR.lo, reg.lo)   : BASS_STR.lo;
    const bassHi   = reg ? Math.min(BASS_STR.hi, reg.hi)   : BASS_STR.hi;
    const trebleLo = reg ? Math.max(TREBLE_STR.lo, reg.lo) : TREBLE_STR.lo;
    const trebleHi = reg ? Math.min(TREBLE_STR.hi, reg.hi) : TREBLE_STR.hi;

    let patternName = STYLE_MAP[style]?.[energyKey]?.pattern ?? 'classic';
    let gridType     = STYLE_MAP[style]?.[energyKey]?.grid    ?? 'travis';

    // Ritornelli in accordi: se lo stile non produce già una texture "a blocchi"
    // (strum/power), il chorus passa a strumming ad accordo pieno — richiesta
    // esplicita: "i ritornelli in accordi, il resto vario".
    const isChorus = section.type === 'chorus';
    if (isChorus && gridType !== 'strum' && gridType !== 'power') {
      gridType    = 'strum';
      patternName = energyKey === 'low' ? 'ballad' : energyKey === 'high' ? 'rock' : 'folk';
    }

    // Varia il pattern in base a quante volte lo STESSO tipo di sezione è già
    // apparso prima di questa (verse1 = pattern base, verse2/verse3 = varianti).
    // Sostituisce il vecchio bump che scattava su qualunque section.index>0
    // globale, "bumpando" anche bridge/outro che non erano affatto ripetizioni.
    const occurrenceIdx = sectionTypeOccurrence.get(section.id ?? section.index) ?? 0;
    patternName = _varyPattern(gridType, patternName, occurrenceIdx);

    // roll_up è troppo denso a bassa energia — cap a classic
    if (energyKey === 'low' && patternName === 'roll_up') patternName = 'classic';

    const bassPool   = buildChordTonePool(
      { rootPc: region.rootPc, intervals: region.chord_degrees }, bassLo,   bassHi);
    const treblePool = buildChordTonePool(
      { rootPc: region.rootPc, intervals: region.chord_degrees }, trebleLo, trebleHi);

    if (!bassPool.length || !treblePool.length) continue;

    const isBar2       = barIdxInSection % 2 === 1;
    const isPhraseFill = (barIdxInSection % 4 === 3 && barIdxInSection > 0)
                       || (barIdxInSection % 4 === 2 && barIdxInSection > 0 && rng.bool(0.22));
    // Arco 2-bar: bar dispari spinge (+4), bar pari si ritira (-6) — fraseggio naturale
    const phaseOff = isBar2 ? -6 : +4;
    const chordChanging = nextRegion && nextRegion.rootPc !== region.rootPc;
    const nextRootMidi  = nextRegion
      ? clampToRegister(nextRegion.rootPc + 60, trebleLo, trebleHi)
      : null;

    // Approach note via FlowCore
    const approachPitch = chordChanging && nextRootMidi != null
      ? chromaticApproach(nextRootMidi, trebleMemory.lastNote ?? treblePool[0], trebleLo, trebleHi)
      : null;

    // Palm mute: strumming o power a bassa energia → suono muto percussivo
    const palmMute = (style === 'strumming' || style === 'powerchord') && energyKey === 'low';

    // Groove offset swing su arpeggio e riff
    const grooveNudge = 0; // S5: delegato globalmente a applySwing in index.html
    const bassActive  = section.modules.bass?.active ?? false;

    // S5-A: estrai kickSteps e snareSteps per questo bar dal drumContext
    const barCtx     = drumContext?.get(barStart) ?? null;

    const ctx = {
      barStart, s16, ppq, rng, pattern: null,
      bassPool, treblePool, region,
      velBase, isBar2, isPhraseFill, phaseOff,
      chordChanging, approachPitch,
      trebleMemory, palmMute, grooveNudge,
      energy, energyKey, beatsPerBar,
      keyScaleNotes: meta.keyScaleNotes,  // ← scala globale della tonalità
      bassActive,
      kickSteps:  barCtx?.kickSteps  ?? null,  // S5-A
      snareSteps: barCtx?.snareSteps ?? null,  // S5-A
      character,  // carattere melodico per stile (cromatismo, stepBias, randomness)
      density, restProb,  // diradamento step in base a dinamica di sezione
    };

    // CC76 vibrato a inizio sezione per fingerpicking e arpeggio (portamento naturale)
    if (barIdxInSection === 0 && (style === 'fingerpicking' || style === 'arpeggio') && energy >= 4) {
      const maxDepth = energy <= 6 ? 8 : 14;
      for (let s = 0; s < 6; s++) {
        events.push({ tick: barStart + s * ppq, cc: 76, value: Math.round((s / 5) * maxDepth) });
      }
    }

    if (gridType === 'strum') {
      ctx.pattern = STRUM_PATTERNS[patternName] ?? STRUM_PATTERNS['folk'];
      _genStrumBar(events, ctx);
    } else if (gridType === 'power') {
      ctx.pattern = POWER_STEPS[patternName] ?? POWER_STEPS['mid'];
      _genPowerBar(events, ctx);
    } else if (gridType === 'riff') {
      ctx.pattern = RIFF_STEPS[patternName] ?? RIFF_STEPS['mid'];
      _genRiffBar(events, ctx);
    } else if (isPhraseFill && gridType === 'travis' && energyKey !== 'low') {
      ctx.pattern = TRAVIS_PATTERNS['roll_up'];
      _genTravisBar(events, ctx);
    } else if (gridType === 'travis') {
      ctx.pattern = TRAVIS_PATTERNS[patternName] ?? TRAVIS_PATTERNS['classic'];
      _genTravisBar(events, ctx);
    } else {
      ctx.pattern = ARPEGGIO_PATTERNS[patternName] ?? ARPEGGIO_PATTERNS['ascending'];
      _genArpBar(events, ctx);
    }
  }

  // Q2: registra l'ultima nota suonata per la prossima sezione (path smGenerateSection)
  crossMemory?.recordSectionEnd('guitar', trebleMemory.lastNote);

  const style = sections.find(s => s.modules?.guitar?.active)?.modules?.guitar?.style ?? 'fingerpicking';
  return { events, program: GUITAR_PROGRAMS[style] ?? 25 };
}

// ── Travis bar ────────────────────────────────────────────────────
function _genTravisBar(events, ctx) {
  const { barStart, s16, ppq, rng, pattern, bassPool, treblePool,
          velBase, isBar2, phaseOff, chordChanging, approachPitch, trebleMemory, bassActive,
          character, density = 0.5, restProb = 0 } = ctx;

  const root  = bassPool[0];
  const fifth = bassPool.find(n => (n - root) % 12 === 7) ?? bassPool[Math.min(1, bassPool.length - 1)];

  // Diradamento: le voci decorative (mid/fifth/low) possono saltare a bassa
  // density; 'bass' e 'pinch' restano sempre — sono il polso ritmico.
  const decorSkipChance = Math.max(0, Math.min(0.55, (0.6 - density) * 0.7)) + restProb;

  for (let pi = 0; pi < pattern.length; pi++) {
    const { step16, voice } = pattern[pi];
    const tick        = barStart + step16 * s16;
    const isLastStep  = pi === pattern.length - 1;

    // Approach note sull'ultimo step prima del cambio accordo
    if (isLastStep && chordChanging && approachPitch != null) {
      const dur = _noteDur(s16, ppq, 0.7);
      events.push({ tick, note: approachPitch,
                    velocity: Math.max(1, Math.min(127, velBase - 10 + phaseOff)), duration: dur });
      trebleMemory.record(approachPitch);
      continue;
    }

    if ((voice === 'mid' || voice === 'fifth' || voice === 'low') && !isLastStep
        && rng.bool(decorSkipChance)) continue;

    switch (voice) {
      case 'bass': {
        // Fase E: Stagger se bassActive per evitare overlap dei transienti
        const stagger = bassActive ? rng.int(8, 14) : 0;
        // Corda aperta occasionale (12%): risuona oltre il sedicesimo successivo
        const isOpenString = rng.bool(0.12);
        events.push({ tick: tick + stagger, note: root,
          velocity: Math.min(127, velBase - 6 + rng.int(2, 10) + phaseOff),
          duration: isOpenString ? _noteDur(s16, ppq, 2.8) : _noteDur(s16, ppq, 0.85) });
        break;
      }
      case 'fifth': {
        events.push({ tick, note: fifth,
          velocity: Math.max(1, velBase - rng.int(4, 12) + phaseOff),
          duration: _noteDur(s16, ppq, 0.8) });
        break;
      }
      case 'low': {
        const n = bassPool[1] ?? bassPool[0];
        events.push({ tick, note: n,
          velocity: Math.max(1, velBase - 8 + rng.int(-4, 4) + phaseOff),
          duration: _noteDur(s16, ppq, 0.75) });
        break;
      }
      case 'mid': {
        const anchor = trebleMemory.lastNote;
        const n = selectContextualNote(treblePool, anchor, trebleMemory, rng,
                                       { stepBias: character?.stepBias ?? 0.55,
                                         randomness: isBar2 ? 0.35 : 0.20,
                                         chromaticism: character?.chromaticism ?? 0 });
        trebleMemory.record(n);
        events.push({ tick, note: n,
          velocity: Math.max(1, velBase - rng.int(2, 8) + phaseOff),
          duration: _noteDur(s16, ppq, 0.9) });
        break;
      }
      case 'hi': {
        const hiOffset = isBar2 ? 1 : 0;
        const hiIdx    = Math.min(treblePool.length - 1,
          Math.floor(treblePool.length * 0.6) + hiOffset + rng.int(0, 1));
        const n = treblePool[hiIdx];
        trebleMemory.record(n);
        events.push({ tick, note: n,
          velocity: Math.max(1, Math.min(127, velBase + 8 + rng.int(-6, 6) + phaseOff)),
          duration: _noteDur(s16, ppq, 0.85) });
        break;
      }
      case 'pinch': {
        // Fase E: stagger solo sulla nota di basso del pinch
        const stagger = bassActive ? rng.int(8, 14) : 0;
        const dur = _noteDur(s16, ppq, 0.9);
        const topNote = treblePool[treblePool.length - 1];
        trebleMemory.record(topNote);
        events.push({ tick: tick + stagger, note: root,
          velocity: Math.min(127, velBase + 8 + phaseOff), duration: dur });
        events.push({ tick, note: topNote,
          velocity: Math.min(127, velBase + 4 + phaseOff), duration: dur });
        break;
      }
    }
  }
}

// ── Arpeggio bar ──────────────────────────────────────────────────
function _genArpBar(events, ctx) {
  const { barStart, s16, ppq, rng, pattern, bassPool, treblePool,
          velBase, isBar2, phaseOff, chordChanging, approachPitch, trebleMemory,
          grooveNudge, energy, beatsPerBar = 4, density = 0.5, restProb = 0 } = ctx;

  // Diradamento generale sugli step non-downbeat, in base a density/rest_probability
  const skipChance = Math.max(0, Math.min(0.6, (0.65 - density) * 0.6)) + restProb;

  const allTones = [...new Set([...bassPool.slice(-2), ...treblePool.slice(0, 4)])]
                    .sort((a, b) => a - b);
  const noteCount = allTones.length;
  if (noteCount === 0) return;
  const hiNote    = allTones[allTones.length - 1];
  const loNote    = allTones[0];

  const startOffset = isBar2 ? 1 : 0;

  const stepsPerBar = beatsPerBar * 4;
  for (let step = 0; step < Math.min(pattern.length, stepsPerBar); step++) {
    const idx = pattern[step];
    if (idx === -1) continue;

    // Skip procedurale a bassa energia (sparse feel)
    if (energy <= 2 && rng.bool(0.3) && step !== 0) continue;

    const isLastStep = step === pattern.length - 1 || step === stepsPerBar - 1;

    // Diradamento density: mai sul primo step del bar (downbeat)
    if (step !== 0 && !isLastStep && rng.bool(skipChance)) continue;

    if (isLastStep && chordChanging && approachPitch != null) {
      const tick = barStart + step * s16;
      events.push({ tick, note: approachPitch,
                    velocity: Math.max(1, velBase - 10),
                    duration: _noteDur(s16, ppq, 0.7) });
      trebleMemory.record(approachPitch);
      continue;
    }

    // Groove offset swing: step dispari ricevono nudge in avanti
    const swingOff = (step % 2 === 1) ? grooveNudge : 0;
    const tick     = barStart + step * s16 + swingOff;

    const noteIdx = (idx + startOffset) % noteCount;
    const note    = allTones[noteIdx];
    const isDown  = step % 4 === 0;

    // Velocity arc: nota più alta → +8, nota più bassa → -6
    const arcOffset = note === hiNote ? 8 : note === loNote ? -6 : 0;
    const v = isDown
      ? Math.min(127, velBase + arcOffset + phaseOff + rng.int(4, 12))
      : Math.max(1,   velBase + arcOffset + phaseOff - rng.int(2, 10));

    // Aggiorna memoria solo per le note treble (non bass)
    if (note >= TREBLE_STR.lo) trebleMemory.record(note);
    events.push({ tick, note, velocity: v, duration: _noteDur(s16, ppq, 0.88) });
  }
}

// ── Strum bar ─────────────────────────────────────────────────────
// Ogni strum suona l'accordo completo (bass + treble tones).
// Downstroke: note ordinate bass→treble con stagger di 8 tick (simulazione plettro)
// Upstroke:   note ordinate treble→bass, velocity ridotta, durata più breve
function _genStrumBar(events, ctx) {
  const { barStart, s16, ppq, rng, pattern, bassPool, treblePool,
          velBase, isBar2, isPhraseFill, phaseOff, palmMute, energyKey,
          density = 0.5, restProb = 0 } = ctx;

  const fullChord = [...new Set([
    bassPool[0],
    bassPool[Math.min(1, bassPool.length - 1)],
    ...treblePool.slice(0, 4),
  ])].sort((a, b) => a - b);

  // Voicing diradato a bassa density: meno corde per colpo (accordo più
  // scarno) invece del blocco pieno sempre uguale indipendentemente dalla
  // dinamica dichiarata dalla sezione.
  const voiceCount = density < 0.35 ? Math.min(fullChord.length, 3)
                    : density < 0.6  ? Math.min(fullChord.length, 4)
                    : fullChord.length;
  // Root + le note più alte del voicing (mantiene fondamentale e colore, toglie il "riempitivo" medio)
  const thinChord = voiceCount >= fullChord.length
    ? fullChord
    : [fullChord[0], ...fullChord.slice(-(voiceCount - 1))];

  // Stagger dipende da energia: lento e morbido a bassa energia, secco ad alta
  const staggerTick = palmMute
    ? rng.int(2, 5)
    : energyKey === 'high' ? rng.int(4, 8)
    : energyKey === 'mid'  ? rng.int(8, 14)
    : rng.int(12, 20);

  // Palm mute parziale: energia media → 25% chance di suono semi-attenuato
  const partialMute  = !palmMute && energyKey === 'mid' && rng.bool(0.25);
  const durDown = palmMute    ? Math.round(s16 * 0.20)
                : partialMute ? Math.round(s16 * 0.42)
                : Math.round(ppq * 0.55);
  const durUp   = palmMute    ? Math.round(s16 * 0.15)
                : partialMute ? Math.round(s16 * 0.32)
                : Math.round(ppq * 0.30);
  const muteVelOffset = palmMute ? -22 : partialMute ? -10 : 0;

  for (const { step16, dir } of pattern) {
    const isDown = dir === 'D';
    // Skip upstroke occasionale su bar non accented — rompe la meccanicità
    if (!isDown && !isPhraseFill && rng.bool(isBar2 ? 0.15 : 0.25)) continue;

    // S5-A: su kickStep, skip downstroke con 60% probabilità (cedono il pocket al basso)
    const kickSteps = ctx.kickSteps;
    if (kickSteps?.has(step16) && isDown && rng.bool(0.60)) continue;

    // rest_probability: colpo interamente saltato (non sul primo step del bar)
    if (step16 !== 0 && restProb > 0 && rng.bool(restProb)) continue;

    const baseTime   = barStart + step16 * s16;
    const notesOrder = isDown ? thinChord : [...thinChord].reverse();
    const notesFiltered = palmMute ? notesOrder.filter(n => n <= BASS_STR.hi + 5) : notesOrder;
    if (!notesFiltered.length) continue;

    const velStroke = isDown
      ? Math.min(127, velBase + muteVelOffset + phaseOff + rng.int(2, 8))
      : Math.max(1,   velBase + muteVelOffset + phaseOff - rng.int(10, 20));

    notesFiltered.forEach((note, i) => {
      const tick = baseTime + i * staggerTick;
      const v    = isDown
        ? Math.max(1, velStroke - i * 4)
        : Math.max(1, velStroke - i * 3);
      events.push({ tick, note, velocity: v, duration: isDown ? durDown : durUp });
    });
  }
}

// ── Power chord bar ───────────────────────────────────────────────
// Suona power chord (root + 5th + ottava opzionale) sui beat del pattern.
// Bassa energia → palm mute (durata cortissima). Alta energia → ottava raddoppiata.
function _genPowerBar(events, ctx) {
  const { barStart, s16, rng, pattern, bassPool, velBase, phaseOff,
          palmMute, energyKey, restProb = 0 } = ctx;

  const root  = bassPool[0];
  const fifth = root + 7;
  const oct   = root + 12;

  const durFull = palmMute
    ? Math.round(s16 * 0.30)
    : energyKey === 'high'
      ? Math.round(s16 * 1.6)
      : Math.round(s16 * 2.4);
  const stagger = 6;

  for (const step16 of pattern) {
    const isAccentBeat = step16 % 4 === 0;
    // rest_probability: salta i colpi sincopati non accentati
    if (!isAccentBeat && restProb > 0 && rng.bool(restProb)) continue;
    const tick = barStart + step16 * s16;
    const accentOff = isAccentBeat ? rng.int(4, 10) : rng.int(-8, 0);
    const velR = Math.min(127, velBase + 20 + phaseOff + accentOff);
    const velF = Math.min(127, velBase + 14 + phaseOff + (isAccentBeat ? rng.int(2, 6) : rng.int(-6, 0)));
    const velO = Math.min(127, velBase + 8  + phaseOff + rng.int(-4, 4));

    events.push({ tick,                note: root,  velocity: velR, duration: durFull });
    events.push({ tick: tick + stagger, note: fifth, velocity: velF, duration: durFull });
    if (energyKey === 'high') {
      events.push({ tick: tick + stagger * 2, note: oct, velocity: velO, duration: durFull });
    }
  }
}

// ── Riff bar ──────────────────────────────────────────────────────
// Linea melodica procedurale sulla chitarra bassa (range E2-A4).
// Usa selectContextualNote + PhraseMemory per voice leading naturale.
function _genRiffBar(events, ctx) {
  const { barStart, s16, rng, pattern, region, velBase, phaseOff,
          trebleMemory, grooveNudge, chordChanging, approachPitch, energyKey,
          keyScaleNotes, character, density = 0.5, restProb = 0 } = ctx;

  const decorSkipChance = Math.max(0, Math.min(0.5, (0.55 - density) * 0.6)) + restProb;

  const RIFF_LO = 40;  // E2
  const RIFF_HI = 69;  // A4

  // Usa scala globale della tonalità per rimanere in key, anche su accordi cromatici
  const globalPool  = (keyScaleNotes ?? []).filter(n => n >= RIFF_LO && n <= RIFF_HI);
  // Scala modale solo per selezionare i chord tones sui beat forti
  const chordTones  = (region.chord_tones ?? []).filter(n => n >= RIFF_LO && n <= RIFF_HI);
  // Pool melodico = scala globale (rimane in tonalità)
  const notePool    = globalPool.length > 2 ? globalPool : chordTones;
  if (!notePool.length) return;

  for (let pi = 0; pi < pattern.length; pi++) {
    const step16 = pattern[pi];
    const isLast = pi === pattern.length - 1;

    if (isLast && chordChanging && approachPitch != null) {
      const apNote = Math.max(RIFF_LO, Math.min(RIFF_HI, approachPitch));
      const tick   = barStart + step16 * s16;
      events.push({ tick, note: apNote,
                    velocity: Math.max(1, velBase - 8 + phaseOff),
                    duration: Math.round(s16 * 1.1) });
      trebleMemory.record(apNote);
      continue;
    }

    const isStrongBeat  = step16 === 0 || step16 === 8;
    // Diradamento density: mai sui beat forti, solo sulle note di passaggio
    if (!isStrongBeat && rng.bool(decorSkipChance)) continue;

    const swingOff      = (step16 % 2 === 1) ? grooveNudge : 0;
    const tick          = barStart + step16 * s16 + swingOff;

    // Durata variabile per posizione: beat forte → ottavo pieno, syncope → breve
    const durNote = isStrongBeat
      ? Math.round(s16 * 2.0)
      : energyKey === 'high'
        ? Math.round(s16 * rng.int(9, 13) / 10)
        : Math.round(s16 * rng.int(14, 20) / 10);

    const anchor = trebleMemory.lastNote;
    let note;
    if (isStrongBeat) {
      const chordPool  = (region.chord_tones ?? []).filter(n => n >= RIFF_LO && n <= RIFF_HI);
      const targetPool = chordPool.length > 0 ? chordPool : notePool;
      note = anchor != null
        ? targetPool.reduce((b, n) => Math.abs(n - anchor) < Math.abs(b - anchor) ? n : b, targetPool[0])
        : targetPool[Math.floor(targetPool.length / 2)];
    } else {
      note = selectContextualNote(notePool, anchor, trebleMemory, rng,
                                  { stepBias: character?.stepBias ?? 0.60, randomness: 0.25,
                                    chromaticism: character?.chromaticism ?? 0 });
    }
    trebleMemory.record(note);

    const vel = Math.max(1, Math.min(127,
      velBase + (isStrongBeat ? 8 : -4) + phaseOff + rng.int(-6, 6)));
    events.push({ tick, note, velocity: vel, duration: durNote });
  }
}

// ── Helpers ───────────────────────────────────────────────────────
function _regionAt(tick, harmonicMap) {
  return harmonicMap.find(r => r.start_tick <= tick && r.end_tick > tick)
      ?? harmonicMap[0];
}

function _noteDur(s16, ppq, fill = 0.85) {
  return Math.max(4, Math.min(ppq - 10, Math.round(s16 * fill)));
}
