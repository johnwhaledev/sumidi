/**
 * SongArchitect.js
 * ─────────────────────────────────────────────────────────────────
 * The knowledge layer. Translates high-level intent
 * ("MTV Unplugged ballad in Am, 72bpm") into a concrete SongBlueprint
 * that the Engine can render bar by bar.
 *
 * No LLM, no server, no dependencies.
 * Pure data + deterministic logic.
 *
 * OUTPUT CONTRACT: SongBlueprint (see buildSong())
 * ─────────────────────────────────────────────────────────────────
 */

// ═══════════════════════════════════════════════════════════════════
// DATI ESTRATTI (sessione R1 — PLAN35): teoria armonica, progressioni,
// forme di canzone, preset di sezione e metadati di stile vivono ora in
// moduli dedicati. Qui restano solo logica di utilità e il builder.
// ═══════════════════════════════════════════════════════════════════
import { PITCH_CLASS, CHORD_INTERVALS, SCALE_INTERVALS } from './ChordTheory.js';
import { PROGRESSION_POOLS, PROGRESSIONS } from './SongProgressions.js';
import { SONG_FORMS } from './SongForms.js';
import { SECTION_PRESETS } from './SectionPresets.js';
import { STYLES } from './Styles.js';

// ═══════════════════════════════════════════════════════════════════
// 6. UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Parse a chord string like "Am7", "Fmaj7", "G", "C#min7" into
 * { root: string, quality: string, rootMidi: int, intervals: int[] }
 */
