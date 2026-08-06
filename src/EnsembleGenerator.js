/**
 * EnsembleGenerator.js  v1.0 — Portamento, respiration avanzata, voci indipendenti
 * ─────────────────────────────────────────────────────────────────
 * v1.0 (Fase 3 - Orchestrazione):
 *   1. Portamento: glissando realistico tra note con note intermedie
 *   2. Respiration avanzata: gap variabili per stile (classical 20%, jazz 10%)
 *   3. Voci indipendenti: density diversa (soprano 100%, alto 70%, tenor 50%)
 *   4. Vibrato ritardato: inizio dopo 200-400ms per archi realistici
 * ─────────────────────────────────────────────────────────────────
 * v0.9:
 *   1. Breath mark globale: allineato alla griglia globale dei 4 bar
 *   2. Eco melodico: alto e tenor entrano sfasati in jazz/classical
 * ─────────────────────────────────────────────────────────────────
 * v0.6 — soprano range fix, articolazione energetica
 * ─────────────────────────────────────────────────────────────────
 * v0.4:
 *   1. Vibrato CC76 a curva S: lento (0→8), accelerato (8→18), assestamento (18→20)
 *   2. Respiro di fraseggio: ogni 4 bar la durata si accorcia del 15%
 * ─────────────────────────────────────────────────────────────────
 */

import { makeRng, clampToRegister } from './SongArchitect.js';
import { msToTick, arcVelocity } from './FlowCore.js';
import { createGlide, STRINGS_GLIDE_PROFILE } from './Ornaments.js';

export const ENSEMBLE_PROGRAMS = {
  strings:   48,
  woodwinds: 73,
  brass:     61,
  chamber:   40,
};

const ENSEMBLE_VOICE_PROGRAMS = {
  strings:   [48, 48, 48],
  woodwinds: [73, 73, 73],
  brass:     [61, 61, 61],
  chamber:   [40, 41, 42],  // Violin, Viola, Cello
};

const VOICE_RANGES = {
  strings: {
    soprano: { lo: 60, hi: 84 },
    alto:    { lo: 55, hi: 74 },
    tenor:   { lo: 48, hi: 67 },
  },
  woodwinds: {
    soprano: { lo: 65, hi: 89 },
    alto:    { lo: 58, hi: 79 },
    tenor:   { lo: 52, hi: 72 },
  },
  brass: {
    soprano: { lo: 55, hi: 80 },
    alto:    { lo: 48, hi: 72 },
    tenor:   { lo: 43, hi: 67 },
  },
  chamber: {
    soprano: { lo: 60, hi: 84 },  // Violino
    alto:    { lo: 48, hi: 69 },  // Viola
    tenor:   { lo: 36, hi: 60 },  // Violoncello
  },
};

// Contorni melodici base (tutti gli stili)
const MELODIC_CONTOURS = {
  arch:      [ 0, +1, +1, +1,  0, -1, -1, -1],
  wave:      [ 0, +1,  0, -1, +1, +1,  0, -1],
  ascending: [+1, +1,  0, +1, +1,  0, +1,  0],
  descending:[ 0, -1, -1,  0, -1, -1,  0, -1],
  static:    [ 0,  0,  0,  0,  0,  0,  0,  0],
  call_resp: [ 0, +1, +2,  0,  0, -1, -2,  0],
  bebop_up:  [+2, +1, +3, -1, +2, +1, +3,  0],
  bebop_down:[ 0, -3, +1, -2,  0, -3, +1, -2],
  stepwise:  [+1, +1, -1, +1, -1, -1, +1, -1],
};

// Contorni disponibili per stile musicale
const STYLE_CONTOUR_KEYS = {
  jazz_ballad: ['arch', 'wave', 'call_resp', 'bebop_up', 'bebop_down'],
  classical:   ['arch', 'ascending', 'descending', 'stepwise', 'static'],
};

// Tipi ensemble con vibrato CC76
const VIBRATO_TYPES = new Set(['chamber', 'woodwinds']);

