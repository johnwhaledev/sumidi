/**
 * BassGenerator.js  v0.8 — slides, hammer-on/pull-off, note-off variations
 * ─────────────────────────────────────────────────────────────────
 * v0.8 (Fase 2 - Humanizing):
 *   1. Slide technique: glissando tra note con overlap realistico
 *   2. Hammer-on/pull-off: note legate senza riattacco in walking bass
 *   3. Note-off variations: rilasci ±10-30ms per fraseggio naturale
 *   4. Vibrato leggero: pitch bend su note lunghe (fingerstyle)
 * ─────────────────────────────────────────────────────────────────
 * v0.7:
 *   1. Pedal point bridge, registro energia, slap pop
 *   2. Beat 2 pocket lock, beat 4 groove stable
 *   3. Walking enclosure: beat 3 gira intorno all'approccio
 * ─────────────────────────────────────────────────────────────────
 * v0.6:
 *   1. Beat 2 sempre presente (soglia abbassata a density > 0.30) — pocket lock
 *   2. Beat 4 stabile su tutti i bar come nota di approccio — groove Pino Palladino
 *   3. Walking enclosure: beat 3 gira intorno all'approccio (semitono sopra/sotto)
 * ─────────────────────────────────────────────────────────────────
 * v0.5:
 *   1. Arco velocity 2-bar: bar 1 spinge (+6), bar 2 si ritira (-8) — fraseggio naturale
 *   2. Walking bass: due note di passaggio per salti > 7 semitoni
 * ─────────────────────────────────────────────────────────────────
 * v0.4:
 *   1. Range stile-dipendente: jazz walking E1–G3, folk E1–C3, ecc.
 *   2. Ghost notes su fingerstyle (non solo slap)
 *   3. Diatonic passing notes nel walking bass (salto > 4 semitoni → scala)
 *   4. Approach intra-bar: nota scalare su beat 3.5 prima del cambio accordo
 * ─────────────────────────────────────────────────────────────────
 */

import { makeRng, clampToRegister } from './SongArchitect.js';
import { PhraseMemory, chromaticApproach, arcVelocity, msToTick } from './FlowCore.js';
import { createGlide, BASS_GLIDE_PROFILE } from './Ornaments.js';

export const BASS_PROGRAMS = {
  fingerstyle:   33,
  pick:          34,
  fretless:      35,
  slap:          36,
  acoustic_bass: 32,
  walking:       33,
};

// Range MIDI per stile — il walking jazz arriva più in alto (walking lines)
const BASS_RANGES = {
  walking:       { lo: 28, hi: 55 },  // E1–G3: range walking jazz
  fretless:      { lo: 28, hi: 53 },  // fino a F3
  slap:          { lo: 28, hi: 50 },  // E1–D3
  fingerstyle:   { lo: 28, hi: 48 },  // E1–C3
  acoustic_bass: { lo: 28, hi: 48 },
  pick:          { lo: 28, hi: 52 },
};

// ═══════════════════════════════════════════════════════════════════
// BASS EXPRESSION ENGINE — Slides & Articulations
// ═══════════════════════════════════════════════════════════════════

/**
 * Crea uno slide tra due note con overlap realistico.
 * R4 (PLAN35): wrapper sottile su createGlide() — la logica vera è nel
 * motore condiviso Ornaments.js, qui resta solo il profilo del basso.
 * @param {number} fromNote — nota di partenza (MIDI)
 * @param {number} toNote — nota di arrivo (MIDI)
 * @param {number} startTick — tick di inizio
 * @param {number} duration — durata totale dello slide in tick
 * @param {number} velocity — velocity della nota
 * @param {number} bpm — tempo per timing
 * @param {number} ppq — pulses per quarter
 * @returns {Array} — array di eventi note
 */
function createSlide(fromNote, toNote, startTick, duration, velocity, bpm, ppq) {
  return createGlide(fromNote, toNote, startTick, duration, velocity, bpm, ppq, BASS_GLIDE_PROFILE);
}