function parseChord(chordStr) {
  // FASE A: supporto slash chords — es. "C/E", "G/B", "Am/C"
  // Estrai il basso opzionale PRIMA del parsing principale
  let bassNoteStr = null;
  let baseStr = chordStr;
  const slashIdx = chordStr.indexOf('/');
  if (slashIdx > 0) {
    baseStr     = chordStr.slice(0, slashIdx).trim();
    bassNoteStr = chordStr.slice(slashIdx + 1).trim();  // es. 'E', 'B', 'C#'
  }

  // Match root (with optional accidental) then quality suffix
  const match = baseStr.match(/^([A-G][#b]?)(.*)?$/);
  if (!match) {
    console.warn(`[SongArchitect] Cannot parse chord: ${chordStr}`);
    return null;
  }

  const root = match[1];
  let qualityStr = (match[2] || '').trim();

  // Normalise common shorthand
  const qualityMap = {
    'm':    'min', 'mi':   'min', '-':    'min',
    'M':    'maj', 'ma':   'maj', 'Maj':  'maj', 'MA':   'maj',
    'm7':   'min7','-7':   'min7',
    'M7':   'maj7','Δ7':   'maj7','Δ':    'maj7',
    '7':    'dom7',
    'dim':  'dim', 'o':    'dim', '°':    'dim',
    'aug':  'aug', '+':    'aug',
    'sus':  'sus4',
    '':     'maj',  // no suffix = major
  };

  const quality   = qualityMap[qualityStr] ?? qualityStr;
  const intervals = CHORD_INTERVALS[quality] ?? CHORD_INTERVALS['maj'];
  const rootPc    = PITCH_CLASS[root] ?? 0;
  // Default octave 3 for mid-register root (C4 = 60)
  const rootMidi  = 48 + rootPc;

  // Risolvi nota al basso per slash chord
  let bassNotePc  = null;
  let bassNoteMidi = null;
  if (bassNoteStr) {
    const bassPc = PITCH_CLASS[bassNoteStr];
    if (bassPc !== undefined) {
      bassNotePc   = bassPc;
      bassNoteMidi = 36 + bassPc; // registro basso: ottava 2 (C2=36)
    }
  }

  return { root, quality, qualityStr, rootMidi, rootPc, intervals,
           bassNotePc, bassNoteMidi };  // FASE A: aggiunti bassNotePc e bassNoteMidi
}

/**
 * Transpose a chord string by semitones.
 * e.g. transposeChord("Am", 2) → "Bm"
 * @param {boolean} preferFlats - usa bemolle invece di diesis (per tonalità flat)
 */
function transposeChord(chordStr, semitones, preferFlats = false) {
  const parsed = parseChord(chordStr);
  if (!parsed) return chordStr;

  const newPc = (parsed.rootPc + semitones + 12) % 12;
  const noteNamesSharps = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const noteNamesFlats  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  const noteNames = preferFlats ? noteNamesFlats : noteNamesSharps;
  const newRoot = noteNames[newPc];
  return `${newRoot}${parsed.qualityStr}`;
}

/**
 * Given a key string ("Am", "C", "F#"), return:
 * { root: string, rootPc: int, isMinor: bool, scale: string }
 */
function parseKey(keyStr) {
  const match = keyStr.match(/^([A-G][#b]?)(m)?$/);
  if (!match) return { root: 'C', rootPc: 0, isMinor: false, scale: 'major' };
  const root = match[1];
  const isMinor = !!match[2];
  return {
    root,
    rootPc: PITCH_CLASS[root] ?? 0,
    isMinor,
    scale: isMinor ? 'minor' : 'major',
  };
}

/**
 * Build all MIDI pitches for a scale within a range.
 */
function buildScalePool(rootPc, scaleName, loMidi = 36, hiMidi = 96) {
  const intervals = SCALE_INTERVALS[scaleName] ?? SCALE_INTERVALS['major'];
  const notes = [];
  for (let oct = 0; oct <= 10; oct++) {
    for (const iv of intervals) {
      const pitch = oct * 12 + rootPc + iv;
      if (pitch >= loMidi && pitch <= hiMidi) notes.push(pitch);
    }
  }
  return [...new Set(notes)].sort((a, b) => a - b);
}

/**
 * Build chord tones (MIDI pitches) for a parsed chord across a register.
 */
function buildChordTonePool(parsedChord, loMidi = 48, hiMidi = 84) {
  const notes = [];
  for (let oct = 0; oct <= 10; oct++) {
    for (const iv of parsedChord.intervals) {
      const pitch = oct * 12 + parsedChord.rootPc + iv;
      if (pitch >= loMidi && pitch <= hiMidi) notes.push(pitch);
    }
  }
  return [...new Set(notes)].sort((a, b) => a - b);
}

/**
 * Clamp a pitch into a register by octave shifting.
 */
function clampToRegister(pitch, lo, hi) {
  while (pitch < lo) pitch += 12;
  while (pitch > hi) pitch -= 12;
  return Math.max(lo, Math.min(hi, pitch));
}

/**
 * T10 v2 — Genera un breve contour melodico per l'hook del ritornello.
 * Restituisce offset in GRADI DI SCALA (non semitoni), con un arco naturale
 * (sale poi scende, salto massimo di 2 gradi per step) così da risultare
 * cantabile invece che un salto armonico casuale.
 * @param {object} rng     istanza makeRng()
 * @param {number} length  numero di note del motivo (default 5)
 * @returns {number[]} es. [0, 2, 3, 1, 0]
 */
function _buildHookMotif(rng, length = 5) {
  const degrees = [0];
  const peakAt  = Math.max(1, Math.floor(length / 2));
  let cur = 0;
  for (let i = 1; i < length; i++) {
    const rising = i <= peakAt;
    const delta  = rising ? rng.int(0, 2) : -rng.int(0, 2);
    cur = Math.max(-2, Math.min(4, cur + delta));
    degrees.push(cur);
  }
  return degrees;
}

/**
 * Simple seeded pseudo-random number generator (Mulberry32).
 * Deterministic: same seed → same output.
 */
function makeRng(seed) {
  let s = seed >>> 0;
  return {
    next() {
      s += 0x6D2B79F5;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(lo, hi) { return lo + Math.floor(this.next() * (hi - lo + 1)); },
    choice(arr) { return arr[Math.floor(this.next() * arr.length)]; },
    bool(prob = 0.5) { return this.next() < prob; },
  };
}

// ═══════════════════════════════════════════════════════════════════
// 7. HARMONIC MAP BUILDER
// ═══════════════════════════════════════════════════════════════════

/**
 * Given a progression (array of chord strings) and timing params,
 * build the harmonic_map format compatible with all modules.
 *
 * Each window = 2 beats (half-bar) — same as Python HarmonicMapper.
 */
function buildHarmonicMap(progression, startTick, barsCount, ppq, barTicks = ppq * 4, progFamily = '') {
  // In 3/4 usa finestra intera (1 accordo per bar); in 4/4 usa mezza barra (2 accordi per bar)
  const windowTicks = barTicks < ppq * 4 ? barTicks : ppq * 2;
  const map = [];

  // Formato misto: 'Am' → ['Am', 1] (retrocompatibile) | ['Am', 2] → invariato
  const normalized  = progression.map(e => Array.isArray(e) ? e : [e, 1]);
  const cycleLength = normalized.reduce((s, [, d]) => s + d, 0);

  for (let bar = 0; bar < barsCount; bar++) {
    // Risolve quale accordo copre questo bar, con loop sul ciclo
    const posInCycle = bar % cycleLength;
    let acc = 0, chordStr = normalized[0][0];
    for (const [chord, dur] of normalized) {
      if (posInCycle < acc + dur) { chordStr = chord; break; }
      acc += dur;
    }

    const parsed = parseChord(chordStr);
    if (!parsed) continue;

    const barStart = startTick + bar * barTicks;

    for (let half = 0; half < 2; half++) {
      const wStart = barStart + half * windowTicks;
      const wEnd = wStart + windowTicks;

      // Scale chord-aware: ogni qualità suggerisce il modo più idiomatico
      // FASE H: blues_rock usa sempre 'blues' per gli accordi I7/IV7/V7
      const q2 = parsed.quality;
      const scaleType =
        (progFamily === 'blues_rock')
          ? 'blues'
        : (q2 === 'min' || q2 === 'min7' || q2 === 'min9' || q2 === 'min11' ||
           q2 === 'minmaj7' || q2 === 'min6' || q2 === 'm6')
          ? 'dorian'
        : (q2 === 'dom7' || q2 === '7' || q2 === 'dom9' || q2 === 'dom11' ||
           q2 === 'dom13' || q2 === 'dom7sus4')
          ? 'mixolydian'
        : (q2 === 'dim' || q2 === 'dim7' || q2 === 'hdim7')
          ? 'locrian'
        : (q2 === 'aug' || q2 === 'aug7')
          ? 'lydian'
        : 'major';

      // FASE A: propaga bassNotePc/bassNoteMidi per slash chords
      const bassNotePc   = parsed.bassNotePc   ?? null;
      const bassNoteMidi = parsed.bassNoteMidi  ?? null;

      // Sessione C S2-B: avoid notes per qualità — pitch class assoluti in range 36–96
      // Usate dal basso walking per filtrare i passing tones scalari dissonanti.
      const AVOID_PCS = {
        'maj':   [11],        // IV maggiore: 7M (sensibile) è avoid
        'dom7':  [],          // dom7: la 7m è già nell'accordo
        'dom9':  [],
        'maj7':  [],          // maj7: nessuna avoid (la 7M è la nota caratteristica)
        'min':   [1],         // min: b9 è avoid
        'min7':  [1],
        'dim':   [1, 6],      // dim: b9 e tritono
        'dim7':  [1],
        'hdim7': [1],
        'sus4':  [4],         // sus4: la 3M è avoid (non risolta)
        'sus2':  [2],         // sus2: la 2M stridente
      };
      const avoidPcs = (AVOID_PCS[parsed.qualityStr] ?? [])
        .map(interval => ((parsed.rootPc + interval) % 12));
      // Espandi in pitch MIDI concreti nel range 36–96
      const avoidNotesMidi = [];
      for (const pc of avoidPcs) {
        for (let oct = 2; oct <= 7; oct++) {
          const n = oct * 12 + pc;
          if (n >= 36 && n <= 96) avoidNotesMidi.push(n);
        }
      }

      map.push({
        start_tick:    wStart,
        end_tick:      wEnd,
        chord:         chordStr,
        root:          parsed.rootMidi,
        rootPc:        parsed.rootPc,
        chord_degrees: parsed.intervals,
        scale:         scaleType,
        scale_notes:   buildScalePool(parsed.rootPc, scaleType, 36, 96),
        chord_tones:   buildChordTonePool(parsed, 48, 84),
        active:        true,
        bassNotePc,      // FASE A: null se non slash chord
        bassNoteMidi,    // FASE A: MIDI ottava 2 della nota al basso
        avoid_notes:   avoidNotesMidi,  // Sessione C S2-B
      });
    }
  }

  return map;
}

// ═══════════════════════════════════════════════════════════════════
// 8. SONG BLUEPRINT BUILDER  ← the main export
// ═══════════════════════════════════════════════════════════════════

/**
 * buildSong(params) → SongBlueprint
 *
 * params: {
 *   style:   string  — key of STYLES dict (default: 'unplugged')
 *   key:     string  — e.g. "Am", "C", "G" (default: style default)
 *   bpm:     number  — (default: style preferred)
 *   form:    string  — key of SONG_FORMS (default: style default)
 *   ppq:     number  — ticks per quarter note (default: 480)
 *   seed:    number  — RNG seed for reproducible variation (default: Date.now())
 *   ensemble:string  — 'strings'|'woodwinds'|'brass' (default: style default)
 * }
 *
 * Returns: SongBlueprint {
 *   meta: { title, style, key, bpm, ppq, totalBars, totalTicks, ensemble }
 *   sections: Section[]
 *   harmonicMap: HarmonicRegion[]  (full flat map across all sections)
 * }
 *
 * Section: {
 *   type:        string   — 'verse'|'chorus'|'bridge'|'intro'|'outro'
 *   index:       number   — occurrence index (1st verse=0, 2nd verse=1...)
 *   bars:        number
 *   energy:      number   1-10
 *   startBar:    number
 *   startTick:   number
 *   endTick:     number
 *   progression: string[] — chord names for this section
 *   harmonicMap: HarmonicRegion[]  (section-scoped slice)
 *   modules:     ModulePreset      — active modules with params
 * }
 */

/**
 * Decorazione procedurale di una progressione già trasposta.
 * Applica variazioni armoniche seed-driven per aumentare la varietà percepita
 * senza aggiungere dati statici al pool.
 *
 * Decorazioni applicate (mai sul primo accordo — tonica):
 *   1. Tritone substitution  — dominant 7th → bII7  (jazz/neo_soul priorità)
 *   2. Chord extension       — triade → 7° corrispondente (maj→maj7, min→m7)
 *   3. Dominant upgrade      — accordo V senza 7 → V7 per aumentare tensione
 *
 * @param {string[]} progression  — accordi già trasposti
 * @param {string}   progFamily   — 'jazz'|'neo_soul'|'unplugged'|'folk'|'classical'
 * @param {number}   energy       — 1–10
 * @param {object}   rng          — PRNG deterministico
 * @param {boolean}  preferFlats  — preferisce bemolle nel nome nota
 * @returns {string[]}
 */
/**
 * Mutazioni seed-driven della forma canzone.
 * Ogni seed produce una struttura leggermente diversa:
 *   - Doppio chorus finale (30%): crea climax pre-outro
 *   - Bridge opzionale (15%): rimuove il bridge per strutture più compatte
 * Usa un RNG isolato (seed ^ costante) per non alterare le progressioni.
 */
/**
 * Arco di arrangiamento seed-driven.
 * Disabilita strumenti in sezioni specifiche per creare narrativa musicale:
 *   'build'       (60%): intro/verse sparse → chorus pieno → outro sparse
 *   'immediate'   (25%): quasi tutto pieno dall'inizio, solo intro leggero
 *   'sparse_start'(15%): apertura minimalista, esplosione al primo chorus
 *
 * Regola: si disabilita solo ciò che era già active=true nel preset dello stile.
 * Classical (drums/guitar già inactive) non viene toccato da questa funzione.
 */
function _applyArrangementArc(sections, seed) {
  const rngArc  = makeRng(seed ^ 0xA4C5);  // RNG isolato, non altera progressioni
  const arcType = rngArc.bool(0.60) ? 'build'
                : rngArc.bool(0.65) ? 'immediate'
                : 'sparse_start';

  const typeIdx = {};

  for (const section of sections) {
    const t   = section.type;
    const idx = typeIdx[t] ?? 0;
    typeIdx[t] = idx + 1;

    const toDisable = _arcDisables(arcType, t, idx, rngArc);
    for (const modName of toDisable) {
      const mod = section.modules[modName];
      if (mod?.active) mod.active = false;
    }
  }
}

function _arcDisables(arcType, sectionType, idx, rng) {
  if (arcType === 'immediate') {
    // Solo intro alleggerito
    if (sectionType === 'intro') return rng.bool(0.40) ? ['piano'] : [];
    return [];
  }

  if (arcType === 'build') {
    if (sectionType === 'intro')
      return rng.bool(0.70) ? ['drums', 'piano'] : ['drums'];
    if (sectionType === 'verse' && idx === 0)
      return rng.bool(0.55) ? ['drums'] : ['drums', 'piano'];
    if (sectionType === 'bridge')
      return rng.bool(0.50) ? ['drums'] : [];
    if (sectionType === 'outro')
      return rng.bool(0.65) ? ['drums', 'piano'] : ['piano'];
    return [];
  }

  // sparse_start
  if (sectionType === 'intro')              return ['drums', 'piano', 'ensemble'];
  if (sectionType === 'verse' && idx === 0) return ['drums', 'piano'];
  if (sectionType === 'verse' && idx === 1) return ['piano'];
  if (sectionType === 'bridge')             return rng.bool(0.60) ? ['drums', 'piano'] : ['drums'];
  if (sectionType === 'outro')              return ['drums', 'piano'];
  return [];
}

function _mutateForm(formTemplate, seed) {
  const rngForm = makeRng(seed ^ 0xF04D);  // RNG isolato per mutazioni forma

  // Copia difensiva per non modificare il template globale
  const form = formTemplate.map(s => ({ ...s }));

  // Mutazione 1 — Doppio chorus finale (30%)
  if (rngForm.bool(0.30)) {
    const outroIdx  = form.findIndex(s => s.type === 'outro');
    const lastChorus = [...form].reverse().find(s => s.type === 'chorus');
    if (outroIdx > 0 && lastChorus) {
      form.splice(outroIdx, 0, { ...lastChorus, energy: Math.min(10, lastChorus.energy + 1) });
    }
  }

  // Mutazione 2 — Bridge opzionale (15%)
  if (rngForm.bool(0.15)) {
    const bridgeIdx = form.findIndex(s => s.type === 'bridge');
    if (bridgeIdx > 0) form.splice(bridgeIdx, 1);
  }

  return form;
}

// ── Q1: Modulazione contestuale (rimpiazza random 25%) ────────────
// Ritorna true se questa sezione deve modulare di tono.
// Solo sull'ultimo chorus/bridge con arco energetico in crescita.
function _shouldModulate(isLastOccurrence, energy, prevEnergy, rng) {
  if (!isLastOccurrence) return false;
  const arcRising = prevEnergy != null && energy > prevEnergy;
  if (arcRising && energy >= 8) return true;    // climax → modula sempre
  if (!arcRising && energy <= 4) return false;  // outro piatto → mai
  return rng.bool(0.25);                        // fallback probabilistico
}

// ── Q1: Bridge chord tra sezioni lontane tonalmente ───────────────
// Se le radici distano > 4 semitoni, inserisce la dominante secondaria
// (V7 del primo accordo della sezione successiva) come ultimo accordo
// della sezione corrente.
function _bridgeChord(decoratedStrings, nextFirstChord, progFamily, rng, preferFlats) {
  const BRIDGE_PROB = {
    jazz: 0.35, bossa_nova: 0.30, neo_soul: 0.25,
    classical: 0.20, unplugged: 0.20, folk: 0.10,
    pop_rock: 0.10, blues_rock: 0.0, singer_songwriter: 0.08,
    latin: 0.30, cinematic: 0.15, reggae: 0.0,
    lo_fi: 0.15, punk: 0.0, garage_rock: 0.05, chiptune: 0.10,
  };
  const prob = BRIDGE_PROB[progFamily] ?? 0.10;
  if (!rng.bool(prob)) return decoratedStrings;

  const lastStr   = decoratedStrings[decoratedStrings.length - 1];
  const lastParsed = parseChord(lastStr.includes('/') ? lastStr.split('/')[0] : lastStr);
  const nextStr   = nextFirstChord.includes('/') ? nextFirstChord.split('/')[0] : nextFirstChord;
  const nextParsed = parseChord(nextStr);
  if (!lastParsed || !nextParsed) return decoratedStrings;

  // Distanza tonal minima (intervallo più corto dei due possibili)
  const dist = (nextParsed.rootPc - lastParsed.rootPc + 12) % 12;
  const semidist = Math.min(dist, 12 - dist);
  if (semidist <= 4) return decoratedStrings; // radici vicine → nessun bridge

  // Dominante secondaria: V7 del prossimo accordo
  const noteNames = preferFlats
    ? ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']
    : ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const bridgeStr = `${noteNames[(nextParsed.rootPc + 7) % 12]}7`;

  const result = [...decoratedStrings];
  result[result.length - 1] = bridgeStr;
  return result;
}

function _decorateProgression(progression, progFamily, energy, parentRng, preferFlats, isMinor = false, sectionIdx = 0) {
  // RNG locale: seed posizionale garantisce verse1 ≠ verse2 anche con stessa progressione
  const rng = makeRng((parentRng.next() * 0xFFFF | 0) ^ (sectionIdx * 0x1337));
  // Probabilità per decorazione e stile
  const TRITONE_PROB   = { jazz: 0.15, neo_soul: 0.10, classical: 0.05, folk: 0.03, unplugged: 0.03, pop_rock: 0.02, bossa_nova: 0.12, blues_rock: 0.0,  singer_songwriter: 0.02, latin: 0.10, cinematic: 0.05, reggae: 0.0,
    lo_fi: 0.05, punk: 0.0, garage_rock: 0.02, chiptune: 0.03 };
  const EXTENSION_PROB = { jazz: 0.40, neo_soul: 0.30, classical: 0.22, folk: 0.14, unplugged: 0.14, bossa_nova: 0.45, blues_rock: 0.10, singer_songwriter: 0.08, latin: 0.25, cinematic: 0.20, reggae: 0.05,
    lo_fi: 0.35, punk: 0.0, garage_rock: 0.05, chiptune: 0.05 };
  const DOM_UPGRADE_PROB = { jazz: 0.50, neo_soul: 0.30, classical: 0.15, folk: 0.20, unplugged: 0.18, bossa_nova: 0.45, blues_rock: 0.0,  singer_songwriter: 0.10, latin: 0.40, cinematic: 0.15, reggae: 0.0,
    lo_fi: 0.25, punk: 0.0, garage_rock: 0.05, chiptune: 0.10 };
  // BUG-1: blues_rock/reggae a 0.0 — secondary dominants e borrowed chords sono incompatibili
  //        con il framework I7–IV7–V7 del blues e con il feel modale del reggae.
  const SEC_DOM_PROB   = { jazz: 0.30, neo_soul: 0.22, classical: 0.18, folk: 0.20, unplugged: 0.18, bossa_nova: 0.25, blues_rock: 0.0,  singer_songwriter: 0.05, latin: 0.25, cinematic: 0.15, reggae: 0.0,
    lo_fi: 0.15, punk: 0.0, garage_rock: 0.05, chiptune: 0.12 };
  const BORROW_PROB    = { jazz: 0.20, neo_soul: 0.25, classical: 0.12, folk: 0.14, unplugged: 0.14, bossa_nova: 0.15, blues_rock: 0.0,  singer_songwriter: 0.05, latin: 0.15, cinematic: 0.18, reggae: 0.0,
    lo_fi: 0.20, punk: 0.0, garage_rock: 0.08, chiptune: 0.08 };
  const SLASH_PROB     = { jazz: 0.15, neo_soul: 0.20, classical: 0.25, folk: 0.35, unplugged: 0.30, bossa_nova: 0.10, blues_rock: 0.10, singer_songwriter: 0.35, latin: 0.10, cinematic: 0.20, reggae: 0.05,
    lo_fi: 0.10, punk: 0.0, garage_rock: 0.05, chiptune: 0.05 };

  const noteNamesFlats  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  const noteNamesSharps = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const noteNames = preferFlats ? noteNamesFlats : noteNamesSharps;

  // Il parametro `energy` (tipicamente 1-10) era ricevuto ma mai usato: intro
  // a energy=2 e chorus climax a energy=9 ricevevano la stessa probabilità di
  // colore armonico. energyMult lega la densità di tensione (settime,
  // dominanti secondarie, tritoni, borrowed chords) all'arco energetico della
  // sezione — sezioni calme restano più diatoniche, i climax si aprono di più.
  // Gli slash chord restano fuori: sono colore testurale sul basso, non tensione.
  const energyMult  = Math.max(0.45, Math.min(1.6, 0.6 + Math.max(0, energy - 1) * 0.11));
  const tritonePr   = Math.min(0.85, (TRITONE_PROB[progFamily]   ?? 0.04) * energyMult);
  const extensionPr = Math.min(0.85, (EXTENSION_PROB[progFamily]  ?? 0.14) * energyMult);
  const domUpgPr    = Math.min(0.85, (DOM_UPGRADE_PROB[progFamily] ?? 0.18) * energyMult);
  const secDomPr    = Math.min(0.85, (SEC_DOM_PROB[progFamily]    ?? 0.18) * energyMult);
  const borrowPr    = Math.min(0.85, (BORROW_PROB[progFamily]     ?? 0.14) * energyMult);
  const slashPr     = SLASH_PROB[progFamily]      ?? 0.15;

  const tonicPc = parseChord(progression[0])?.rootPc ?? 0;

  // Traccia gli indici già decorati: ogni accordo riceve AL MASSIMO una modifica
  const modified = new Set();

  // ── Pass 1: tritone sub, chord extension, dominant upgrade ──────
  let decorated = progression.map((chordStr, i) => {
    if (i === 0) return chordStr;  // tonica intatta

    const parsed = parseChord(chordStr);
    if (!parsed) return chordStr;
    const q = parsed.quality;

    if ((q === 'dom7' || q === '7') && i < progression.length - 1 && rng.bool(tritonePr)) {
      modified.add(i);
      return `${noteNames[(parsed.rootPc + 6) % 12]}7`;
    }
    if (q === 'maj' && rng.bool(extensionPr)) {
      modified.add(i);
      // maj7, maj6, add9, sus4 — varietà di colore senza cambiare funzione
      const ext = ['maj7', '6', 'add9', 'sus4'];
      return `${parsed.root}${ext[rng.int(0, ext.length - 1)]}`;
    }
    if (q === 'min' && rng.bool(extensionPr)) {
      modified.add(i);
      // m7, min9, m6 — dorian flavor per minor
      const ext = ['m7', 'min9', 'm6'];
      return `${parsed.root}${ext[rng.int(0, ext.length - 1)]}`;
    }
    // Estendi dom7 già presenti verso dom9/dom13 (probabilità ridotta per non interferire)
    if ((q === 'dom7' || q === '7') && rng.bool(extensionPr * 0.55)) {
      modified.add(i);
      return `${parsed.root}${rng.bool(0.5) ? 'dom9' : 'dom13'}`;
    }

    const isDominant = ((parsed.rootPc - tonicPc + 12) % 12) === 7;
    if (isDominant && q === 'maj' && rng.bool(domUpgPr)) { modified.add(i); return `${parsed.root}7`; }

    return chordStr;
  });

  // ── Pass 2: Secondary dominant — accordo prima di V → V/V7 ──────
  // Valido sia in maggiore che in minore (V/V è idiomatico in entrambi)
  for (let i = 0; i < decorated.length - 1; i++) {
    if (modified.has(i)) continue;
    const nextParsed = parseChord(decorated[i + 1]);
    if (!nextParsed) continue;
    if (((nextParsed.rootPc - tonicPc + 12) % 12) === 7 && rng.bool(secDomPr)) {
      decorated[i] = `${noteNames[(nextParsed.rootPc + 7) % 12]}7`;
      modified.add(i);
    }
  }

  // ── Pass 3: Borrowed chords — solo se non già toccati ───────────
  for (let i = 1; i < decorated.length; i++) {
    if (modified.has(i)) continue;
    const parsed = parseChord(decorated[i]);
    if (!parsed) continue;
    if (((parsed.rootPc - tonicPc + 12) % 12) === 7) continue;  // dominante intatto
    if (!rng.bool(borrowPr)) continue;

    if (isMinor) {
      // In minore: prestito dal maggiore parallelo
      // Jazz/classical: IV major oppure ♭II napoletano
      // Pop/folk: solo IV major — ♭II napoletano troppo inusuale
      const allowNapolitan = progFamily === 'jazz' || progFamily === 'classical';
      decorated[i] = (!allowNapolitan || rng.bool(0.80))
        ? `${noteNames[(tonicPc + 5) % 12]}`   // IV major (es. D in Am)
        : `${noteNames[(tonicPc + 1) % 12]}`;  // ♭II napoletano (es. Bb in Am) — solo jazz/classical
    } else {
      // In maggiore: prestito dal minore parallelo
      const roll = rng.int(0, 2);
      decorated[i] = roll === 0
        ? `${noteNames[(tonicPc + 10) % 12]}`      // ♭VII
        : roll === 1
          ? `${noteNames[(tonicPc + 8) % 12]}`     // ♭VI
          : `${noteNames[(tonicPc + 5) % 12]}m`;   // iv minore
    }
    modified.add(i);
  }

  // ── Pass 4: Slash Chords (Bass Inversions) ───────────
  // Aggiunge interesse al basso senza scardinare la natura dell'accordo (es. G -> G/B)
  for (let i = 1; i < decorated.length - 1; i++) {
    // Non modifichiamo l'inizio o la fine del brano per fermezza tonale
    if (!rng.bool(slashPr)) continue;
    
    // Escludere stringhe già convertite a slash (non dovrebbe accadere nativamente, ma safety guard)
    if (decorated[i].includes('/')) continue;
    
    // Lo slash chord è additivo: non fa conflitti severi con le estensioni,
    // quindi ci disinteressiamo del 'modified.has(i)'
    const curr = parseChord(decorated[i]);
    if (!curr || curr.quality === 'dim') continue;

    // Determiniamo il bacino di intervalli per l'inversione in modo compatibile (3za, 5ta)
    const invMap = (curr.quality === 'maj' || curr.quality === 'dom7' || curr.quality === '7') 
      ? [4, 7] // 3za Maggiore, 5ta Giusta
      : (curr.quality === 'min' || curr.quality === 'm7') 
        ? [3, 7] // 3za Minore, 5ta Giusta
        : [7];   // Altrimenti (sus4 o rari) vincola alla 5ta per sicurezza
        
    const invInterval  = invMap[rng.int(0, invMap.length - 1)];
    const bassNoteName = noteNames[(curr.rootPc + invInterval) % 12];
    
    decorated[i] = `${decorated[i]}/${bassNoteName}`;
  }

  return decorated;
}

// Fase D: Voice Allocation — registri frequenziali mud-free per modulo.
// Ogni generatore legge register.{lo,hi} dal proprio preset e vincola i propri range interni.
// Se register è assente (blueprint vecchio), i generatori usano i default originali.
const VOICE_REGISTERS = {
  bass:     { lo: 28, hi: 48 },   // E1–C3: fondamentali e quinta bassa
  guitar:   { lo: 40, hi: 69 },   // E2–A4: triadi mid-register
  piano:    { lo: 36, hi: 84 },   // C2–C6: LH/RH split gestita internamente (Fase I)
  ensemble: { lo: 62, hi: 88 },   // D4–E6: colori armonici sopra il piano
};

function buildSong(params = {}) {
  const style      = params.style   ?? 'unplugged';
  const ppq        = params.ppq     ?? 480;
  const seed       = params.seed    ?? Date.now();
  const rng        = makeRng(seed);

  const styleDef   = STYLES[style] ?? STYLES['unplugged'];
  const formName   = params.form  ?? styleDef.defaultForm;
  const keyStr     = params.key   ?? styleDef.defaultKey;
  const bpm        = params.bpm   ?? styleDef.defaultBpm.preferred;
  const ensembleType = params.ensemble ?? styleDef.ensemble.type;

  const form       = _mutateForm(
    SONG_FORMS[formName] ?? SONG_FORMS['unplugged_ballad'], seed
  );
  const keyInfo    = parseKey(keyStr);
  const presets    = SECTION_PRESETS[formName] ?? SECTION_PRESETS[style] ?? SECTION_PRESETS['unplugged'];
  // Per le forme waltz, usa i pool waltz indipendentemente dallo stile
  const progFamily = formName.includes('waltz') ? 'waltz' : styleDef.progressionFamily;

  // beatsPerBar dalla prima sezione della forma (3 per waltz, 4 per tutto il resto)
  const beatsPerBar = SONG_FORMS[formName]?.[0]?.beatsPerBar ?? 4;
  const barTicks    = ppq * beatsPerBar;

  // Lock della linea percussiva: una sola per tutto il brano
  const DRUM_LINE_DEFAULTS = {
    unplugged:        'cajon',
    folk:             'brushes',
    jazz_ballad:      'brushes',
    neo_soul:         'acoustic',
    classical:        null,        // niente percussioni
    pop_rock:         'acoustic',
    bossa_nova:       'bossa',
    blues_rock:       'acoustic',
    singer_songwriter:'brushes',
    latin:            'latin',
    cinematic:        'brushes',
    reggae:           'reggae',
    lo_fi:            'lofi',
    punk:             'punk',
    garage_rock:      'acoustic',
    chiptune:         'chiptune',
  };

  const drumLine = params.drumLine                    // override esplicito dall'UI
                 ?? styleDef.defaultDrumLine          // default dello stile
                 ?? DRUM_LINE_DEFAULTS[style]
                 ?? 'acoustic';

  // Mappatura stili drums per drumLine
  const DRUM_LINE_STYLES = {
    acoustic: { style: 'rock',      useCajon: false, useBrushes: false },
    brushes:  { style: 'brushes',   useCajon: false, useBrushes: true  },
    cajon:    { style: 'cajon',     useCajon: true,  useBrushes: false },
    jazz:     { style: 'jazz_trio', useCajon: false, useBrushes: false },
    bossa:    { style: 'bossa',     useCajon: false, useBrushes: false },
    latin:    { style: 'latin',     useCajon: false, useBrushes: false },
    reggae:   { style: 'reggae',    useCajon: false, useBrushes: false },
    lofi:     { style: 'lofi',      useCajon: false, useBrushes: false },
    punk:     { style: 'punk',      useCajon: false, useBrushes: false },
    chiptune: { style: 'chiptune',  useCajon: false, useBrushes: false },
  };

  // Reference pitch class per trasposizione:
  // Se l'utente sceglie una chiave minore (Am, Cm, Dm…) → riferimento Am (rootPc=9)
  // Se l'utente sceglie una chiave maggiore (C, D, F…)  → riferimento C  (rootPc=0)
  // In questo modo "C" dà sempre accordi della scala di Do maggiore,
  // "Am" dà accordi della scala di La minore, indipendentemente dallo stile.
  const refPc = keyInfo.isMinor ? 9 : 0;
  const semitoneShift = (keyInfo.rootPc - refPc + 12) % 12;

  // Preferisce bemolle nelle tonalità con armatura di bemolli
  // PC flat keys: F(5), Bb(10), Eb(3), Ab(8), Db(1), Gb(6) e relativi minori
  const FLAT_PCS_MAJOR = new Set([5, 10, 3, 8, 1, 6]);
  const FLAT_PCS_MINOR = new Set([2, 7, 0, 5, 10, 3]);
  const preferFlats = keyInfo.isMinor
    ? FLAT_PCS_MINOR.has(keyInfo.rootPc)
    : FLAT_PCS_MAJOR.has(keyInfo.rootPc);

  // ── Track occurrence indices per section type ─────────────────
  const occurrenceCount = {};
  // Track which progressions were used per section type (for variety)
  const usedProgIndices = {};

  // ── Build sections ────────────────────────────────────────────
  let currentBar  = 0;
  let currentTick = 0;
  const sections  = [];
  const fullHarmonicMap = [];

  // Modulazione: pre-conta le occorrenze per tipo per identificare l'ultimo chorus/bridge
  const typeTotals = {};
  for (const fe of form) typeTotals[fe.type] = (typeTotals[fe.type] ?? 0) + 1;
  // Shift modulazione: +2 semitoni in maggiore, +3 in minore (verso la relativa maggiore)
  const modShift = keyInfo.isMinor ? 3 : 2;
  const MOD_TYPES = new Set(['chorus', 'bridge']);

  let fi = -1;          // indice assoluto sezione nel brano (per sectionIdx)
  let prevEnergy = null; // Q1: traccia energia sezione precedente per _shouldModulate

  for (const formEntry of form) {
    fi++;
    const type   = formEntry.type;
    const energy = formEntry.energy;

    // Resolve bar count — supports fixed (8) or range ([6,8])
    const barsSpec = formEntry.bars;
    const bars = Array.isArray(barsSpec)
      ? rng.int(barsSpec[0], barsSpec[1])
      : barsSpec;

    const idx = occurrenceCount[type] ?? 0;
    occurrenceCount[type] = idx + 1;

    // ── Pick progression from pool ────────────────────────────
    const poolKey = `${progFamily}_${type}`;
    const pool    = PROGRESSION_POOLS[poolKey]
                 ?? PROGRESSION_POOLS[`${progFamily}_verse`]
                 ?? [['C', 'G', 'Am', 'F']];

    // Avoid repeating the same progression on same section type
    // (e.g. verse 1 and verse 2 get different progressions)
    const prevIdx = usedProgIndices[type] ?? -1;
    let progIdx;
    if (pool.length === 1) {
      progIdx = 0;
    } else if (idx === 0) {
      // First occurrence: pick randomly
      progIdx = rng.int(0, pool.length - 1);
    } else {
      // Later occurrence: pick different from last used
      do { progIdx = rng.int(0, pool.length - 1); }
      while (progIdx === prevIdx && pool.length > 1);
    }
    usedProgIndices[type] = progIdx;

    const rawProg = pool[progIdx];
    // Normalizza: 'Am' → ['Am', 1] | ['Am', 2] → invariato — gestisce formato misto
    let pairs = rawProg.map(e => Array.isArray(e) ? e : [e, 1]);

    // Trasposizione — conserva le durate
    pairs = pairs.map(([c, d]) => [transposeChord(c, semitoneShift, preferFlats), d]);

    // Modulazione: probabilità ridotta (25%) per non disturbare il workflow DAW.
    // Solo sull'ultimo chorus/bridge — mai sull'intro o outro.
    const isLastOccurrence = idx > 0 && idx === (typeTotals[type] ?? 0) - 1;
    if (MOD_TYPES.has(type) && _shouldModulate(isLastOccurrence, energy, prevEnergy, rng)) {
      pairs = pairs.map(([c, d]) => [transposeChord(c, modShift, preferFlats), d]);
    }

    // Decorazione procedurale: opera sulle sole stringhe, poi re-zippa con le durate
    // sectionIdx = fi garantisce che verse1 e verse2 ricevano decorazioni diverse
    let decoratedStrings = _decorateProgression(
      pairs.map(([c]) => c), progFamily, energy, rng, preferFlats, keyInfo.isMinor, fi
    );

    // Q1: Bridge chord — se la prossima sezione è tonalmente lontana, inserisce V7 di raccordo
    const nextFormEntry = form[fi + 1];
    if (nextFormEntry) {
      const nextPoolKey   = `${progFamily}_${nextFormEntry.type}`;
      const nextPool      = PROGRESSION_POOLS[nextPoolKey]
                          ?? PROGRESSION_POOLS[`${progFamily}_verse`]
                          ?? [['Am', 'F', 'C', 'G']];
      const nextFirstEntry = nextPool[0][0];
      const nextFirstRaw   = Array.isArray(nextFirstEntry) ? nextFirstEntry[0] : nextFirstEntry;
      const nextFirstChord = transposeChord(nextFirstRaw, semitoneShift, preferFlats);
      decoratedStrings = _bridgeChord(decoratedStrings, nextFirstChord, progFamily, rng, preferFlats);
    }

    // Ricostruisce il formato originale: dur=1 → stringa semplice, dur>1 → [stringa, dur]
    const progression = pairs.map(([, d], i) => d === 1 ? decoratedStrings[i] : [decoratedStrings[i], d]);

    // Build harmonic map for this section (FASE H: passa progFamily per scala blues corretta)
    const sectionHarmonicMap = buildHarmonicMap(progression, currentTick, bars, ppq, barTicks, progFamily);
    fullHarmonicMap.push(...sectionHarmonicMap);

    // Resolve module preset for this section type
    const basePreset = presets[type] ?? presets['verse'];

    // Apply energy modulation to density and dynamics
    const modulatedPreset = modulatePresetByEnergy(basePreset, energy, type);

    // Override stile chitarra se l'utente ne ha scelto uno esplicitamente
    if (params.guitarStyle && modulatedPreset.guitar?.active) {
      modulatedPreset.guitar.style = params.guitarStyle;
    }

    // Fase D: Voice Allocation — inietta register vincolante nel preset di ogni modulo
    for (const modName of ['bass', 'guitar', 'piano', 'ensemble']) {
      if (modulatedPreset[modName]?.active && VOICE_REGISTERS[modName]) {
        modulatedPreset[modName].register = { ...VOICE_REGISTERS[modName] };
      }
    }

    // Add variation on repeated sections
    if (idx > 0) {
      densifyPreset(modulatedPreset, idx * 0.08, rng);
    }

    // Lock della linea percussiva: forza lo style dei drums in base al drumLine
    if (drumLine && modulatedPreset.drums?.active && DRUM_LINE_STYLES[drumLine]) {
      Object.assign(modulatedPreset.drums, DRUM_LINE_STYLES[drumLine]);
    }

    sections.push({
      type,
      index:       idx,
      bars,
      energy,
      startBar:    currentBar,
      startTick:   currentTick,
      endTick:     currentTick + bars * barTicks,
      progression,
      progPoolIdx: progIdx,   // exposed for debugging / UI display
      harmonicMap: sectionHarmonicMap,
      modules:     modulatedPreset,
    });

    currentBar  += bars;
    currentTick += bars * barTicks;
    prevEnergy   = energy; // Q1: aggiorna per la sezione successiva
  }

  // Arco di arrangiamento: crea narrativa stripped → full → stripped
  _applyArrangementArc(sections, seed);

  // T10 v2 — Hook motif: breve CONTOUR melodico (offset in gradi di scala, non
  // intervalli armonici tra fondamentali) generato una sola volta per canzone e
  // riproposto identico a ogni ritornello — è il "gancio" che rende il chorus
  // riconoscibile. Seed indipendente dal resto per non alterare il comportamento
  // già deterministico degli altri generatori.
  const motifRng   = makeRng(seed ^ 0xB0B5);
  const seedMotive = _buildHookMotif(motifRng, 5);

  return {
    meta: {
      style,
      formName,
      key:        keyStr,
      keyInfo,
      // Scala diatonica globale: tiene conto dello stile (dorian per neo_soul, ecc.)
      scale:          styleDef.defaultScale ?? (keyInfo.isMinor ? 'minor' : 'major'),
      // Pool MIDI della scala globale — usato dai generatori per rimanere in tonalità
      keyScaleNotes:  buildScalePool(
        keyInfo.rootPc,
        styleDef.defaultScale ?? (keyInfo.isMinor ? 'minor' : 'major'),
        36, 96
      ),
      bpm,
      ppq,
      beatsPerBar,
      barTicks,
      totalBars:  currentBar,
      totalTicks: currentTick,
      ensemble:   { type: ensembleType, voices: styleDef.ensemble.voices },
      feel:       styleDef.feel,
      humanize:   styleDef.humanize,
      swing:      styleDef.swing,
      seed,
      seedMotive,   // T10: motivo seme — null o array di 1-3 intervalli in semitoni
    },
    sections,
    harmonicMap: fullHarmonicMap,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 9. PRESET MODULATION HELPERS
// ═══════════════════════════════════════════════════════════════════

const DYNAMICS_ORDER = ['ppp','pp','p','mp','mf','f','ff','fff'];

function dynamicsShift(dyn, steps) {
  const idx = DYNAMICS_ORDER.indexOf(dyn);
  if (idx === -1) return dyn;
  return DYNAMICS_ORDER[Math.max(0, Math.min(DYNAMICS_ORDER.length - 1, idx + steps))];
}

function dynamicsToVelocityBase(dyn) {
  const map = { 'ppp': 25, 'pp': 38, 'p': 50, 'mp': 62, 'mf': 75, 'f': 88, 'ff': 100, 'fff': 115 };
  return map[dyn] ?? 65;
}

/**
 * Modulate a section preset based on energy level (1-10).
 * High energy → more modules active, higher density, louder dynamics.
 * Low energy  → fewer modules, sparser, quieter.
 * Returns a deep-cloned modulated preset.
 */
function modulatePresetByEnergy(preset, energy, sectionType = 'verse') {
  const clone = JSON.parse(JSON.stringify(preset));
  const energyNorm = (energy - 1) / 9; // 0.0 – 1.0

  // Mappatura sectionType → velocityArcType
  const arcTypeMap = {
    intro:  'crescendo',
    verse:  'slight_crescendo',
    chorus: 'peak_mid',
    bridge: 'slight_decrescendo',
    outro:  'decrescendo',
  };

  for (const [name, mod] of Object.entries(clone)) {
    if (!mod.active) continue;

    // Density: shift allargato a ±0.25 (era ±0.15) — lo scarto verse→chorus
    // era troppo compresso e il salto di energia poco udibile.
    mod.density = Math.max(0.05, Math.min(1.0,
      mod.density + (energyNorm - 0.5) * 0.5
    ));

    // Dynamics: shift continuo fino a ±2 step (era un gradino fisso ±1 con
    // due soglie) — su una scala di 8 livelli (ppp..fff) un solo gradino
    // era quasi impercettibile tra una sezione calma e un climax.
    if (mod.dynamics) {
      const steps = Math.round((energyNorm - 0.5) * 4);
      mod.dynamics = dynamicsShift(mod.dynamics, steps);
    }

    // Compute integer velocity base for modules to use
    mod.velocityBase = dynamicsToVelocityBase(mod.dynamics ?? 'mp');

    // Velocity arc type per dinamica continua nella sezione
    mod.velocityArcType = arcTypeMap[sectionType] ?? 'flat';
  }

  return clone;
}

/**
 * Slightly densify a preset for repeated sections.
 * idxFactor: 0.08 per repetition.
 */
function densifyPreset(preset, idxFactor, rng) {
  for (const mod of Object.values(preset)) {
    if (!mod.active) continue;
    mod.density = Math.min(1.0, mod.density + idxFactor + rng.next() * 0.05);
  }
}

// ═══════════════════════════════════════════════════════════════════
// 10. EXPORTS
// ═══════════════════════════════════════════════════════════════════

export {
  // Core builder
  buildSong,

  // Utility
  parseChord,
  transposeChord,
  parseKey,
  buildScalePool,
  buildChordTonePool,
  buildHarmonicMap,
  clampToRegister,
  makeRng,
  dynamicsToVelocityBase,

  // Data (for UI and modules to reference)
  CHORD_INTERVALS,
  SCALE_INTERVALS,
  PROGRESSION_POOLS,
  PROGRESSIONS,
  SONG_FORMS,
  SECTION_PRESETS,
  STYLES,
  DYNAMICS_ORDER,
  PITCH_CLASS,
};
