/**
 * FlowCore.js — Utilities condivise per la generazione procedurale
 * ─────────────────────────────────────────────────────────────────
 * Usato da: Percussionist, BassGenerator, GuitarGenerator, PianoGenerator
 *
 * Export pubblici:
 *   buildRhythmGrid(density, groove, rng, ppq, barStart, beatsPerBar)
 *   class PhraseMemory
 *   class CrossSectionMemory       — Q2: continuità melodica tra sezioni
 *   selectContextualNote(pool, anchor, memory, rng, opts)
 *   chromaticApproach(targetMidi, fromMidi, lo, hi)
 *   msToTick(ms, bpm, ppq)           — conversione ms → tick (centralizzata da R3)
 *   bpmDensityScale(bpm, base)        — scala densità per BPM (prerequisito Q3)
 *   buildDrumContext(evts, ppq, bar)  — mappa kick/snare per barra (spostata da index.html)
 */

// ── Tabelle offset groove (frazioni di 16° step, + = in anticipo) ─────────
// Applicati come nudge tick: offset * s16 * 0.5
const GROOVE_OFFSETS = {
  straight: [0, 0,    0,    0,    0, 0,    0,    0,    0, 0,    0,    0,    0, 0,    0,    0   ],
  swing:    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Delegato a Humanizer.applySwing()
  shuffle:  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Delegato a Humanizer.applySwing()
  bossa:    [0, 0.05, 0.10, 0,    0, 0.05, 0.10, 0,    0, 0.05, 0.10, 0,    0, 0.05, 0.10, 0   ],
  behind:   [0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08,
             0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08],
};

// ── Peso per ogni sub-step all'interno di un beat (4 sedicesimi) ─────────
const SUBSTEP_W = [null, 0.15, 0.50, 0.15]; // indice 0 = peso del beat (dinamico)

// Pesi beat per metro: [beat0, beat1, beat2, ...]
const BEAT_STRENGTH = {
  4: [1.0, 0.30, 0.70, 0.30],   // 4/4: forte – debole – medio-forte – debole
  3: [1.0, 0.30, 0.65],         // 3/4: forte – debole – medio
};

/** Costruisce l'array dei pesi metrici per beatsPerBar step×4. */
function buildStepWeights(beatsPerBar = 4) {
  const beatStr = BEAT_STRENGTH[beatsPerBar] ?? BEAT_STRENGTH[4];
  const weights = [];
  for (let b = 0; b < beatsPerBar; b++) {
    const bs = beatStr[b] ?? 0.30;
    weights.push(bs, 0.15, 0.50, 0.15);
  }
  return weights;
}

/**
 * Genera una griglia ritmica per una battuta.
 *
 * @param {number} density      0–1: frazione di step attivi
 * @param {string} groove       'straight'|'swing'|'shuffle'|'bossa'|'behind'
 * @param {object} rng          istanza makeRng()
 * @param {number} ppq          tick per quarto (default 480)
 * @param {number} barStart     tick di inizio battuta (default 0)
 * @param {number} beatsPerBar  3 per 3/4, 4 per 4/4 (default 4)
 * @returns {{step16:number, tick:number, weight:number}[]}
 */
export function buildRhythmGrid(density, groove, rng, ppq = 480, barStart = 0, beatsPerBar = 4) {
  const s16         = ppq / 4;
  const offsets     = GROOVE_OFFSETS[groove] ?? GROOVE_OFFSETS.straight;
  const stepWeights = buildStepWeights(beatsPerBar);
  const stepsPerBar = beatsPerBar * 4;
  const grid        = [];

  for (let step = 0; step < stepsPerBar; step++) {
    const w         = stepWeights[step];
    // Step attivo se il peso supera la soglia di densità, o con probabilità pesata
    const threshold = 1.0 - density;
    const active    = w >= threshold || rng.bool(density * w);
    if (!active) continue;

    const nudge = offsets[step % offsets.length] ?? 0;
    const tick  = Math.round(barStart + step * s16 + nudge * s16);
    grid.push({ step16: step, tick, weight: w });
  }

  return grid;
}

// ── PhraseMemory ──────────────────────────────────────────────────────────
/**
 * Traccia la direzione melodica e il momentum fra battute successive
 * per una generazione di frasi coerente.
 */
