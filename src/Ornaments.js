/**
 * Ornaments.js
 * ─────────────────────────────────────────────────────────────────
 * Motore condiviso per gli "ornamenti" — abbellimenti nota-a-nota che
 * diversi generator ricreavano indipendentemente con formule leggermente
 * diverse (sessione R4 — PLAN35).
 *
 * createGlide() sostituisce createSlide() (BassGenerator) e
 * createPortamento() (EnsembleGenerator): stessa meccanica — N note
 * intermedie tra due altezze con un profilo di velocity/timing — ma con
 * un "profilo" per strumento invece di due funzioni copiate e divergenti.
 * BASS_GLIDE_PROFILE e STRINGS_GLIDE_PROFILE riproducono esattamente le
 * formule originali (vedi tests/ornaments.test.js per la verifica
 * byte-a-byte contro l'output pre-refactor, catturato in
 * tests/fixtures/golden_ornaments.json).
 *
 * Hammer-on/pull-off (BassGenerator) e flam (Percussionist) restano
 * funzioni separate: sono concetti musicali diversi da un glissando
 * (nota legata senza nuovo attacco / doppio colpo quasi simultaneo), non
 * varianti della stessa idea — unificarli avrebbe reso il codice più
 * astratto senza alcun beneficio reale.
 * ─────────────────────────────────────────────────────────────────
 */

import { msToTick } from './FlowCore.js';

/**
 * Profilo del glissando del basso (ex createSlide): attacco pieno,
 * velocity che scende verso il centro e risale leggermente alla nota
 * finale. Sempre attivo (nessuna soglia minima di semitoni) — anche un
 * salto di 1 semitono genera comunque una transizione a 2 note.
 */
export const BASS_GLIDE_PROFILE = {
  minSemitonesToGlide: 0,
  computeSteps: semitones => (semitones <= 2 ? 2 : Math.min(semitones, 4)),
  firstNote: { velocity: (v) => v, overlapMs: 15 },
  innerNote: {
    // Attivo solo per glissandi lunghi (steps > 2); loop i = 1..steps-2.
    active: steps => steps > 2,
    loopEnd: steps => steps - 1,
    progress: (i, steps) => i / (steps - 1),
    // Clamp assoluto a 20 (non relativo alla velocity base) — fedele all'originale.
    velocity: (v, i) => Math.max(20, Math.round(v * (0.6 - i * 0.1))),
    overlapMs: 10,
  },
  finalNote: { velocity: (v) => Math.round(v * 0.9), durationMode: 'perStep' },
};

/**
 * Profilo del portamento degli archi (ex createPortamento): nota
 * iniziale "ghost" (attacco morbido), velocity che cresce verso il
 * bersaglio. Sotto i 2 semitoni non fa glissando (nota diretta).
 */
export const STRINGS_GLIDE_PROFILE = {
  minSemitonesToGlide: 2,
  computeSteps: semitones => Math.min(semitones, 5),
  firstNote: { velocity: (v) => Math.round(v * 0.3), overlapMs: 20 },
  innerNote: {
    active: () => true,
    loopEnd: steps => steps,
    progress: (i, steps) => i / steps,
    velocity: (v, i, steps) => Math.round(v * (0.2 + (i / steps) * 0.5)),
    overlapMs: 15,
  },
  finalNote: { velocity: (v) => v, durationMode: 'tailFraction', tailFraction: 0.3 },
};

/**
 * Crea un glissando tra due note secondo un profilo per strumento.
 *
 * @param {number} fromNote  Nota di partenza (MIDI)
 * @param {number} toNote    Nota di arrivo (MIDI)
 * @param {number} startTick Tick di inizio
 * @param {number} duration  Durata totale del glissando in tick
 * @param {number} velocity  Velocity base (0-127)
 * @param {number} bpm       Tempo
 * @param {number} ppq       Pulses per quarter note
 * @param {Object} profile   BASS_GLIDE_PROFILE | STRINGS_GLIDE_PROFILE | custom
 * @returns {Array} Array di eventi { tick, note, velocity, duration }
 */
export function createGlide(fromNote, toNote, startTick, duration, velocity, bpm, ppq, profile) {
  const events = [];
  const semitones = Math.abs(toNote - fromNote);
  const direction = toNote > fromNote ? 1 : -1;

  if (profile.minSemitonesToGlide > 0 && semitones <= profile.minSemitonesToGlide) {
    events.push({ tick: startTick, note: toNote, velocity, duration });
    return events;
  }

  const steps = Math.max(1, profile.computeSteps(semitones));
  const stepDuration = Math.floor(duration / steps);

  // Prima nota
  events.push({
    tick: startTick,
    note: fromNote,
    velocity: Math.round(profile.firstNote.velocity(velocity)),
    duration: stepDuration + Math.round(msToTick(profile.firstNote.overlapMs, bpm, ppq)),
  });

  // Note intermedie
  if (profile.innerNote.active(steps)) {
    const loopEnd = profile.innerNote.loopEnd(steps);
    for (let i = 1; i < loopEnd; i++) {
      const progress = profile.innerNote.progress(i, steps);
      // Arrotondare la magnitudine PRIMA di applicare il segno: fedele
      // all'originale, dove Math.round(-1.5) e -Math.round(1.5) differiscono
      // (JS arrotonda i .5 verso +Infinity), rilevante nei glissandi discendenti.
      const interNote = fromNote + direction * Math.round(semitones * progress);
      events.push({
        tick: startTick + i * stepDuration,
        note: interNote,
        velocity: profile.innerNote.velocity(velocity, i, steps),
        duration: stepDuration + Math.round(msToTick(profile.innerNote.overlapMs, bpm, ppq)),
      });
    }
  }

  // Nota finale
  if (profile.finalNote.durationMode === 'tailFraction') {
    const tailDur = Math.round(stepDuration * profile.finalNote.tailFraction);
    events.push({
      tick: startTick + duration - tailDur,
      note: toNote,
      velocity: Math.round(profile.finalNote.velocity(velocity)),
      duration: tailDur,
    });
  } else {
    events.push({
      tick: startTick + (steps - 1) * stepDuration,
      note: toNote,
      velocity: Math.round(profile.finalNote.velocity(velocity)),
      duration: Math.round(duration / steps),
    });
  }

  return events;
}
