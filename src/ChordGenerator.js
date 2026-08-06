/**
 * ChordGenerator.js — Traccia chord fissa (sempre generata)
 * ─────────────────────────────────────────────────────────────────
 * Emette block-chord per ogni regione armonica del blueprint.
 * Non dipende dai moduli attivi: è sempre presente nel MIDI export.
 * Canale 4, Program 49 (String Ensemble 2) — pad di riferimento armonico.
 */

export function generateChords(blueprint) {
  const { sections } = blueprint;
  const events = [];

  for (const section of sections) {
    const hmap = section.harmonicMap ?? [];

    // Velocity legata all'energia della sezione — prima era fissa a 18 sempre,
    // identica su intro e climax. Resta un pad di riferimento quieto e pulito
    // (nessun cambio di ritmo/voicing, solo un respiro dinamico coerente col
    // resto dell'arrangiamento): range volutamente contenuto 12–30.
    const energy = section.energy ?? 5;
    const velocity = Math.round(12 + (Math.max(0, Math.min(10, energy)) / 10) * 18);

    for (const region of hmap) {
      const voicing = _selectVoicing(region);
      if (!voicing.length) continue;

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
function _selectVoicing(region) {
  const pool    = (region.chord_tones ?? []).slice().sort((a, b) => a - b);
  const voicing = [];
  const seenPc  = new Set();

  for (const n of pool) {
    if (n < 52 || n > 76) continue;
    const pc = n % 12;
    if (seenPc.has(pc)) continue;
    seenPc.add(pc);
    voicing.push(n);
    if (voicing.length >= 4) break;
  }

  return voicing;
}
