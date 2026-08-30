/**
 * SessionExport.js — Costruzione dei file MIDI di Session Mode (T1 di PLAN37)
 * ─────────────────────────────────────────────────────────────────
 * Estratto da Session.js. Lì la scrittura del MIDI era intrecciata al DOM
 * (bottone da disabilitare, `window._smMixerOverride`, il link di download) e
 * quindi non collaudabile: 2.561 righe con zero test, ed è da qui che escono i
 * file che l'utente porta in DAW. Qui dentro non si tocca il DOM e non si
 * scarica niente — si ricevono stato e buffer, si restituisce un MidiWriter.
 * Session.js resta il pezzo che legge l'interfaccia e fa partire il download.
 *
 * Nota su una duplicazione rimossa strada facendo: i blocchi di drums, bass,
 * guitar e piano erano quattro copie della stessa dozzina di righe, diverse
 * solo per canale e nome traccia. Ora sono una tabella e un ciclo. L'ordine
 * delle tracce è quello di prima, ed è verificato: i byte prodotti non cambiano.
 */

import { MidiWriter } from './MidiWriter.js';
import { parseKey, keySignatureSf } from './SongArchitect.js';

/** Canale MIDI e nome di traccia degli strumenti lineari, nell'ordine di scrittura. */
const TRACCE_LINEARI = [
  { key: 'drums', ch: 9, nome: 'Drums' },
  { key: 'bass', ch: 1, nome: 'Bass' },
  { key: 'guitar', ch: 2, nome: 'Guitar' },
  { key: 'piano', ch: 3, nome: 'Piano' },
];

/**
 * Scrive l'armatura di chiave (FF 59) — B2 di PLAN37. Senza, il .mid si apre in
 * Do maggiore in MuseScore/Logic/Dorico e ogni alterazione compare come
 * accidente sulla singola nota. La tabella delle armature vive in
 * SongArchitect (keySignatureSf): qui si converte solo "Am"/"F#" in pc + modo.
 * @param {MidiWriter} writer
 * @param {string} keyStr
 */
export function writeKeySignature(writer, keyStr) {
  const { rootPc, isMinor } = parseKey(keyStr);
  writer.setKeySignature(keySignatureSf(rootPc, isMinor), isMinor);
}

/**
 * Nome traccia della batteria: cambia se la sezione usa una drum machine.
 * @param {object} state — stato del SessionManager
 * @returns {string}
 */
function nomeTracciaDrums(state) {
  const isDM = state.sections.some(s => (s.instruments.drums.characterId ?? '').startsWith('dm_'));
  if (!isDM) return 'Drums';
  const preset = state.sections.find(s => s.instruments.drums.params?.dmPreset)
    ?.instruments.drums.params.dmPreset ?? 'trap';
  return `Drum Machine (${preset})`;
}

/**
 * Costruisce il MIDI dell'intera sessione.
 * @param {object} state         — SessionManager.getState()
 * @param {object} trackBuffers  — SessionManager.assembleSessionEvents(ppq)
 * @param {object} [opts]
 * @param {number} [opts.ppq]
 * @param {object} [opts.mixerOverride] — strumento → program GM forzato, o 'auto'
 * @returns {MidiWriter}
 */
export function buildSessionMidi(state, trackBuffers, { ppq = 480, mixerOverride = {} } = {}) {
  const barTicks = ppq * 4;
  const writer = new MidiWriter(ppq);
  writer.setTempo(state.bpm);
  writer.setTimeSignature(4, 4);
  writeKeySignature(writer, state.key);

  // Marker di sezione (FF 06): punti di navigazione nella timeline della DAW
  let globalTick = 0;
  for (const sec of state.sections) {
    writer.addMarker(globalTick, sec.label);
    globalTick += sec.bars * barTicks;
  }

  // ── Strumenti lineari: drums (ch 9, GM Percussion), bass, guitar, piano ──
  for (const { key, ch, nome } of TRACCE_LINEARI) {
    const eventi = trackBuffers[key];
    if (!eventi?.length) continue;
    const tr = writer.addTrack(key === 'drums' ? nomeTracciaDrums(state) : nome);
    const modo = mixerOverride[key] || 'auto';
    if (modo !== 'auto') tr.programChange(0, parseInt(modo), ch);
    for (const e of eventi) {
      if (e.type === 'pc') {
        // A mixer forzato il program change dinamico va ignorato, altrimenti
        // riporterebbe lo strumento a quello scelto dal generatore.
        if (modo === 'auto') tr.programChange(e.tick, e.prog, e.ch);
      } else if (e.cc != null) {
        tr.controlChange(e.tick, e.cc, e.value, ch);
      } else {
        tr.noteOn(e.tick, e.note, e.velocity, ch);
        tr.noteOff(e.tick + e.duration, e.note, ch);
      }
    }
  }

  // ── Ensemble: tre tracce separate, ognuna col suo canale e programma ──
  const ensMode = mixerOverride['ensemble'] || 'auto';
  for (const key of ['e0', 'e1', 'e2']) {
    const ens = trackBuffers[key];
    if (!ens?.evts?.length) continue;
    const et = writer.addTrack(ens.name ?? `Ensemble ${key}`);
    if (ensMode !== 'auto') et.programChange(0, parseInt(ensMode), ens.ch);
    for (const pc of ens.progChanges ?? []) {
      if (ensMode === 'auto') et.programChange(pc.tick, pc.prog, pc.ch);
    }
    for (const e of ens.evts) {
      et.noteOn(e.tick, e.note, e.velocity, ens.ch);
      et.noteOff(e.tick + e.duration, e.note, ens.ch);
    }
  }

  return writer;
}

/**
 * Costruisce il MIDI di Solo Mode: un brano per un solo strumento, su una o
 * più tracce (l'ensemble ne usa tre).
 * @param {object} state     — SessionManager.getState()
 * @param {Array}  sezioni   — SessionManager.getSections(), per i marker
 * @param {Array}  tracks    — [{ channel, program, events }]
 * @param {object} [opts]
 * @param {number} [opts.ppq]
 * @param {string} [opts.etichetta] — nome dello strumento per le tracce
 * @returns {MidiWriter}
 */
export function buildSoloMidi(state, sezioni, tracks, { ppq = 480, etichetta = 'Solo' } = {}) {
  const barTicks = ppq * 4;
  const writer = new MidiWriter(ppq);
  writer.setTempo(state.bpm);
  writer.setTimeSignature(4, 4);
  writeKeySignature(writer, state.key);

  let globalTick = 0;
  for (const sec of sezioni) {
    writer.addMarker(globalTick, sec.label);
    globalTick += sec.bars * barTicks;
  }

  tracks.forEach((t, i) => {
    const tr = writer.addTrack(tracks.length > 1 ? `${etichetta} ${i + 1}` : etichetta);
    if (t.program != null) tr.programChange(0, t.program, t.channel);
    for (const e of t.events) {
      if (e.cc != null) tr.controlChange(e.tick, e.cc, e.value, t.channel);
      else {
        tr.noteOn(e.tick, e.note, e.velocity, t.channel);
        tr.noteOff(e.tick + e.duration, e.note, t.channel);
      }
    }
  });

  return writer;
}
