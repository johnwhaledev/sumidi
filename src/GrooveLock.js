/**
 * GrooveLock.js — Pocket engine: offset temporale relativo tra strumenti
 * ─────────────────────────────────────────────────────────────────────
 * Post-processing layer (applicato dopo tutti i generate*(), prima di addT()).
 * Non tocca i generatori. Opera su tick già generati.
 *
 * Effetto: il basso "segue" il kick di 12–20ms, la chitarra di 18–28ms,
 * il piano LH di 14–22ms — simula il pocket feel di un ensemble reale.
 *
 * Principio architetturale:
 *   - kickMap:  Map<barAbsoluteTick, kickTick>  (beat 1 e beat 3 per bar)
 *   - snareMap: Map<barAbsoluteTick, snareTick> (beat 2 e beat 4 per bar)
 *   - lockToBeat: sposta le note vicine al kick/snare di un offset ms deterministico
 *
 * NOTE:
 *   - Non sposta note CC (automazione), solo note_on/note_off
 *   - Non sposta note già anticipate (tick < barStart) — rispetta Fase C
 *   - Note di basso wideband (< MIDI 57) in chitarra vengono trattate come le note basso
 *   - Offset seed-deterministico con varianza ±3 tick per evitare "locked grid" sound
 */

// Costanti GM drum notes (specchio di Percussionist.js)
const KICK_NOTES  = new Set([35, 36]);
const SNARE_NOTES = new Set([38, 40]);

// Utility: ms → tick
function _ms2tick(ms, bpm, ppq) {
  return (ms / (60000 / bpm)) * ppq;
}

// ── Costruisce la mappa kick per ogni bar ─────────────────────────
// Ritorna Map<barAbsoluteTick, { beat1: tick|null, beat3: tick|null }>
function buildKickMap(drumEvents, ppq, barTicks) {
  const map = new Map();
  if (!drumEvents?.length) return map;

  const ppqBeat = ppq;           // 1 beat = ppq tick
  const beat3off = ppqBeat * 2;  // Beat 3 = barStart + 2 quarti

  for (const ev of drumEvents) {
    if (ev.cc != null) continue;
    if (!KICK_NOTES.has(ev.note)) continue;

    const barStart = Math.floor(ev.tick / barTicks) * barTicks;
    const posInBar = ev.tick - barStart;

    if (!map.has(barStart)) map.set(barStart, { beat1: null, beat3: null });
    const entry = map.get(barStart);

    // beat 1: posizione 0 → ppq (primo quarto)
    if (posInBar < ppqBeat && entry.beat1 === null) {
      entry.beat1 = ev.tick;
    }
    // beat 3: posizione beat3off ± ppq
    if (posInBar >= beat3off - ppq / 2 && posInBar < beat3off + ppqBeat && entry.beat3 === null) {
      entry.beat3 = ev.tick;
    }
  }
  return map;
}

// ── Costruisce la mappa snare per ogni bar ────────────────────────
// Ritorna Map<barAbsoluteTick, { beat2: tick|null, beat4: tick|null }>
function buildSnareMap(drumEvents, ppq, barTicks) {
  const map = new Map();
  if (!drumEvents?.length) return map;

  const ppqBeat = ppq;
  const beat2off = ppqBeat;       // Beat 2 = barStart + 1 quarto
  const beat4off = ppqBeat * 3;   // Beat 4 = barStart + 3 quarti

  for (const ev of drumEvents) {
    if (ev.cc != null) continue;
    if (!SNARE_NOTES.has(ev.note)) continue;

    const barStart = Math.floor(ev.tick / barTicks) * barTicks;
    const posInBar = ev.tick - barStart;

    if (!map.has(barStart)) map.set(barStart, { beat2: null, beat4: null });
    const entry = map.get(barStart);

    if (posInBar >= beat2off - ppq / 2 && posInBar < beat2off + ppqBeat && entry.beat2 === null) {
      entry.beat2 = ev.tick;
    }
    if (posInBar >= beat4off - ppq / 2 && posInBar < beat4off + ppqBeat && entry.beat4 === null) {
      entry.beat4 = ev.tick;
    }
  }
  return map;
}