export class PhraseMemory {
  constructor() {
    this.lastNote  = null;
    this.direction = 0;   // +1 ascendente, -1 discendente, 0 neutro
    this.runLength = 0;   // step consecutivi nella stessa direzione
  }

  /** Registra la nuova nota suonata; aggiorna direzione e runLength. */
  record(note) {
    if (this.lastNote != null) {
      const newDir = Math.sign(note - this.lastNote);
      if (newDir !== 0 && newDir === this.direction) {
        this.runLength++;
      } else {
        this.direction = newDir;
        this.runLength = 1;
      }
    }
    this.lastNote = note;
  }

  /**
   * Suggerisce la prossima direzione melodica basandosi sul momentum.
   * Run lunghi vengono interrotti con probabilità crescente (arco naturale).
   *
   * @param {object} rng  istanza makeRng()
   * @returns {number} +1 | -1 | 0
   */
  suggestDirection(rng) {
    // Dopo 3+ step nella stessa direzione aumenta la prob. di inversione
    const reverseBias = Math.min(0.8, this.runLength * 0.20);
    if (this.direction !== 0 && rng.bool(reverseBias)) {
      return -this.direction;
    }
    if (this.direction === 0) {
      return rng.bool(0.5) ? 1 : -1;
    }
    return this.direction;
  }

  /** Azzera lo stato della frase (usare ai confini di sezione). */
  reset() {
    this.lastNote  = null;
    this.direction = 0;
    this.runLength = 0;
  }
}

// ── CrossSectionMemory ────────────────────────────────────────────────────
/**
 * Q2 — Memoria melodica tra sezioni indipendenti.
 * Tiene traccia dell'ultima nota suonata per strumento al termine di ogni sezione,
 * permettendo ai generatori di iniziare la sezione successiva in continuità
 * invece di ripartire da zero (evita salti bruschi di registro).
 *
 * Usata sia nel path gen() (full blueprint) che in smGenerateSection()
 * (blueprint single-section) tramite parametro opzionale ai generatori.
 */
export class CrossSectionMemory {
  constructor() {
    this.lastNoteByInst = {};   // { guitar: 64, piano: 72, ... }
  }

  /** Registra l'ultima nota suonata da uno strumento al termine della sezione. */
  recordSectionEnd(inst, note) {
    if (note != null) this.lastNoteByInst[inst] = note;
  }

  /**
   * Restituisce l'ultima nota memorizzata per lo strumento.
   * I generatori la usano come warm-start della PhraseMemory o del prevVoicing.
   * @returns {number|null}
   */
  getEntryNote(inst) {
    return this.lastNoteByInst[inst] ?? null;
  }

  /** Azzera tutta la memoria (chiamare a ogni full rebuild). */
  reset() {
    this.lastNoteByInst = {};
  }
}

// ── selectContextualNote ──────────────────────────────────────────────────
/**
 * Sceglie una nota dal pool usando voice leading + direzione di frase.
 *
 * @param {number[]} pool       Array ordinato di altezze MIDI
 * @param {number|null} anchor  Nota precedente (null = libera)
 * @param {PhraseMemory|null} memory  Memoria di frase (null = ignorata)
 * @param {object} rng          istanza makeRng()
 * @param {object} [opts]       { stepBias:number, randomness:number }
 * @returns {number} altezza MIDI
 */
export function selectContextualNote(pool, anchor, memory, rng, opts = {}) {
  if (!pool.length) return 60;

  const { stepBias = 0.6, randomness = 0.25, chromaticism = 0 } = opts;

  // Fallback casuale
  if (anchor == null || rng.bool(randomness)) {
    return pool[rng.int(0, pool.length - 1)];
  }

  const dir    = memory ? memory.suggestDirection(rng) : 0;
  const scored = pool.map(note => {
    const dist     = Math.abs(note - anchor);
    const dirMatch = dir === 0 ? 0 : Math.sign(note - anchor) === dir ? 1 : -1;
    // Distanza minore = punteggio maggiore; bonus per la direzione suggerita
    const score    = (1 / (dist + 1)) + dirMatch * stepBias;
    return { note, score };
  });

  // Selezione pesata sulla metà superiore dei candidati
  scored.sort((a, b) => b.score - a.score);
  const topN  = Math.max(1, Math.ceil(scored.length * 0.5));
  const top   = scored.slice(0, topN);
  const total = top.reduce((s, x) => s + Math.max(0.01, x.score), 0);

  let pick = rng.next() * total;
  let picked = top[0].note;
  for (const { note, score } of top) {
    pick -= Math.max(0.01, score);
    if (pick <= 0) { picked = note; break; }
  }

  // Carattere stilistico: cromatismo — con probabilità `chromaticism`, sposta
  // la nota scelta di ±1 semitono come approccio/enclosure cromatico (jazz,
  // blues). A 0 (default, es. folk/reggae) il comportamento è identico a prima.
  if (chromaticism > 0 && rng.bool(chromaticism)) {
    picked += rng.bool(0.5) ? 1 : -1;
  }

  return picked;
}