// Generi intenzionalmente senza sezione orchestrale (rock/elettronico puro:
// punk = trio powerchord, garage_rock = trio blues-garage, chiptune = square/
// pulse waves). STYLES.<genere>.ensemble in SongArchitect.js esiste solo come
// placeholder tecnico — generateSong() legge sempre styleDef.ensemble.type/
// voices per costruire meta.ensemble, quindi il campo non può essere rimosso
// senza toccare anche SongArchitect.js — ma qui viene ignorato consapevolmente.
// Se in futuro si vuole permettere all'utente di aggiungere archi/fiati come
// "colore" opzionale anche a un pezzo punk/garage/chiptune, questo è il punto
// da modificare (rimuovere il genere dal set e/o esporre un toggle utente).
const ORCHESTRAL_DISABLED_STYLES = new Set(['punk', 'garage_rock', 'chiptune']);

// Q5 — Portamento per tipo ensemble: threshold (semitoni minimi) e probabilità
// strings/chamber: scivolano frequentemente; brass: quasi mai; woodwinds: medio
const PORTAMENTO_CONFIG = {
  strings:   { threshold: 2, probPad: 0.40, probMelodic: 0.35, probSoprano: 0.55 },
  chamber:   { threshold: 2, probPad: 0.45, probMelodic: 0.40, probSoprano: 0.60 },
  woodwinds: { threshold: 4, probPad: 0.20, probMelodic: 0.18, probSoprano: 0.25 },
  brass:     { threshold: 6, probPad: 0.08, probMelodic: 0.06, probSoprano: 0.10 },
};

// ═══════════════════════════════════════════════════════════════════
// ENSEMBLE EXPRESSION ENGINE — Portamento & Respiration
// ═══════════════════════════════════════════════════════════════════

/**
 * Crea portamento (glissando) tra due note.
 * R4 (PLAN35): wrapper sottile su createGlide() — la logica vera è nel
 * motore condiviso Ornaments.js, qui resta solo il profilo degli archi.
 * @param {number} fromNote — nota di partenza
 * @param {number} toNote — nota di arrivo
 * @param {number} startTick — tick inizio
 * @param {number} duration — durata totale
 * @param {number} velocity — velocity base
 * @param {number} bpm — tempo
 * @param {number} ppq — pulses per quarter
 * @returns {Array} — array di eventi
 */
function createPortamento(fromNote, toNote, startTick, duration, velocity, bpm, ppq) {
  return createGlide(fromNote, toNote, startTick, duration, velocity, bpm, ppq, STRINGS_GLIDE_PROFILE);
}

/**
 * Calcola il gap di respirazione in base allo stile
 * Classical: respiro lungo (20%), Jazz: respiro corto (10%), Pop: medio (15%)
 */
function getBreathGap(barTicks, ensType, energy, rng) {
  const baseGap = ensType === 'chamber' ? 0.20 : ensType === 'woodwinds' ? 0.12 : 0.15;
  const energyFactor = energy >= 7 ? 0.7 : energy >= 4 ? 1.0 : 1.3; // alta energia = respiro più corto
  const variation = rng.int(-5, 5) / 100; // ±5% variazione
  return Math.round(barTicks * (baseGap * energyFactor + variation));
}

/**
 * Vibrato ritardato: inizia dopo 200-400ms per archi realistici
 * @param {number} startTick — tick inizio nota
 * @param {number} bpm — tempo
 * @param {number} ppq — pulses per quarter
 * @param {number} maxDepth — profondità massima vibrato
 * @param {Object} rng — random generator
 * @returns {Array} — eventi CC76
 */
function createDelayedVibrato(startTick, bpm, ppq, maxDepth, rng) {
  const events = [];
  const delayMs = rng.int(200, 400);
  const delayTick = Math.round(msToTick(delayMs, bpm, ppq));
  
  // Inizio: no vibrato
  events.push({ tick: startTick, cc: 76, value: 0 });
  
  // Attacco: rampa lenta
  const attackSteps = 4;
  for (let i = 0; i < attackSteps; i++) {
    const t = i / attackSteps;
    const depth = Math.round(t * maxDepth * 0.3); // 30% in attacco
    events.push({ 
      tick: startTick + delayTick + Math.round(t * ppq), 
      cc: 76, 
      value: depth 
    });
  }
  
  // Sostenuto: vibrato pieno
  events.push({ 
    tick: startTick + delayTick + ppq, 
    cc: 76, 
    value: maxDepth 
  });
  
  return events;
}

// ═══════════════════════════════════════════════════════════════════

