/**
 * ChordGenerator.js — Traccia chord fissa (sempre generata)
 * ─────────────────────────────────────────────────────────────────
 * Emette block-chord per ogni regione armonica del blueprint.
 * Non dipende dai moduli attivi: è sempre presente nel MIDI export.
 * Canale 4, Program 49 (String Ensemble 2) — pad di riferimento armonico.
 *
 * A3 di PLAN37 — per un periodo questa riga è stata falsa: il pad usciva solo
 * dal percorso Classic, mentre `assembleSessionEvents` (Session Mode, cioè il
 * percorso pubblicato) montava solo drums/bass/guitar/piano/ensemble. Il
 * committente ha deciso che il pad è vivo — «è una traccia utile non al suono,
 * al mood» — quindi rientra nell'export di sessione come strato d'atmosfera, a
 * volume basso (CC 7 ridotto sul canale 4, oltre alle velocity già contenute
 * di questo generatore). Da lì viene anche il voice leading qui sotto: anche
 * piano, un pad che salta da un accordo al successivo si sente.
 */

export function generateChords(blueprint) {
  const { sections } = blueprint;
  const events = [];
  // Voicing precedente: il pad tiene la continuità fra un accordo e il
  // successivo, anche attraverso il confine fra due sezioni.
  let prevVoicing = null;

  for (const section of sections) {
    const hmap = section.harmonicMap ?? [];

    // Velocity legata all'energia della sezione — prima era fissa a 18 sempre,
    // identica su intro e climax. Resta un pad di riferimento quieto e pulito
    // (nessun cambio di ritmo/voicing, solo un respiro dinamico coerente col
    // resto dell'arrangiamento): range volutamente contenuto 12–30.
    const energy = section.energy ?? 5;
    const velocity = Math.round(12 + (Math.max(0, Math.min(10, energy)) / 10) * 18);

    for (const region of hmap) {
      const voicing = _selectVoicing(region, prevVoicing);
      if (!voicing.length) continue;
      prevVoicing = voicing;

      // Durata = tutta la regione meno un piccolo gap per leggibilità DAW
      const dur = Math.max(1, region.end_tick - region.start_tick - 10);

      for (const note of voicing) {
        events.push({
          tick:     region.start_tick,
          note,
          velocity,
          duration: dur,
        });
      }
    }
  }

  return { events, program: 49 };  // String Ensemble 2
}

// ── Selezione voicing ─────────────────────────────────────────────
// Prende max 4 note dell'accordo (una per pitch class) nel range
// E3–E5 (MIDI 52–76) per un close voicing in registro medio.
//
// A3 — prima si prendevano sempre le più gravi disponibili, cioè si riassegnava
// il voicing da zero a ogni regione: fra un accordo e il successivo le voci
// saltavano senza motivo. Ora, quando c'è un accordo prima, fra le posizioni
// possibili si sceglie quella che muove meno le voci.
//
// L'idea viene da `_buildRhVoicing` in PianoGenerator, ma il costo qui è
// diverso e la differenza è tutta la voce: il piano somma, per ogni voce
// precedente, la distanza dalla nota PIÙ VICINA del nuovo accordo — una misura
// che un accordo qualsiasi soddisfa quasi sempre. Misurato sul pad (13 stili x
// 4 seed, 5.958 accordi) quel costo sposta il 7,6% dei voicing e non migliora
// niente: movimento medio per voce 0,681 → 0,678. Appaiando invece le voci per
// posizione (grave con grave, acuta con acuta), che è come si muovono davvero:
//
//   movimento medio per voce      0,681 → 0,558  (-18%)
//   passaggi con salto >= 3 semitoni  224 → 44   (-80%)
//   voicing con un cluster di semitono 392 → 342 (-13%)
//   ampiezza media del voicing     8,0 → 8,1 semitoni (invariata)
//
// Il costo del piano resta com'è: cambiarlo cambierebbe il suono del piano su
// tutti gli stili, e non è questa la voce del piano che lo chiede. Segnalato
// in PLAN37.
const PAD_LO = 52;  // E3
const PAD_HI = 76;  // E5

function _selectVoicing(region, prevVoicing = null) {
  const pool = (region.chord_tones ?? [])
    .filter(n => n >= PAD_LO && n <= PAD_HI)
    .sort((a, b) => a - b);
  if (!pool.length) return [];

  // Tutte le posizioni possibili dell'accordo nel registro: da ogni nota del
  // pool si sale prendendo pitch class ancora non usate, come faceva la
  // versione precedente partendo però solo dalla più grave.
  const posizioni = [];
  for (let i = 0; i < pool.length; i++) {
    const voicing = [];
    const seenPc  = new Set();
    for (let j = i; j < pool.length && voicing.length < 4; j++) {
      const pc = pool[j] % 12;
      if (seenPc.has(pc)) continue;
      seenPc.add(pc);
      voicing.push(pool[j]);
    }
    if (voicing.length) posizioni.push(voicing);
  }

  const primo = posizioni[0];
  if (!prevVoicing?.length) return primo;

  // Voice leading: costo = somma delle distanze minime nota-per-nota dal
  // voicing precedente. Le posizioni che perderebbero note dell'accordo
  // (perché il registro finisce) non entrano nel confronto.
  let best = primo, bestCost = Infinity;
  for (const v of posizioni) {
    if (v.length < primo.length) continue;
    const n = Math.min(v.length, prevVoicing.length);
    let cost = 0;
    for (let k = 0; k < n; k++) cost += Math.abs(v[k] - prevVoicing[k]);
    if (cost < bestCost) { bestCost = cost; best = v; }
  }
  return best;
}