// ── Applica pocket offset a un set di eventi ─────────────────────
// Solo note non-CC, solo note non già anticipate (tick >= barStart)
// offset_lo/hi in ms, trasformati in tick via bpm/ppq
function _lockEvents(events, kickMap, opts) {
  const {
    beat1_ms_lo, beat1_ms_hi,
    beat3_ms_lo = 0, beat3_ms_hi = 0,
    bass_string_only = false,
    bpm, ppq, barTicks, rng,
  } = opts;

  for (const ev of events) {
    if (ev.cc != null) continue;
    if (bass_string_only && ev.note >= 57) continue;  // solo note basse < A3

    const barStart  = Math.floor(ev.tick / barTicks) * barTicks;
    const posInBar  = ev.tick - barStart;
    const ppqBeat   = ppq;
    const entry     = kickMap.get(barStart);
    if (!entry) continue;

    // Note già anticipate (tick < barStart): non toccare — rispetta Fase C
    if (ev.tick < barStart) continue;

    let anchorTick = null;
    let lo = 0, hi = 0;

    if (posInBar < ppqBeat && entry.beat1 !== null) {
      // Vicino al beat 1
      anchorTick = entry.beat1;
      lo = beat1_ms_lo; hi = beat1_ms_hi;
    } else if (beat3_ms_hi > 0 && posInBar >= ppqBeat * 1.5 && posInBar < ppqBeat * 2.5 && entry.beat3 !== null) {
      // Vicino al beat 3
      anchorTick = entry.beat3;
      lo = beat3_ms_lo; hi = beat3_ms_hi;
    }

    if (anchorTick === null) continue;

    // Offset deterministico con piccola varianza (±3 tick) per evitare sound "locked"
    const offsetMs   = lo + (rng.int(0, 100) / 100) * (hi - lo);
    const offsetTick = Math.round(_ms2tick(offsetMs, bpm, ppq));
    const jitter     = rng.int(-3, 3);

    // Sposta: il nuovo tick è anchorTick + offset (non il tick originale + offset)
    ev.tick = Math.max(0, anchorTick + offsetTick + jitter);
  }
}

// ── Entry point pubblico ──────────────────────────────────────────
/**
 * Applica il pocket groove lock a tutti i track events.
 *
 * @param {{drums, bass, guitar, piano}} trackEvents — oggetto con gli array eventi per traccia
 * @param {Object} meta — blueprint.meta (ppq, bpm, barTicks)
 * @param {Object} rng  — generatore random (da makeRng)
 */
export function applyGrooveLock(trackEvents, meta, rng) {
  const { ppq, bpm, barTicks } = meta;
  if (!ppq || !bpm || !barTicks) return;

  const drumEvents = trackEvents.drums ?? [];
  if (!drumEvents.length) return;  // Nessun drums → nessun anchor

  const kickMap  = buildKickMap(drumEvents, ppq, barTicks);
  const opts     = { bpm, ppq, barTicks, rng };

  // Bass: segue kick beat1 +12–20ms, beat3 +8–15ms
  if (trackEvents.bass?.length) {
    _lockEvents(trackEvents.bass, kickMap, {
      ...opts,
      beat1_ms_lo: 12, beat1_ms_hi: 20,
      beat3_ms_lo:  8, beat3_ms_hi: 15,
    });
  }

  // Guitar bass strings (note < MIDI 57): kick +18–28ms
  if (trackEvents.guitar?.length) {
    _lockEvents(trackEvents.guitar, kickMap, {
      ...opts,
      beat1_ms_lo: 18, beat1_ms_hi: 28,
      beat3_ms_lo: 12, beat3_ms_hi: 20,
      bass_string_only: true,
    });
  }

  // Piano LH (note < MIDI 60): kick +14–22ms
  if (trackEvents.piano?.length) {
    _lockEvents(trackEvents.piano, kickMap, {
      ...opts,
      beat1_ms_lo: 14, beat1_ms_hi: 22,
      beat3_ms_lo:  8, beat3_ms_hi: 14,
      bass_string_only: true,  // solo note sotto C4 (60) = LH
    });
  }
}