export function generateEnsemble(blueprint, seedOverride = null) {
  const { sections, meta } = blueprint;
  const ppq      = meta.ppq;
  const barTicks = meta.barTicks;
  const bpm      = meta.bpm ?? 120; // v1.0: necessario per timing
  const rng      = makeRng((seedOverride ?? meta.seed) ^ 0xF00D);

  const CHANNELS = [5, 6, 7];
  const voiceEvents = [[], [], []];

  const ensType  = meta.ensemble?.type ?? 'strings';
  const ranges   = VOICE_RANGES[ensType] ?? VOICE_RANGES['strings'];
  const program  = ENSEMBLE_PROGRAMS[ensType] ?? 48;
  const programs = ENSEMBLE_VOICE_PROGRAMS[ensType] ?? [program, program, program];

  const useVibrato    = VIBRATO_TYPES.has(ensType);
  const keyScaleNotes = meta.keyScaleNotes ?? null;

  let prevVoicing = null;
  let prevNotes = [null, null, null]; // v1.0: per portamento

  const availableContours = STYLE_CONTOUR_KEYS[meta.style] ?? Object.keys(MELODIC_CONTOURS);
  const sectionPhraseContours = new Map();

  // Hook motif condiviso col piano (stesso meta.seedMotive) convertito da
  // offset assoluti in gradi di scala a un contour di delta RELATIVI —
  // formato compatibile con MELODIC_CONTOURS. Usato per far "rispondere" il
  // soprano al ritornello con la stessa sagoma melodica del gancio del piano
  // invece di un contour generico scelto a caso per lo stile.
  const hookContour = (meta.seedMotive && meta.seedMotive.length > 1)
    ? meta.seedMotive.map((v, i) => i === 0 ? 0 : Math.max(-2, Math.min(2, v - meta.seedMotive[i - 1])))
    : null;

  for (const section of sections) {
    const preset = section.modules.ensemble;

    // Guard esplicito: per punk/garage_rock/chiptune l'ensemble è disattivato
    // per design (vedi ORCHESTRAL_DISABLED_STYLES sopra), non solo perché i
    // preset di sezione hanno active:false. Questo evita che l'ensemble
    // riappaia silenziosamente per questi generi se in futuro un preset di
    // sezione venisse cambiato senza accorgersi dell'implicazione stilistica.
    if (ORCHESTRAL_DISABLED_STYLES.has(meta.style)) {
      prevVoicing = null; prevNotes = [null, null, null]; continue;
    }

    if (!preset?.active) { prevVoicing = null; prevNotes = [null, null, null]; continue; }

    const baseStyle = preset.style ?? 'pad';
    // Fase J: auto-upgrade a melodic su sezioni ripetute ad alta energia
    const style     = (section.index > 0 && section.energy >= 5) ? 'melodic' : baseStyle;
    const velBase   = preset.velocityBase ?? 50;
    // M3 (PLAN35): stesso arco dinamico per sezione già usato da basso/chitarra/
    // piano (velocityArcType, assegnato per tipo di sezione in SongArchitect.js
    // → modulatePresetByEnergy). Prima l'ensemble non lo leggeva affatto: la sua
    // velocity restava piatta lungo la sezione mentre gli altri strumenti
    // crescevano/calavano — ora "respira" insieme al resto della band.
    const arcType   = preset.velocityArcType ?? 'flat';
    const energy    = section.energy;

    // Fase D: Voice Allocation — vincola VOICE_RANGES al registro dal blueprint
    const reg = preset.register;
    const effectiveRanges = reg ? {
      soprano: { lo: Math.max(ranges.soprano.lo, reg.lo), hi: Math.min(ranges.soprano.hi, reg.hi) },
      alto:    { lo: Math.max(ranges.alto.lo,    reg.lo), hi: Math.min(ranges.alto.hi,    reg.hi) },
      tenor:   { lo: Math.max(ranges.tenor.lo,   reg.lo), hi: Math.min(ranges.tenor.hi,   reg.hi) },
    } : ranges;

    const melodicThresholds = { jazz_ballad: 5, classical: 6 };
    const melodicMinEnergy  = melodicThresholds[meta.style] ?? 7;
    const isMelodic = style === 'melodic' && energy >= melodicMinEnergy;

    if (!sectionPhraseContours.has(section)) {
      const numPhrases = Math.ceil(section.bars / 2);
      const phrases    = Array.from({ length: numPhrases }, () => rng.choice(availableContours));
      sectionPhraseContours.set(section, phrases);
    }
    const phraseContours = sectionPhraseContours.get(section);

    // ── CC11 Expression swell ─────────────────────────────────────
    for (let vi = 0; vi < 3; vi++) {
      for (let b = 0; b < section.bars; b++) {
        const t  = b / Math.max(1, section.bars - 1);
        const envelope = t < 0.6 ? t / 0.6 : 1 - (t - 0.6) / 0.4;
        const cc11Val = Math.round(
          Math.max(1, Math.min(127, (velBase - 15) + envelope * 50 + rng.int(-3, 3)))
        );
        voiceEvents[vi].push({ tick: section.startTick + b * barTicks, cc: 11, value: cc11Val });
      }
    }

    // ── CC76 Vibrato ritardato ────────────────────────────────────
    if (useVibrato) {
      const maxDepth = energy <= 3 ? 12 : energy <= 6 ? 20 : 26;
      for (let vi = 0; vi < 3; vi++) {
        // Un vibrato per bar, ritardato
        for (let b = 0; b < section.bars; b++) {
          const barStart = section.startTick + b * barTicks;
          const vibratoEvents = createDelayedVibrato(barStart, bpm, ppq, maxDepth, rng);
          voiceEvents[vi].push(...vibratoEvents);
        }
      }
    }

    for (let b = 0; b < section.bars; b++) {
      const phraseIdx  = Math.floor(b / 2);
      const contourKey = phraseContours[phraseIdx] ?? phraseContours[0];
      // Nel ritornello (con voce melodica attiva), il soprano raddoppia la
      // sagoma del gancio del piano invece del contour generico dello stile —
      // è quello che rende il ritornello riconoscibile anche negli arrangiamenti
      // con archi/fiati, non solo al piano.
      const contour    = (section.type === 'chorus' && isMelodic && hookContour)
        ? hookContour
        : MELODIC_CONTOURS[contourKey];
      // Fase C: anticipo ritmico pad su cambio sezione ("push_ticks") se inizio bar 0
      const pushTicks  = (b === 0 && section.push_ticks) ? section.push_ticks : 0;
      const barStart   = section.startTick + b * barTicks - pushTicks;

      const region = section.harmonicMap.find(r =>
        r.start_tick <= barStart && r.end_tick > barStart
      ) ?? section.harmonicMap[0];
      if (!region) continue;

      const voicing = _buildVoicing(region, effectiveRanges, prevVoicing);
      prevVoicing   = voicing;

      // v1.0: Respirazione avanzata con gap variabile
      const globalBarIdx = Math.round(barStart / barTicks);
      const isPhraseBoundary = globalBarIdx % 4 === 3;
      const breathGap = isPhraseBoundary ? getBreathGap(barTicks, ensType, energy, rng) : 10;

      // Q5 — Entry offset energy-aware: a bassa energia le voci 2/3 entrano sfasate
      // creando un effetto canone; ad alta energia entrano tutte insieme per impatto.
      let ecoOffsets = [0, 0, 0];
      if (energy <= 4) {
        // Canone leggero: alto mezzo beat dopo, tenor un beat dopo
        ecoOffsets = [0, Math.round(ppq / 2), ppq];
      } else if (energy <= 7) {
        // Sfasamento minimo probabilistico
        const ecoProb = energy <= 3 ? 0.25 : energy <= 6 ? 0.15 : 0;
        const useEco  = b > 0 && rng.bool(ecoProb);
        if (useEco) {
          const delay = Math.round(ppq / 2);
          ecoOffsets = rng.bool(0.5) ? [0, delay, delay * 2] : [0, delay, 0];
        }
      }
      // energy > 7: [0,0,0] — entrano tutti insieme per massimo impatto

      // v1.0: Density diversa per voce (indipendenza orchestrale)
      // Soprano 100%, Alto 70%, Tenor 50%
      const voiceDensity = [1.0, 0.70, 0.50];

      // M3: velBase modulato dall'arco dinamico della sezione (stesso arcType
      // di basso/chitarra/piano per questo tipo di sezione).
      const velBaseArc = arcVelocity(velBase, b, section.bars, arcType);

      if (isMelodic) {
        _genMelodicBar(voiceEvents, voicing, barStart, ppq, barTicks, rng,
                       velBaseArc, contour, b, section.bars, region, effectiveRanges.soprano,
                       energy, keyScaleNotes, ecoOffsets, breathGap,
                       prevNotes, bpm, ppq, voiceDensity, ensType);
      } else {
        _genPadBar(voiceEvents, voicing, barStart, ppq, barTicks, rng,
                   velBaseArc, energy, b, section.bars, ensType, ecoOffsets,
                   breathGap, prevNotes, bpm, ppq, voiceDensity);
      }
      
      // v1.0: Memorizza note correnti per portamento
      prevNotes = [...voicing];
    }
  }

  return { voiceEvents, program, programs, channels: CHANNELS };
}

