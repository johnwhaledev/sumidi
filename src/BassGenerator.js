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
import { PhraseMemory, chromaticApproach, arcVelocity, msToTick,
         regioniDellaBattuta, finestraAlTick } from './FlowCore.js';
import { createBassSlide } from './Ornaments.js';

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
      // A1b: le regioni della battuta, non la sola d'inizio bar. Il caso
      // speciale dell'eco (sotto) era finora l'unico posto dove il basso
      // guardava l'accordo al tick giusto: ora lo fa dappertutto.
      const spans  = regioniDellaBattuta(section.harmonicMap, barStart, barStart + barTicks);
      const region = spans[0]?.region;
      if (!region) continue;
      // A5: l'eco dell'hook cade tardi nel bar (vedi addHookEcho, ppq*3.75) —
      // in 4/4 l'harmonicMap ha una finestra per metà bar, quindi l'accordo lì
      // può essere diverso da quello a inizio bar. Serve la regione ESATTA a
      // quel tick, non quella di `region` (bar-start), per sapere se in quel
      // punto sta suonando la dominante.
      const echoTick   = barStart + Math.round(meta.ppq * 3.75);
      const echoRegion = finestraAlTick(spans, echoTick).region;
      allBars.push({
        barStart, region, spans,
        echoRegionRootPc: echoRegion.rootPc,
        echoRegionThirdDeg: echoRegion.chord_degrees?.[1] ?? null,
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
  // A5 (2026-08-26): keyScaleNotes resta minore naturale per tenere l'hook
  // sempre riconoscibile (stessa nota a ogni ricorrenza) — ma se cade sul 7°
  // naturale proprio mentre suona la dominante, clasherebbe con la sensibile
  // che è la terza di quell'accordo. Misurato: succede in ~3% delle occorrenze
  // dell'eco. Correzione mirata sotto (addHookEcho), non un cambio di pool.
  const dominantPc = meta.keyInfo?.isMinor ? (meta.keyInfo.rootPc + 7) % 12 : null;
  const natural7Pc = meta.keyInfo?.isMinor ? (meta.keyInfo.rootPc + 10) % 12 : null;

  for (let i = 0; i < allBars.length; i++) {
    const { barStart, echoRegionRootPc, echoRegionThirdDeg, style, density, energy,
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

    // A1b: un contesto armonico per ogni regione della battuta, non uno per
    // battuta. Il basso è il caso peggiore dei quattro generatori — chord
    // tones, scala e approccio erano estratti qui e usati per tutti e quattro
    // i beat — quindi la lista si costruisce qui e `_genBassBar` ci pesca
    // dentro il contesto del tick che sta suonando. Con un accordo per battuta
    // la lista ha un elemento e vale il codice di prima, riga per riga.
    const armonie = allBars[i].spans.map((sp, si) => {
      const r = sp.region;
      // Il "prossimo accordo" è quello della regione dopo: dentro la battuta se
      // ce n'è un'altra, altrimenti quello d'inizio battuta successiva.
      const successiva = si + 1 < allBars[i].spans.length
        ? allBars[i].spans[si + 1].region
        : nextRegion;
      const root = clampToRegister(
        // FASE A: slash chord — usa bassNoteMidi se presente (es. C/E → suona E)
        r.bassNoteMidi ?? r.root,
        LO, HI
      );
      const thirdDeg      = r.chord_degrees[1] ?? 4;
      const nextRoot      = successiva ? clampToRegister(successiva.root, LO, HI) : root;
      const chordChanging = successiva != null && successiva.rootPc !== r.rootPc;
      return {
        inizio: sp.inizio, fine: sp.fine, region: r,
        root,
        fifth:   clampToRegister(r.root + 7, LO, HI),
        third:   clampToRegister(r.root + thirdDeg, LO, HI),
        seventh: r.chord_degrees[3] != null
          ? clampToRegister(r.root + r.chord_degrees[3], LO, HI)
          : null,
        // Scale notes filtrate al range corrente per passing tones diatonici
        scalePool: (r.scale_notes ?? []).filter(n => n >= LO && n <= HI),
        avoidNotes: r.avoid_notes ?? [],  // Sessione C S2-B
        nextRoot, chordChanging,
        // Approach note cromatico (ultimo beat, verso accordo successivo)
        approachNote: chordChanging ? chromaticApproach(nextRoot, root, LO, HI) : null,
      };
    });
    const armoniaAl = tick => finestraAlTick(armonie, tick);
    const root = armonie[0].root;   // l'armonia d'inizio battuta, dove serve

    const isBar2ofPhrase = barIdxInSection % 2 === 1;

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
      armoniaAl,
      isBar2ofPhrase, sectionType,
      barIdxInSection, totalBarsInSection, barTicks,
      canSlideFromPrev, prevLastNote, bpm,
      velocityBase, velocityArcType,
      kickSteps,                              // S5-A
      seedMotive, hookPool,                   // basso in dialogo con l'hook del piano
      echoRegionRootPc, echoRegionThirdDeg, dominantPc, natural7Pc, // A5: correzione mirata sull'eco
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
 *
 * O3 di PLAN37: questa e le due funzioni sotto sono esportate perché le usa
 * anche la mano sinistra del piano quando suona da sola. Sono pure — ricevono
 * note e registro, restituiscono una nota — e non sanno niente di corde: le
 * parti specifiche dello strumento (`applyNoteOffVariation`, `canSlide`)
 * restano qui e non escono.
 */
export function _nearestChordTone(tones, anchor, lo, hi) {
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
export function _selectBeat3(beat1Note, root, fifth, third, seventh, lo, hi) {
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
export function _walkingPassTone(fromNote, toNote, scalePool, avoidNotes, lo, hi) {
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
          armoniaAl, isBar2ofPhrase,
          sectionType, barIdxInSection, totalBarsInSection, barTicks,
          canSlideFromPrev, prevLastNote, lo: LO, hi: HI,
          seedMotive, hookPool,
          echoRegionRootPc, echoRegionThirdDeg, dominantPc, natural7Pc } = ctx;

  // A1b: l'armonia del beat, non quella della battuta. `a(tick)` dà i chord
  // tones, la scala e l'approccio di quel punto; con un accordo per battuta
  // torna sempre lo stesso oggetto e ogni riga qui sotto vale come prima.
  const a = tick => armoniaAl(tick);

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
    let echoNote    = hookPool[idx];
    // A5: se l'eco cade sul 7° naturale proprio mentre in quel punto (non a
    // inizio bar: l'eco è tardi nel bar, l'accordo può essere già cambiato)
    // suona la dominante ALTERATA (terza maggiore — E7/E, non Em: il v
    // naturale della minore ha la stessa radice ma terza minore, e il suo
    // Sol naturale è il suo stesso accordo, non un errore), alzarlo di un
    // semitono verso la sensibile. Pool globale invariato (motivo sempre
    // riconoscibile), si corregge solo la singola nota che clasherebbe.
    if (dominantPc != null && echoRegionRootPc === dominantPc && echoRegionThirdDeg === 4
        && echoNote % 12 === natural7Pc) {
      echoNote += 1;
    }
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
    // Il pedale è pedale: tiene la fondamentale d'inizio battuta anche se
    // l'armonia cambia sotto — è il gesto, non una regione risolta male.
    const { root } = a(barStart);
    // v0.8: Slide into pedal point se possibile
    if (canSlideFromPrev && prevLastNote) {
      const slideEvents = createBassSlide(prevLastNote, root, barStart, ppq / 2, vel(8), bpm, ppqVal);
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
    // Un'armonia per beat: su | Dm7 G7 | i primi due quarti camminano sul Dm7
    // e gli altri due sul G7, invece di camminare quattro volte sul Dm7.
    const a1 = a(barStart);
    const a2 = a(barStart + ppq);
    const a3 = a(barStart + ppq * 2);
    const a4 = a(barStart + ppq * 3);
    const toni = ar => [ar.root, ar.fifth, ar.third, ar.seventh].filter(t => t != null);

    // 2-feel a BPM < 70: solo beat 1 e beat 3 con durata mezza battuta
    const bpmCtx = ctx.bpm ?? 120;
    const is2Feel = bpmCtx < 70 && rng.bool(0.40);
    if (is2Feel) {
      const beat1n = _nearestChordTone(toni(a1), prevLastNote ?? a1.root, LO, HI);
      const beat3n = _selectBeat3(beat1n, a3.root, a3.fifth, a3.third, a3.seventh, LO, HI);
      barEvents.push({ tick: barStart,           note: beat1n, velocity: vel(8),  duration: ppq * 2 - 10 });
      barEvents.push({ tick: barStart + ppq * 2, note: beat3n, velocity: vel(0),  duration: ppq * 2 - 10 });
      memory.record(beat1n);
      return barEvents;
    }

    // Beat 1: chord tone più vicino all'ultima nota suonata (non root fisso)
    const beat1 = _nearestChordTone(toni(a1), prevLastNote ?? a1.root, LO, HI);

    // Beat 3: chord tone alternato rispetto a beat 1
    const beat3 = _selectBeat3(beat1, a3.root, a3.fifth, a3.third, a3.seventh, LO, HI);

    // Beat 2: passing tone scalare toward beat3, escluse avoid notes
    const raw2  = _walkingPassTone(beat1, beat3, a2.scalePool, a2.avoidNotes, LO, HI);
    const beat2 = raw2 ?? clampToRegister(
      beat3 > beat1 ? (a2.scalePool.find(n => n > beat1) ?? beat1 + 2)
                    : ([...a2.scalePool].reverse().find(n => n < beat1) ?? beat1 - 2),
      LO, HI
    );

    // Beat 4: approach cromatico verso beat 1 del bar successivo
    const beat4 = a4.approachNote ?? chromaticApproach(a4.nextRoot, beat1, LO, HI);

    // Enclosure su cambio accordo: beat 2-3 girano intorno all'approccio
    const walk = [beat1, beat2, beat3, beat4];
    if (a4.chordChanging && a4.approachNote != null) {
      walk[2] = rng.bool(0.60)
        ? Math.min(HI, a4.approachNote + 1)
        : Math.max(LO, a4.approachNote - 1);
      walk[3] = a4.approachNote;
    }

    // Emetti i 4 quarti con hammer-on/pull-off dove possibile
    const kickSteps = ctx.kickSteps; // S5-A
    for (let beat = 0; beat < 4; beat++) {
      const tick = barStart + beat * ppq;
      const note = walk[beat] ?? a(tick).root;
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
    const root = a(barStart).root;
    // v0.8: Slide into root se possibile (lo slide parte prima del barStart)
    if (canSlideFromPrev && prevLastNote) {
      const slideStartTick = barStart - Math.round(ppq / 6);
      if (slideStartTick >= 0) { // TIMING-1: Guard tick negativo
        const slideEvents = createBassSlide(prevLastNote, root, slideStartTick, ppq / 6, vel(4), bpm, ppqVal);
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
      const a2 = a(barStart + ppq);
      const beat2note = a2.seventh ?? a2.third;
      barEvents.push({ tick: barStart + ppq, note: beat2note, velocity: vel(-6), duration: durE });
      lastPlayed = beat2note;
    }

    // Beat 3: fifth (o root su bar 2 per varietà)
    if (density > 0.25) {
      const beat3Tick = barStart + ppq * 2;
      const a3        = a(beat3Tick);
      const beat3note = isBar2ofPhrase ? a3.root : a3.fifth;
      // TIMING-2: Slide da lastPlayed (beat 2 o root) a beat3note, anticipando il beat
      if (canSlide(lastPlayed, beat3note) && rng.bool(0.20)) {
        const slideEvents = createBassSlide(lastPlayed, beat3note, beat3Tick - Math.round(ppq / 6), ppq / 6, vel(), bpm, ppqVal);
        slideEvents.pop(); // Rimuove il target generato in ritardo
        barEvents.push(...slideEvents);
      }
      barEvents.push({ tick: beat3Tick, note: beat3note, velocity: vel(), duration: durQ });
    }

    // Beat 3.5: nota di passaggio scalare prima del cambio accordo (approach intra-bar)
    const passTick = barStart + ppq * 2 + ppq / 2;
    const a35      = a(passTick);
    if (a35.chordChanging && density > 0.45 && a35.scalePool.length > 1) {
      const ascending = a35.nextRoot > a35.root;
      const passTone  = ascending
        ? a35.scalePool.find(n => n > a35.root) ?? a35.fifth
        : [...a35.scalePool].reverse().find(n => n < a35.root) ?? a35.third;
      barEvents.push({ tick: passTick, note: passTone, velocity: vel(-10), duration: durE });
    }

    // Beat 4: sempre presente come nota di approccio — chiude il groove su ogni bar
    const beat4Tick = barStart + ppq * 3;
    const a4        = a(beat4Tick);
    if (density > 0.28) {
      const beat4note = a4.chordChanging && a4.approachNote != null
        ? a4.approachNote
        : rng.bool(0.55) ? a4.fifth : a4.third;

      // v0.8: Slide verso approach note se cambio accordo, anticipando il beat
      if (a4.chordChanging && a4.approachNote && canSlide(a4.fifth, a4.approachNote) && rng.bool(0.35)) {
        const slideEvents = createBassSlide(a4.fifth, a4.approachNote, beat4Tick - Math.round(ppq / 6), ppq / 6, vel(-8), bpm, ppqVal);
        slideEvents.pop();
        barEvents.push(...slideEvents);
      }
      barEvents.push({ tick: beat4Tick, note: beat4note, velocity: vel(-8), duration: durE });
    }

    // Beat 4.5: approach cromatico finale direzione-consapevole (solo ad alta density)
    if (density > 0.50) {
      const passNote = a4.chordChanging && a4.approachNote != null
        ? Math.max(LO, Math.min(HI,
            a4.approachNote + (a4.nextRoot >= a4.approachNote ? -1 : +1)))
        : a4.fifth;
      barEvents.push({ tick: barStart + ppq * 3 + ppq / 2, note: passNote,
                    velocity: vel(-14), duration: durE });
    }

    // Ghost note su fingerstyle ad alta density (come slap, ma più leggera)
    if (style === 'fingerstyle' && density > 0.55 && rng.bool(0.25)) {
      const ghostStep = rng.bool(0.5) ? 6 : 14;  // offbeat: "and" del beat 2 o del beat 4
      const ghostTick = barStart + ghostStep * (ppq / 4);
      barEvents.push({ tick: ghostTick, note: a(ghostTick).root,
                    velocity: rng.int(12, 25), duration: Math.round(ppq / 4 * 0.3) });
    }

    // Slap pop: ottava su offbeat — thumb beat 1&3 già presenti, pop su "e" o "&"
    if (style === 'slap' && density > 0.50) {
      const popSteps = density > 0.70
        ? [rng.choice([6, 10, 14]), rng.choice([2, 6])]
        : [rng.choice([6, 10, 14])];
      for (const step of popSteps) {
        const popTick = barStart + step * (ppq / 4);
        barEvents.push({ tick: popTick, note: clampToRegister(a(popTick).root + 12, LO, HI),
                      velocity: rng.int(80, 100), duration: Math.round(ppq / 4 * 0.25) });
      }
    }

    // Neo Soul dead note (slap): nota muta su beat deboli
    if (style === 'slap' && density > 0.6 && rng.bool(0.30)) {
      const deadStep = rng.bool(0.5) ? 2 : 10;
      const deadTick = barStart + deadStep * (ppq / 4);
      barEvents.push({ tick: deadTick, note: a(deadTick).root,
                    velocity: rng.int(15, 28), duration: Math.round(ppq / 4 * 0.3) });
    }

    addHookEcho(barEvents);
  }

  return barEvents;
}