/**
 * Crea hammer-on o pull-off: due note legate, seconda senza attack
 * @param {number} firstNote — prima nota (attack)
 * @param {number} secondNote — seconda nota (legata)
 * @param {number} startTick — tick inizio
 * @param {number} totalDuration — durata totale
 * @param {number} velocity — velocity prima nota
 * @param {number} bpm — tempo
 * @param {number} ppq — pulses per quarter
 * @returns {Array} — [prima nota, seconda nota]
 */
function createHammerOn(firstNote, secondNote, startTick, totalDuration, velocity, bpm, ppq) {
  const splitPoint = Math.round(totalDuration * 0.55); // leggermente più lunga la prima
  const overlap = Math.round(msToTick(8, bpm, ppq)); // overlap per legato
  
  return [
    {
      tick: startTick,
      note: firstNote,
      velocity: velocity,
      duration: splitPoint + overlap
    },
    {
      tick: startTick + splitPoint,
      note: secondNote,
      velocity: Math.round(velocity * 0.4), // ghost attack per legato
      duration: totalDuration - splitPoint
    }
  ];
}

/**
 * Applica variazioni al rilascio delle note per umanizzazione
 * Aggiunge/subtrae tick alla duration (±10-30ms)
 * @param {Array} events — array di eventi
 * @param {number} bpm — tempo
 * @param {number} ppq — pulses per quarter
 * @param {Object} rng — random generator
 */
function applyNoteOffVariation(events, bpm, ppq, rng) {
  for (const ev of events) {
    if (ev.note == null) continue; // TIMING-3: ignora cc events
    // Variazione ±10-30ms convertita in tick
    const variationMs = rng.int(-30, 10); // tendenza a rilasciare prima (staccato) o legato
    const variationTick = Math.round(msToTick(Math.abs(variationMs), bpm, ppq)) * Math.sign(variationMs);
    
    ev.duration = Math.max(10, ev.duration + variationTick);
  }
}

/**
 * Determina se due note sono sulla stessa "corda virtuale" (possibile slide)
 * @param {number} note1 — prima nota
 * @param {number} note2 — seconda nota
 * @returns {boolean} — true se slide possibile
 */
function canSlide(note1, note2) {
  const diff = Math.abs(note2 - note1);
  // Slide realistico: 1-4 semitoni (stessa corda o corda adiacente)
  return diff >= 1 && diff <= 4;
}

// ═══════════════════════════════════════════════════════════════════

