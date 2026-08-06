/**
 * DrumMachineGenerator.js — Step Sequencer 16 step
 * ─────────────────────────────────────────────────────────────────
 * Genera pattern ritmici da una griglia 16 step.
 * Ogni step contiene la velocity (0 = silenzio).
 * Nessun humanize (timing deterministico), swing interno opzionale.
 *
 * API pubblica:
 *   generateDrumMachine(blueprint, params) → events[]
 *   DM_PRESETS  — preset patterns esportati per l'UI
 *   DM_CHANNELS — ordine canali per la griglia UI
 */

// ── Note GM (canale 10, ch. 9 zero-indexed) ───────────────────────
export const DM_NOTES = {
  kick:  36,  // Bass Drum 1
  snare: 38,  // Acoustic Snare
  clap:  39,  // Hand Clap
  hh_c:  42,  // Closed Hi-Hat
  hh_o:  46,  // Open Hi-Hat
};

// Canali nell'ordine da mostrare nella griglia UI
export const DM_CHANNELS = [
  ['kick',  'Kick'],
  ['snare', 'Snare'],
  ['clap',  'Clap'],
  ['hh_c',  'HH C'],
  ['hh_o',  'HH O'],
];

// ── Preset patterns ───────────────────────────────────────────────
// Ogni step: 0 = silenzio, 1–127 = velocity
//            step: 0  1  2  3  |  4  5  6  7  |  8  9 10 11 | 12 13 14 15
export const DM_PRESETS = {

  trap: {
    kick:  [100, 0, 0, 0,  0, 0,55, 0, 80, 0, 0,60,  0, 0,70, 0],
    snare: [  0, 0, 0, 0, 80, 0, 0, 0,  0, 0, 0, 0,  85, 0, 0, 0],
    clap:  [  0, 0, 0, 0, 90, 0, 0, 0,  0, 0, 0, 0,  90, 0, 0, 0],
    hh_c:  [ 65,65,65,65, 65,65,65,65, 65,65,65,65,  65,65,65,65],
    hh_o:  [  0, 0, 0, 0,  0, 0, 0,75,  0, 0, 0, 0,   0, 0, 0,80],
    swing: 0,
    swingOn16ths: true,
  },

  lo_fi: {
    kick:  [100, 0, 0, 0,  0, 0, 0, 0, 80, 0, 0, 0,  0,55, 0, 0],
    snare: [  0, 0, 0, 0, 70, 0, 0,45,  0, 0, 0, 0,  80, 0, 0, 0],
    clap:  [  0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0,   0, 0, 0, 0],
    hh_c:  [ 70, 0,60, 0, 70, 0,60, 0, 70, 0,60, 0,  70, 0,60, 0],
    hh_o:  [  0, 0, 0, 0,  0, 0,75, 0,  0, 0, 0, 0,   0, 0,75, 0],
    swing: 0.35,
    swingOn16ths: false,  // swing sugli ottavi (step 2,6,10,14)
  },

  electro: {
    kick:  [100, 0, 0, 0, 100, 0, 0, 0, 100, 0, 0, 0, 100, 0, 0, 0],
    snare: [  0, 0, 0, 0,  85, 0, 0, 0,   0, 0, 0, 0,  85, 0, 0, 0],
    clap:  [  0, 0, 0, 0,   0, 0, 0, 0,   0, 0, 0, 0,   0, 0, 0, 0],
    hh_c:  [ 80, 0,75, 0,  80, 0,75, 0,  80, 0,75, 0,  80, 0,75, 0],
    hh_o:  [  0, 0, 0, 0,   0, 0, 0, 0,   0, 0, 0,85,   0, 0, 0, 0],
    swing: 0,
    swingOn16ths: true,
  },
};

// ═════════════════════════════════════════════════════════════════
export function generateDrumMachine(blueprint, params = {}) {
  const { meta, sections } = blueprint;
  const ppq      = meta.ppq;
  const barTicks = meta.barTicks;
  const s16      = ppq / 4;

  const presetName    = params.dmPreset ?? 'trap';
  const preset        = DM_PRESETS[presetName] ?? DM_PRESETS.trap;
  // Pattern custom (null = usa preset)
  const pattern       = params.dmPattern ?? preset;
  const swing         = params.dmSwing ?? preset.swing ?? 0;
  const swingOn16ths  = params.dmSwingOn16ths ?? preset.swingOn16ths ?? false;

  const events = [];

  for (const section of sections) {
    // Le dinamiche seguono l'energia della sezione — prima il pattern era
    // identico (stessa velocity) su intro/verse/chorus/bridge, indipendente
    // dall'energia dichiarata. Il PATTERN resta deterministico com'è per
    // design dello step-sequencer (anche per i pattern custom disegnati
    // dall'utente in UI) — cambia solo l'intensità complessiva.
    const energy         = section.energy ?? 5;
    const energyVelScale = 0.72 + Math.max(0, Math.min(10, energy)) / 10 * 0.40; // ~0.76 → 1.12

    for (let b = 0; b < section.bars; b++) {
      const barStart = section.startTick + b * barTicks;

      for (const [channel, noteNum] of Object.entries(DM_NOTES)) {
        const steps = pattern[channel];
        if (!steps?.length) continue;

        for (let step = 0; step < 16; step++) {
          const vel = steps[step] ?? 0;
          if (vel === 0) continue;

          let tick = barStart + step * s16;

          // Swing: ritarda gli step dispari (16th) o ogni terzo step di ogni quarto (8th)
          if (swing > 0) {
            const isSwingStep = swingOn16ths
              ? step % 2 === 1                   // tutti i sedicesimi off-beat
              : step % 4 === 2;                  // gli "and" degli ottavi (step 2,6,10,14)
            if (isSwingStep) tick += Math.round(s16 * swing * 0.6);
          }

          if (tick >= section.endTick) continue;

          events.push({
            tick,
            note:     noteNum,
            velocity: Math.max(1, Math.min(127, Math.round(vel * energyVelScale))),
            duration: Math.round(s16 * 0.88),
          });
        }
      }
    }
  }

  return events;
}