// ── Carattere melodico per stile ────────────────────────────────────────────
/**
 * Profilo di "carattere" usato da selectContextualNote per differenziare
 * davvero come ogni stile sceglie le note, invece di condividere lo stesso
 * algoritmo generico pesato solo diversamente altrove.
 *   chromaticism — probabilità di un tocco cromatico ±1 semitono fuori scala
 *   stepBias     — quanto la melodia preferisce continuare nella direzione
 *                  suggerita (più alto = frasi più lineari/scalari)
 *   randomness   — probabilità di scelta libera (più alto = meno prevedibile)
 */
const MELODIC_CHARACTER = {
  jazz_ballad:        { chromaticism: 0.22, stepBias: 0.50, randomness: 0.30 },
  neo_soul:           { chromaticism: 0.16, stepBias: 0.55, randomness: 0.28 },
  blues_rock:         { chromaticism: 0.14, stepBias: 0.55, randomness: 0.26 },
  bossa_nova:         { chromaticism: 0.08, stepBias: 0.60, randomness: 0.22 },
  latin:              { chromaticism: 0.10, stepBias: 0.58, randomness: 0.24 },
  cinematic:          { chromaticism: 0.06, stepBias: 0.62, randomness: 0.20 },
  pop_rock:           { chromaticism: 0.04, stepBias: 0.60, randomness: 0.22 },
  classical:          { chromaticism: 0.03, stepBias: 0.65, randomness: 0.18 },
  folk:               { chromaticism: 0.0,  stepBias: 0.75, randomness: 0.15 },
  unplugged:          { chromaticism: 0.0,  stepBias: 0.72, randomness: 0.16 },
  singer_songwriter:  { chromaticism: 0.0,  stepBias: 0.72, randomness: 0.16 },
  reggae:             { chromaticism: 0.0,  stepBias: 0.70, randomness: 0.18 },
  lo_fi:              { chromaticism: 0.12, stepBias: 0.55, randomness: 0.30 },  // jazzy, un po' storto
  punk:               { chromaticism: 0.0,  stepBias: 0.80, randomness: 0.10 },  // diretto, quasi nessuna variazione
  garage_rock:        { chromaticism: 0.10, stepBias: 0.60, randomness: 0.28 },  // blues-ish, grezzo
  chiptune:           { chromaticism: 0.0,  stepBias: 0.70, randomness: 0.05 },  // meccanico, poco randomico
};

/**
 * Restituisce il profilo di carattere melodico per uno stile (fallback neutro
 * se lo stile non è mappato — comportamento equivalente a prima).
 * @param {string} style
 * @returns {{chromaticism:number, stepBias:number, randomness:number}}
 */
export function getMelodicCharacter(style) {
  return MELODIC_CHARACTER[style] ?? { chromaticism: 0.05, stepBias: 0.6, randomness: 0.25 };
}

// ── chromaticApproach ─────────────────────────────────────────────────────
/**
 * Restituisce la nota di approccio cromatico (±1 semitono) verso targetMidi,
 * scegliendo il lato più vicino a fromMidi, limitata all'intervallo [lo, hi].
 *
 * Unifica le due versioni duplicate in BassGenerator e GuitarGenerator.
 *
 * @param {number} targetMidi  Nota MIDI di destinazione (assoluta)
 * @param {number} fromMidi    Nota MIDI corrente (per scegliere sopra/sotto)
 * @param {number} lo          Limite inferiore del range (inclusivo)
 * @param {number} hi          Limite superiore del range (inclusivo)
 * @returns {number} altezza MIDI di approccio
 */