export function generateBass(blueprint, drumContext = null, seedOverride = null) {
  const { sections, meta } = blueprint;
  const ppq      = meta.ppq;
  const barTicks = meta.barTicks;
  const bpm      = meta.bpm ?? 120; // v0.8: necessario per timing slides
  const rng      = makeRng((seedOverride ?? meta.seed) ^ 0xBEEF);
  const events   = [];

  // Memoria di frase condivisa per tutto il basso — si azzera a ogni sezione
  const memory = new PhraseMemory();

  // Lista piana di bar con lookahead sull'accordo successivo
  const allBars = [];
  for (const section of sections) {
    if (!section.modules?.bass?.active) continue;
    for (let b = 0; b < section.bars; b++) {
      const barStart = section.startTick + b * barTicks;
      const region   = section.harmonicMap.find(r =>
        r.start_tick <= barStart && r.end_tick > barStart
      ) ?? section.harmonicMap[0];
      if (!region) continue;
      allBars.push({
        barStart, region,
        style:             section.modules.bass.style   ?? 'fingerstyle',
        density:           section.modules.bass.density ?? 0.4,
        energy:            section.energy,
        velocityBase:      section.modules.bass.velocityBase    ?? 72,
        velocityArcType:   section.modules.bass.velocityArcType ?? 'flat',
        restProbability:   section.modules.bass.rest_probability ?? 0,
        register:          section.modules.bass.register ?? null,  // Fase D
        barIdxInSection:    b,
        totalBarsInSection: section.bars,
        sectionId:          section.index ?? 0,
        sectionType:        section.type ?? 'verse',
      });
    }
  }

  let prevSectionId = -1;
  let prevLastNote = null; // v0.8: per slide tra battute
  // T11: RNG isolato per rest bars (stesso seed → coerente con altri generatori)
  const rngRest = makeRng(meta.seed ^ 0x5A23);

  // Hook motif condiviso col piano (stesso meta.seedMotive di PianoGenerator):
  // il basso "risponde" al gancio melodico del ritornello con una piccola coda
  // ornamentale a fine battuta, invece di suonare in modo del tutto indipendente
  // dal tema che ricorre nel piano. Registro leggermente sopra il normale per
  // distinguersi come "voce" separata (call & response), non raddoppio.
  const seedMotive = meta.seedMotive ?? null;
  const hookPool = (meta.keyScaleNotes ?? []).filter(n => n >= 43 && n <= 60);

  for (let i = 0; i < allBars.length; i++) {
    const { barStart, region, style, density, energy,
            velocityBase, velocityArcType,
            barIdxInSection, totalBarsInSection, sectionId, sectionType } = allBars[i];
    const nextRegion = allBars[i + 1]?.region ?? null;

    // Range MIDI per lo stile corrente — espanso verso l'alto ad alta energia
    let { lo: LO, hi: HI } = BASS_RANGES[style] ?? { lo: 28, hi: 52 };
    // Fase D: Voice Allocation — vincola al registro dal blueprint
    const reg = allBars[i].register;
    if (reg) { LO = Math.max(LO, reg.lo); HI = Math.min(HI, reg.hi); }
    if (energy >= 8) HI = Math.min(HI + 4, reg?.hi ?? 60);
    else if (energy >= 6) HI = Math.min(HI + 2, reg?.hi ?? 60);

    // Azzera la memoria a ogni cambio di sezione
    if (sectionId !== prevSectionId) {
      memory.reset();
      prevSectionId = sectionId;
      prevLastNote = null;
    }

    const root   = clampToRegister(
      // FASE A: slash chord — usa bassNoteMidi se presente (es. C/E → suona E)
      region.bassNoteMidi ?? region.root,
      LO, HI
    );
    const fifth  = clampToRegister(region.root + 7, LO, HI);
    const thirdDeg = region.chord_degrees[1] ?? 4;
    const third  = clampToRegister(region.root + thirdDeg, LO, HI);
    const seventh = region.chord_degrees[3] != null
      ? clampToRegister(region.root + region.chord_degrees[3], LO, HI)
      : null;

    // Scale notes filtrate al range corrente per passing tones diatonici
    const scalePool = (region.scale_notes ?? []).filter(n => n >= LO && n <= HI);

    const nextRoot     = nextRegion ? clampToRegister(nextRegion.root, LO, HI) : root;
    const chordChanging = nextRegion && nextRegion.rootPc !== region.rootPc;
    const isBar2ofPhrase = barIdxInSection % 2 === 1;

    // Approach note cromatico (ultimo beat, verso accordo successivo)
    const approachNote = chordChanging
      ? chromaticApproach(nextRoot, root, LO, HI)
      : null;

    // T11: rest_probability — basso tace per 1 bar con probabilità da preset
    const restProb = allBars[i].restProbability ?? 0;
    const isRestBar = restProb > 0
                   && barIdxInSection > 0          // mai sul primo bar di sezione
                   && barIdxInSection % 2 === 0    // solo su bar pari (conserva groove)
                   && rngRest.bool(restProb);
    if (isRestBar) continue; // skip del bar, prevLastNote rimane invariata

    // v0.8: Verifica se possibile slide dalla nota precedente
    const canSlideFromPrev = prevLastNote && canSlide(prevLastNote, root) && rng.bool(0.25);

    // S5-A: estrai kickSteps e snareSteps per questo bar dal drumContext
    const barCtx    = drumContext?.get(barStart) ?? null;
    const kickSteps = barCtx?.kickSteps  ?? null;

    const barEvents = _genBassBar(barStart, ppq, rng, memory, {
      style, density, energy, lo: LO, hi: HI,
      root, fifth, third, seventh, scalePool,
      nextRoot, chordChanging, approachNote,
      isBar2ofPhrase, sectionType,
      barIdxInSection, totalBarsInSection, barTicks,
      canSlideFromPrev, prevLastNote, bpm,
      velocityBase, velocityArcType,
      avoidNotes: region.avoid_notes ?? [],  // Sessione C S2-B
      kickSteps,                              // S5-A
      seedMotive, hookPool,                   // basso in dialogo con l'hook del piano
    });

    // v0.8: Applica variazioni note-off
    applyNoteOffVariation(barEvents, bpm, ppq, rng);
    
    events.push(...barEvents);
    
    // v0.8: Memorizza ultima nota per slide tra battute
    if (barEvents.length > 0) {
      const lastEvent = barEvents[barEvents.length - 1];
      prevLastNote = lastEvent.note;
    }
  }

  // TIMING-1: Assicura che gli eventi siano ordinati cronologicamente globalmente
  // (permette slide inter-battuta senza out-of-order bugs)
  events.sort((a, b) => a.tick - b.tick);

  const style = sections.find(s => s.modules?.bass?.active)?.modules?.bass?.style ?? 'fingerstyle';
  return { events, program: BASS_PROGRAMS[style] ?? 33 };
}