// ── Pad bar ───────────────────────────────────────────────────────
function _genPadBar(voiceEvents, voicing, barStart, _ppq, barTicks,
                    rng, velBase, energy, _barIdx, _totalBars, ensType = 'strings', 
                    ecoOffsets = [0, 0, 0], breathGap = 10, prevNotes = [null, null, null],
                    bpm = 120, ppq = 480, voiceDensity = [1.0, 0.70, 0.50]) {

  const isBrass = ensType === 'brass';

  for (let vi = 0; vi < 3; vi++) {
    // v1.0: Rispetta density della voce
    if (rng.bool(1 - voiceDensity[vi])) continue;
    
    const note = voicing[vi];
    if (note == null) continue;

    const ecoDelay = ecoOffsets[vi] ?? 0;
    const tick     = barStart + ecoDelay;
    
    const durFactor = isBrass
      ? (energy >= 7 ? 0.35 : energy >= 5 ? 0.45 : 0.55)
      : (energy >= 7 ? 0.70 : energy >= 5 ? 0.92 : 0.98);
    const dur = Math.max(10, Math.round((barTicks - ecoDelay) * durFactor) - breathGap);

    const voiceOffset = [8, 0, -8][vi];
    const ecoPenalty = ecoDelay > 0 ? -8 : 0;
    const velOff = isBrass ? rng.int(0, 6) : voiceOffset + rng.int(-4, 4);
    const vel = Math.max(1, Math.min(127, velBase + velOff + ecoPenalty));

    // Q5: portamento con soglia e probabilità per tipo ensemble
    const portCfg = PORTAMENTO_CONFIG[ensType] ?? PORTAMENTO_CONFIG['strings'];
    const prevNote = prevNotes[vi];
    const usePortamento = prevNote && Math.abs(note - prevNote) >= portCfg.threshold && rng.bool(portCfg.probPad);
    
    if (usePortamento && prevNote) {
      const portamentoEvents = createPortamento(prevNote, note, tick, Math.min(dur, ppq), vel, bpm, ppq);
      voiceEvents[vi].push(...portamentoEvents);
      // Nota sostenuta dopo il portamento
      if (dur > ppq) {
        voiceEvents[vi].push({ 
          tick: tick + ppq, 
          note, 
          velocity: Math.round(vel * 0.9), 
          duration: dur - ppq 
        });
      }
    } else {
      voiceEvents[vi].push({ tick, note, velocity: vel, duration: dur });
    }
  }
}