export function chromaticApproach(targetMidi, fromMidi, lo, hi) {
  const above     = targetMidi + 1;
  const below     = targetMidi - 1;
  const distAbove = Math.abs(above - fromMidi);
  const distBelow = Math.abs(below - fromMidi);
  const raw       = distAbove <= distBelow ? above : below;
  return Math.max(lo, Math.min(hi, raw));
}

// ── arcVelocity ───────────────────────────────────────────────────────────
/**
 * Calcola la velocity base in base alla posizione nella sezione (velocity arc).
 * Crea profili di dinamica continua: crescendo, decrescendo, peak_mid, etc.
 *
 * @param {number} baseVel      Velocity base del modulo (0-127)
 * @param {number} barIdx       Indice della battuta corrente nella sezione (0-based)
 * @param {number} totalBars    Numero totale di battute nella sezione
 * @param {string} arcType      Tipo di arco: 'crescendo'|'decrescendo'|'peak_mid'|'slight_crescendo'|'slight_decrescendo'|'flat'
 * @returns {number}            Velocity modificata (0-127)
 */
export function arcVelocity(baseVel, barIdx, totalBars, arcType = 'flat') {
  if (totalBars <= 1 || arcType === 'flat') return baseVel;

  const progress = barIdx / (totalBars - 1); // 0.0 → 1.0

  let factor = 0;
  switch (arcType) {
    case 'crescendo':
      // Da -12 a +8 rispetto alla base
      factor = -12 + progress * 20;
      break;
    case 'decrescendo':
      // Da +8 a -12 rispetto alla base
      factor = 8 - progress * 20;
      break;
    case 'peak_mid':
      // Picco al centro: -4 → +12 → -4
      factor = -4 + Math.sin(progress * Math.PI) * 16;
      break;
    case 'slight_crescendo':
      // Da -4 a +6
      factor = -4 + progress * 10;
      break;
    case 'slight_decrescendo':
      // Da +6 a -4
      factor = 6 - progress * 10;
      break;
    case 'flat':
    default:
      return baseVel;
  }

  return Math.max(1, Math.min(127, Math.round(baseVel + factor)));
}

// ── R3: Utility centralizzate ─────────────────────────────────────

/**
 * Converte millisecondi in tick MIDI.
 * Era duplicata in BassGenerator, EnsembleGenerator, Percussionist.
 */
export function msToTick(ms, bpm, ppq) {
  return (ms / (60000 / bpm)) * ppq;
}

/**
 * Scala la densità ritmica in funzione del BPM.
 * Calibrata per 90 BPM; riduce la densità ad alto BPM e la aumenta a BPM bassi.
 * Usata da Q3 (BassGenerator, GuitarGenerator, SessionManager).
 * @param {number} bpm
 * @param {number} baseDensity — densità target a 90 BPM (0–1)
 * @returns {number} densità scalata, clampata in [0.15, 0.95]
 */
export function bpmDensityScale(bpm, baseDensity) {
  const ref    = 90;
  const factor = Math.pow(ref / bpm, 0.4);
  return Math.max(0.15, Math.min(0.95, baseDensity * factor));
}

// Costanti GM drum per buildDrumContext (private al modulo)
const _GM_KICK  = 36, _GM_KICK2 = 35;
const _GM_SNARE = 38, _GM_SNARE_RIMSHOT = 40;

/**
 * Costruisce una Map<barStartTick, {kickSteps:Set, snareSteps:Set}> dagli eventi drum.
 * Usata da bass e guitar generator per adattare le linee al groove percussivo.
 * Era definita in index.html; spostata qui in R3.
 * @param {Array} evts — array di eventi { tick, note, ... }
 * @param {number} ppq
 * @param {number} barTicks
 * @returns {Map|null}
 */
export function buildDrumContext(evts, ppq, barTicks) {
  if (!evts?.length) return null;
  const ctx = new Map();
  for (const e of evts) {
    if (e.cc != null || e.note == null) continue;
    const barTick = Math.floor(e.tick / barTicks) * barTicks;
    const step    = Math.round((e.tick - barTick) / (ppq / 4));
    if (!ctx.has(barTick)) ctx.set(barTick, { kickSteps: new Set(), snareSteps: new Set() });
    const bar = ctx.get(barTick);
    if (e.note === _GM_KICK || e.note === _GM_KICK2) bar.kickSteps.add(step);
    if (e.note === _GM_SNARE || e.note === _GM_SNARE_RIMSHOT) bar.snareSteps.add(step);
  }
  return ctx;
}