// Sessione C (PLAN28) — Walking bass: helper beat-funzionali jazz
// ─────────────────────────────────────────────────────────────────────

/**
 * Chord tone più vicino all'ancora (in range LO–HI).
 * Beat 1 non è sempre root — sceglie il chord tone meno lontano dall'ultima nota suonata.
 */
function _nearestChordTone(tones, anchor, lo, hi) {
  const clamped = tones
    .filter(t => t != null)
    .map(t => clampToRegister(t, lo, hi));
  if (!clamped.length) return anchor;
  return clamped.reduce((best, t) =>
    Math.abs(t - anchor) < Math.abs(best - anchor) ? t : best
  );
}

/**
 * Seleziona il chord tone per beat 3 — deve essere diverso da beat1.
 * Se beat1 era root → beat3 = fifth; se fifth → beat3 = seventh o third; altrimenti root.
 */
function _selectBeat3(beat1Note, root, fifth, third, seventh, lo, hi) {
  const b1pc = beat1Note % 12;
  const rpc  = root % 12;
  const candidates = [
    beat1Note % 12 === rpc         ? fifth              : null,
    beat1Note % 12 === fifth % 12  ? (seventh ?? third) : null,
    root,
  ].filter(t => t != null && t !== beat1Note);
  const best = candidates[0] ?? (seventh ?? third ?? fifth ?? root);
  return clampToRegister(best, lo, hi);
}

/**
 * Passing tone scalare tra fromNote e toNote, escluse le avoid notes.
 * Sceglie la nota della scala più vicina al punto medio tra le due, nella direzione di moto.
 */
function _walkingPassTone(fromNote, toNote, scalePool, avoidNotes, lo, hi) {
  const dir = toNote > fromNote ? 1 : -1;
  const avoidPcs = new Set((avoidNotes ?? []).map(n => n % 12));
  const candidates = scalePool.filter(n => {
    if (avoidPcs.has(n % 12)) return false;
    return dir > 0 ? (n > fromNote && n < toNote) : (n < fromNote && n > toNote);
  });
  if (!candidates.length) return null;
  // Scegli il più vicino al midpoint
  const mid = (fromNote + toNote) / 2;
  return candidates.reduce((best, n) =>
    Math.abs(n - mid) < Math.abs(best - mid) ? n : best
  );
}