// ── Melodic bar ───────────────────────────────────────────────────
function _genMelodicBar(voiceEvents, voicing, barStart, ppq, barTicks,
                         rng, velBase, contour, barIdx, totalBars, region,
                         sopranoRange, energy = 5, keyScaleNotes = null,
                         ecoOffsets = [0, 0, 0], breathGap = 10,
                         prevNotes = [null, null, null], bpm = 120, ppqVal = 480,
                         voiceDensity = [1.0, 0.70, 0.50], ensType = 'strings') {

  const halfBar = ppq * 2;

  // Alto & Tenor: articolazione con density indipendente
  const artFactor = energy >= 7 ? 0.72 : energy >= 5 ? 0.92 : 0.98;
  
  for (let vi = 1; vi < 3; vi++) {
    // v1.0: Rispetta density della voce
    if (rng.bool(1 - voiceDensity[vi])) continue;
    
    const note = voicing[vi];
    if (note == null) continue;
    
    const ecoDelay = ecoOffsets[vi] ?? 0;
    const tick = barStart + ecoDelay;
    const ecoPenalty = ecoDelay > 0 ? -8 : 0;
    const vel = Math.max(1, Math.min(127, velBase - [0, 8][vi - 1] + rng.int(-3, 3) + ecoPenalty));
    const dur  = Math.max(10, Math.round((barTicks - ecoDelay) * artFactor) - breathGap);
    
    // Q5: portamento con soglia e probabilità per tipo ensemble
    const portCfg = PORTAMENTO_CONFIG[ensType] ?? PORTAMENTO_CONFIG['strings'];
    const prevNote = prevNotes[vi];
    const usePortamento = prevNote && Math.abs(note - prevNote) >= portCfg.threshold && rng.bool(portCfg.probMelodic);
    
    if (usePortamento && prevNote) {
      const portamentoEvents = createPortamento(prevNote, note, tick, Math.min(dur, ppq), vel, bpm, ppqVal);
      voiceEvents[vi].push(...portamentoEvents);
      if (dur > ppq) {
        voiceEvents[vi].push({ 
          tick: tick + ppq, 
          note, 
          velocity: Math.round(vel * 0.9), 
          duration: dur - ppq 
        });
      }
    } else {
      voiceEvents[vi].push({ tick, note, velocity: vel, duration: dur });
    }
  }

  // Q5: portamento soprano con soglia per tipo ensemble
  const portCfg = PORTAMENTO_CONFIG[ensType] ?? PORTAMENTO_CONFIG['strings'];

  // Soprano: linea melodica con portamento sui salti
  const scaleNotes = keyScaleNotes ?? region.scale_notes ?? [];
  const sLo = sopranoRange?.lo ?? 57;
  const sHi = sopranoRange?.hi ?? 84;
  let sopranoNote = voicing[0];

  // Q5 — Call & response: 20% probabilità a energy ≤ 6
  // Il soprano tace sul primo half-bar e risponde sul secondo
  const useCallResponse = energy <= 6 && rng.bool(0.20);

  for (let half = 0; half < 2; half++) {
    const tick      = barStart + half * halfBar;
    const phrasePos = (barIdx * 2 + half) % contour.length;
    const step      = contour[phrasePos] ?? 0;
    const prevNote  = sopranoNote;

    if (step !== 0 && scaleNotes.length > 2) {
      const currentIdx = _closestScaleIdx(sopranoNote, scaleNotes);
      const targetIdx  = Math.max(0, Math.min(scaleNotes.length - 1, currentIdx + step));
      const candidate  = scaleNotes[targetIdx];
      if (candidate >= sLo && candidate <= sHi) {
        sopranoNote = candidate;
      }
    }

    // Q5: call & response — primo half in silenzio (il "call" arriva dalle voci basse)
    if (useCallResponse && half === 0) continue;

    const jump   = Math.abs(sopranoNote - prevNote);
    const vel    = Math.max(1, Math.min(127, velBase + 12 + rng.int(-6, 6)));
    const sopDur = energy >= 7 ? Math.round(halfBar * 0.68) : halfBar - 10;

    // Q5: portamento con soglia per tipo ensemble
    if (jump >= portCfg.threshold && rng.bool(portCfg.probSoprano)) {
      const portamentoEvents = createPortamento(prevNote, sopranoNote, tick, Math.min(sopDur, ppq), vel, bpm, ppqVal);
      voiceEvents[0].push(...portamentoEvents);
      if (sopDur > ppq) {
        voiceEvents[0].push({
          tick: tick + ppq,
          note: sopranoNote,
          velocity: Math.round(vel * 0.9),
          duration: sopDur - ppq,
        });
      }
    } else if (jump > 4 && scaleNotes.length > 2) {
      // Passing tone con portamento
      const ascending = sopranoNote > prevNote;
      const passTone  = ascending
        ? scaleNotes.find(n => n > prevNote && n < sopranoNote)
        : [...scaleNotes].reverse().find(n => n < prevNote && n > sopranoNote);

      if (passTone != null) {
        const passVel  = Math.max(1, Math.min(127, velBase + 8 + rng.int(-4, 4)));
        const passDur  = Math.round(halfBar * 0.45);
        const portEvents1 = createPortamento(prevNote, passTone, tick, passDur, passVel, bpm, ppqVal);
        voiceEvents[0].push(...portEvents1);
        const targetVel = Math.max(1, Math.min(127, velBase + 12 + rng.int(-6, 6)));
        const portEvents2 = createPortamento(passTone, sopranoNote, tick + passDur + 10, halfBar - passDur - 20, targetVel, bpm, ppqVal);
        voiceEvents[0].push(...portEvents2);
        continue;
      }
    } else {
      voiceEvents[0].push({ tick, note: sopranoNote, velocity: vel, duration: sopDur });
    }
  }
}