function _genBassBar(barStart, ppq, rng, memory, ctx) {
  const barEvents = [];  // ← array LOCALE per questo bar (TASK 1 fix)
  const { style, density, energy, bpm, ppq: ppqVal,
          root, fifth, third, seventh, scalePool,
          nextRoot, chordChanging, approachNote, isBar2ofPhrase,
          sectionType, barIdxInSection, totalBarsInSection, barTicks,
          canSlideFromPrev, prevLastNote, lo: LO, hi: HI,
          seedMotive, hookPool } = ctx;

  // Basso in dialogo con l'hook: a fine battuta (seconda di ogni coppia), nel
  // ritornello, il basso risponde con una piccola coda che segue lo STESSO
  // contour del motivo melodico del piano — non è un raddoppio (registro più
  // alto, nota breve e leggera), ma crea davvero un legame melodico tra le
  // due voci invece di generarle in modo del tutto indipendente.
  const addHookEcho = (events) => {
    if (sectionType !== 'chorus' || !seedMotive?.length || !hookPool?.length) return;
    if (!isBar2ofPhrase || !rng.bool(0.35)) return;
    const hookIdx   = barIdxInSection % seedMotive.length;
    const degOffset = seedMotive[hookIdx];
    const idx       = Math.max(0, Math.min(hookPool.length - 1,
      Math.floor(hookPool.length / 2) + degOffset));
    const echoNote  = hookPool[idx];
    const echoTick  = barStart + Math.round(ppq * 3.75); // dopo beat4, prima del bar succ.
    events.push({ tick: echoTick, note: echoNote,
      velocity: Math.max(1, Math.min(127, arcBase - 18)), duration: Math.round(ppq / 4 * 0.55) });
  };

  const durH = ppq * 2 - 10;
  const durQ = ppq - 10;
  const durE = Math.round(ppq / 2) - 6;
  // Arco dinamico 2-bar: bar 1 di frase spinge (+6), bar 2 si ritira (-8)
  const phaseOff = isBar2ofPhrase ? -8 : +6;
  // T7: velocity arc — velBase varia nella sezione (scala da velocityBase del preset)
  const arcBase = arcVelocity(ctx.velocityBase ?? 72, barIdxInSection, totalBarsInSection, ctx.velocityArcType ?? 'flat');
  const vel = (offset = 0) => Math.max(1, Math.min(127, rng.int(arcBase - 8, arcBase + 8) + phaseOff + offset));

  // Pedal point: bridge (prima metà) → root tenuta tutta la battuta mentre l'armonia cambia
  const halfSec = Math.ceil((totalBarsInSection ?? 4) / 2);
  if (sectionType === 'bridge' && barIdxInSection < halfSec) {
    // v0.8: Slide into pedal point se possibile
    if (canSlideFromPrev && prevLastNote) {
      const slideEvents = createSlide(prevLastNote, root, barStart, ppq / 2, vel(8), bpm, ppqVal);
      barEvents.push(...slideEvents);
      // Nota lunga di pedal point
      barEvents.push({ 
        tick: barStart + Math.round(ppq / 2), 
        note: root, 
        velocity: vel(4), 
        duration: barTicks - Math.round(ppq / 2) - 10 
      });
    } else {
      barEvents.push({ tick: barStart, note: root, velocity: vel(8), duration: barTicks - 10 });
    }
    memory.record(root);
    return barEvents;
  }

  if (style === 'walking') {
    // ── Sessione C: Walking jazz beat-funzionale ────────────────────
    const avoidNotes = ctx.avoidNotes ?? [];
    const chordTones = [root, fifth, third, seventh].filter(t => t != null);

    // 2-feel a BPM < 70: solo beat 1 e beat 3 con durata mezza battuta
    const bpmCtx = ctx.bpm ?? 120;
    const is2Feel = bpmCtx < 70 && rng.bool(0.40);
    if (is2Feel) {
      const beat1n = _nearestChordTone(chordTones, prevLastNote ?? root, LO, HI);
      const beat3n = _selectBeat3(beat1n, root, fifth, third, seventh, LO, HI);
      barEvents.push({ tick: barStart,           note: beat1n, velocity: vel(8),  duration: ppq * 2 - 10 });
      barEvents.push({ tick: barStart + ppq * 2, note: beat3n, velocity: vel(0),  duration: ppq * 2 - 10 });
      memory.record(beat1n);
      return barEvents;
    }

    // Beat 1: chord tone più vicino all'ultima nota suonata (non root fisso)
    const beat1 = _nearestChordTone(chordTones, prevLastNote ?? root, LO, HI);

    // Beat 3: chord tone alternato rispetto a beat 1
    const beat3 = _selectBeat3(beat1, root, fifth, third, seventh, LO, HI);

    // Beat 2: passing tone scalare toward beat3, escluse avoid notes
    const raw2  = _walkingPassTone(beat1, beat3, scalePool, avoidNotes, LO, HI);
    const beat2 = raw2 ?? clampToRegister(
      beat3 > beat1 ? (scalePool.find(n => n > beat1) ?? beat1 + 2)
                    : ([...scalePool].reverse().find(n => n < beat1) ?? beat1 - 2),
      LO, HI
    );

    // Beat 4: approach cromatico verso beat 1 del bar successivo
    const beat4 = approachNote ?? chromaticApproach(nextRoot, beat1, LO, HI);

    // Enclosure su cambio accordo: beat 2-3 girano intorno all'approccio
    const walk = [beat1, beat2, beat3, beat4];
    if (chordChanging && approachNote != null) {
      walk[2] = rng.bool(0.60)
        ? Math.min(HI, approachNote + 1)
        : Math.max(LO, approachNote - 1);
      walk[3] = approachNote;
    }

    // Emetti i 4 quarti con hammer-on/pull-off dove possibile
    const kickSteps = ctx.kickSteps; // S5-A
    for (let beat = 0; beat < 4; beat++) {
      const note = walk[beat] ?? root;
      const tick = barStart + beat * ppq;
      const step16 = beat * 4; // corrispondenza step16 per drumContext
      // S5-A: velocity boost se il beat coincide con un kick sincopato
      const onKick = kickSteps?.has(step16);
      const kickBoost = (beat === 0 && onKick) ? 8 : (onKick ? 4 : 0);

      const prevWalkNote = beat > 0 ? walk[beat - 1] : null;
      const canHammer = beat > 0 && prevWalkNote != null
        && Math.abs(note - prevWalkNote) <= 2 && rng.bool(0.30);

      if (canHammer) {
        // Ornamento (ghost note) appena prima del beat per mantenere il groove on-grid
        const graceTick = tick - Math.round(ppq / 4);
        if (graceTick >= barStart) {
          barEvents.push({ tick: graceTick, note: prevWalkNote, velocity: vel(-15), duration: Math.round(ppq / 4) });
        }
        barEvents.push({ tick, note, velocity: vel(beat === 0 ? 8 + kickBoost : kickBoost), duration: durQ });
      } else {
        barEvents.push({ tick, note, velocity: vel(beat === 0 ? 8 + kickBoost : kickBoost), duration: durQ });
      }

      if (beat === 0) memory.record(note);
    }
    addHookEcho(barEvents);

  } else {
    // ── Fingerstyle / default ──────────────────────────────────────

    // Beat 1: sempre root, forte
    // v0.8: Slide into root se possibile (lo slide parte prima del barStart)
    if (canSlideFromPrev && prevLastNote) {
      const slideStartTick = barStart - Math.round(ppq / 6);
      if (slideStartTick >= 0) { // TIMING-1: Guard tick negativo
        const slideEvents = createSlide(prevLastNote, root, slideStartTick, ppq / 6, vel(4), bpm, ppqVal);
        // Rimuovi l'ultimo evento dello slide (sarebbe la root, la aggiungiamo sotto)
        slideEvents.pop();
        barEvents.push(...slideEvents);
      }
    }
    // Root sempre su barStart esatto
    // S5-A: boost velocity se beat 1 coincide con kick
    const b1KickBoost = (ctx.kickSteps?.has(0)) ? 6 : 0;
    barEvents.push({ tick: barStart, note: root, velocity: vel(10 + b1KickBoost), duration: durH });
    memory.record(root);

    // Beat 2: pocket lock — quinta o terza sempre presente da density 0.30
    let lastPlayed = root;
    if (density > 0.30 && energy >= 4) {
      const beat2note = seventh ?? third;
      barEvents.push({ tick: barStart + ppq, note: beat2note, velocity: vel(-6), duration: durE });
      lastPlayed = beat2note;
    }

    // Beat 3: fifth (o root su bar 2 per varietà)
    if (density > 0.25) {
      const beat3note = isBar2ofPhrase ? root : fifth;
      const beat3Tick = barStart + ppq * 2;
      // TIMING-2: Slide da lastPlayed (beat 2 o root) a beat3note, anticipando il beat
      if (canSlide(lastPlayed, beat3note) && rng.bool(0.20)) {
        const slideEvents = createSlide(lastPlayed, beat3note, beat3Tick - Math.round(ppq / 6), ppq / 6, vel(), bpm, ppqVal);
        slideEvents.pop(); // Rimuove il target generato in ritardo
        barEvents.push(...slideEvents);
      }
      barEvents.push({ tick: beat3Tick, note: beat3note, velocity: vel(), duration: durQ });
    }

    // Beat 3.5: nota di passaggio scalare prima del cambio accordo (approach intra-bar)
    if (chordChanging && density > 0.45 && scalePool.length > 1) {
      const ascending = ctx.nextRoot > root;
      const passTick  = barStart + ppq * 2 + ppq / 2;
      const passTone  = ascending
        ? scalePool.find(n => n > root) ?? fifth
        : [...scalePool].reverse().find(n => n < root) ?? third;
      barEvents.push({ tick: passTick, note: passTone, velocity: vel(-10), duration: durE });
    }

    // Beat 4: sempre presente come nota di approccio — chiude il groove su ogni bar
    if (density > 0.28) {
      const beat4note = chordChanging && approachNote != null
        ? approachNote
        : rng.bool(0.55) ? fifth : third;
      
      const beat4Tick = barStart + ppq * 3;
      // v0.8: Slide verso approach note se cambio accordo, anticipando il beat
      if (chordChanging && approachNote && canSlide(fifth, approachNote) && rng.bool(0.35)) {
        const slideEvents = createSlide(fifth, approachNote, beat4Tick - Math.round(ppq / 6), ppq / 6, vel(-8), bpm, ppqVal);
        slideEvents.pop();
        barEvents.push(...slideEvents);
      }
      barEvents.push({ tick: beat4Tick, note: beat4note, velocity: vel(-8), duration: durE });
    }

    // Beat 4.5: approach cromatico finale direzione-consapevole (solo ad alta density)
    if (density > 0.50) {
      const passNote = chordChanging && approachNote != null
        ? Math.max(LO, Math.min(HI,
            approachNote + (ctx.nextRoot >= approachNote ? -1 : +1)))
        : fifth;
      barEvents.push({ tick: barStart + ppq * 3 + ppq / 2, note: passNote,
                    velocity: vel(-14), duration: durE });
    }

    // Ghost note su fingerstyle ad alta density (come slap, ma più leggera)
    if (style === 'fingerstyle' && density > 0.55 && rng.bool(0.25)) {
      const ghostStep = rng.bool(0.5) ? 6 : 14;  // offbeat: "and" del beat 2 o del beat 4
      barEvents.push({ tick: barStart + ghostStep * (ppq / 4), note: root,
                    velocity: rng.int(12, 25), duration: Math.round(ppq / 4 * 0.3) });
    }

    // Slap pop: ottava su offbeat — thumb beat 1&3 già presenti, pop su "e" o "&"
    if (style === 'slap' && density > 0.50) {
      const popNote  = clampToRegister(root + 12, LO, HI);
      const popSteps = density > 0.70
        ? [rng.choice([6, 10, 14]), rng.choice([2, 6])]
        : [rng.choice([6, 10, 14])];
      for (const step of popSteps) {
        barEvents.push({ tick: barStart + step * (ppq / 4), note: popNote,
                      velocity: rng.int(80, 100), duration: Math.round(ppq / 4 * 0.25) });
      }
    }

    // Neo Soul dead note (slap): nota muta su beat deboli
    if (style === 'slap' && density > 0.6 && rng.bool(0.30)) {
      const deadStep = rng.bool(0.5) ? 2 : 10;
      barEvents.push({ tick: barStart + deadStep * (ppq / 4), note: root,
                    velocity: rng.int(15, 28), duration: Math.round(ppq / 4 * 0.3) });
    }

    addHookEcho(barEvents);
  }

  return barEvents;
}