// ── Controllo Parallele ─────────────────────────────────────────────
function _hasParallelFifthOrOctave(voicing, prevVoicing) {
  if (!prevVoicing || prevVoicing.includes(null)) return false;
  
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      const intV = Math.abs(voicing[i] - voicing[j]) % 12;
      const intPrev = Math.abs(prevVoicing[i] - prevVoicing[j]) % 12;
      
      // Controlla se formano quinte (7) o ottave/unisoni (0) in entrata e uscita
      if ((intV === 0 || intV === 7) && intPrev === intV) {
        // Devono essersi mossi entrambi nella stessa direzione
        const moveI = voicing[i] - prevVoicing[i];
        const moveJ = voicing[j] - prevVoicing[j];
        if (moveI !== 0 && moveJ !== 0 && Math.sign(moveI) === Math.sign(moveJ)) {
          return true; // Parallela rilevata
        }
      }
    }
  }
  return false;
}

// ── Voice builder ─────────────────────────────────────────────────
function _buildVoicing(region, ranges, prevVoicing) {
  const degrees   = region.chord_degrees;
  const rootPc    = region.rootPc;
  const voiceKeys = ['soprano', 'alto', 'tenor'];

  // Assegnazione base
  let degAssign = [
    degrees[Math.min(2, degrees.length - 1)],
    degrees[Math.min(1, degrees.length - 1)],
    degrees[0],
  ];

  const generateCandidates = (degMap) => {
    const v = [];
    let sopMove = 0;

    for (let vi = 0; vi < 3; vi++) {
      const range = ranges[voiceKeys[vi]];
      let pitch   = rootPc + degMap[vi];

      while (pitch < range.lo) pitch += 12;
      while (pitch > range.hi) pitch -= 12;
      pitch = Math.max(range.lo, Math.min(range.hi, pitch));

      if (prevVoicing?.[vi] != null) {
        const candidates = [pitch, pitch + 12, pitch - 12]
          .filter(p => p >= range.lo && p <= range.hi);

        if (vi === 0) {
          // Soprano sceglie il path più breve
          pitch = candidates.reduce((best, c) =>
            Math.abs(c - prevVoicing[vi]) < Math.abs(best - prevVoicing[vi]) ? c : best,
            candidates[0] ?? pitch
          );
          sopMove = pitch - prevVoicing[0];
        } else if (vi === 2 && sopMove !== 0) {
          // S4-B: Contrary motion bias (Tenor preferisce moto discendente / opposto al Soprano)
          let bestPitch = candidates[0] ?? pitch;
          let bestScore = -Infinity;
          for (const c of candidates) {
            const move = c - prevVoicing[vi];
            const dist = Math.abs(c - prevVoicing[vi]);
            let score = -dist; // penalizza salti ampi
            if (move !== 0 && Math.sign(move) !== Math.sign(sopMove)) score += 10; // score bonus
            if (score > bestScore) {
              bestScore = score;
              bestPitch = c;
            }
          }
          pitch = bestPitch;
        } else {
          // Alto sceglie il path più breve
          pitch = candidates.reduce((best, c) =>
            Math.abs(c - prevVoicing[vi]) < Math.abs(best - prevVoicing[vi]) ? c : best,
            candidates[0] ?? pitch
          );
        }
      }
      pitch = Math.max(range.lo, Math.min(range.hi, pitch));
      v.push(pitch);
    }
    return v;
  };

  let voicing = generateCandidates(degAssign);

  // S4-A: Controllo parallele e retries con inversioni
  if (_hasParallelFifthOrOctave(voicing, prevVoicing)) {
    let retries = 0;
    while (retries < 3) {
      if (retries === 0) degAssign = [degAssign[1], degAssign[0], degAssign[2]];
      else if (retries === 1) degAssign = [degAssign[0], degAssign[2], degAssign[1]];
      else degAssign = [degAssign[2], degAssign[1], degAssign[0]];

      const altVoicing = generateCandidates(degAssign);
      if (!_hasParallelFifthOrOctave(altVoicing, prevVoicing)) {
        voicing = altVoicing;
        break;
      }
      retries++;
    }
  }

  return voicing;
}

// ── Helpers ───────────────────────────────────────────────────────
function _closestScaleIdx(note, scaleNotes) {
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < scaleNotes.length; i++) {
    const d = Math.abs(scaleNotes[i] - note);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}
