import { describe, it, expect } from 'vitest';
import { generateDrumMachine, DM_PRESETS, DM_NOTES, DM_CHANNELS } from '../src/DrumMachineGenerator.js';

// T1 di PLAN37 — DrumMachineGenerator.js era fra i dieci moduli senza test.
// È lo step sequencer che sta dietro i personaggi TR-8, LO-1, E-909 e PXL-8:
// deterministico per design, quindi facile da sorvegliare per intero.

const PPQ       = 480;
const BAR_TICKS = PPQ * 4;
const S16       = PPQ / 4;

/** Blueprint minimo: due battute, energia media. */
function blueprint({ bars = 2, energy = 5 } = {}) {
  return {
    meta:     { ppq: PPQ, barTicks: BAR_TICKS, bpm: 120 },
    sections: [{ startTick: 0, endTick: BAR_TICKS * bars, bars, energy }],
  };
}

describe('DrumMachineGenerator — griglia a 16 step (T1)', () => {
  it('i preset e la griglia UI parlano degli stessi canali', () => {
    // Le due tabelle sono scritte a mano una accanto all'altra: se un preset
    // guadagna un canale che DM_CHANNELS non elenca, quel canale suona ma non
    // è disegnato, e nessuno se ne accorge. È la forma di bug che la nota di
    // metodo di PLAN37 indica come la più costosa del progetto.
    const canaliUI = DM_CHANNELS.map(([id]) => id);
    expect(canaliUI).toEqual(Object.keys(DM_NOTES));

    for (const [nome, preset] of Object.entries(DM_PRESETS)) {
      for (const canale of Object.keys(preset)) {
        if (canale === 'swing' || canale === 'swingOn16ths') continue;
        expect(canaliUI, `${nome} usa un canale che la griglia non mostra: ${canale}`).toContain(canale);
        expect(preset[canale].length, `${nome}.${canale} non ha 16 step`).toBe(16);
      }
    }
  });

  it('genera eventi sul kick alle posizioni dichiarate dal preset', () => {
    const eventi = generateDrumMachine(blueprint({ bars: 1 }), { dmPreset: 'electro' });
    const kick   = eventi.filter(e => e.note === DM_NOTES.kick).map(e => e.tick);

    // electro: kick sui quattro quarti (step 0, 4, 8, 12).
    expect(kick).toEqual([0, 4 * S16, 8 * S16, 12 * S16]);
  });

  it('uno step a velocity 0 non produce nessuna nota', () => {
    const vuoto = { kick: new Array(16).fill(0), swing: 0 };
    expect(generateDrumMachine(blueprint(), { dmPattern: vuoto })).toHaveLength(0);
  });

  it('l’energia della sezione scala la velocity, il pattern resta identico', () => {
    const piano = generateDrumMachine(blueprint({ energy: 0 }),  { dmPreset: 'electro' });
    const forte = generateDrumMachine(blueprint({ energy: 10 }), { dmPreset: 'electro' });

    expect(piano.map(e => e.tick)).toEqual(forte.map(e => e.tick));
    expect(forte[0].velocity).toBeGreaterThan(piano[0].velocity);
    for (const e of [...piano, ...forte]) {
      expect(e.velocity).toBeGreaterThanOrEqual(1);
      expect(e.velocity).toBeLessThanOrEqual(127);
    }
  });

  it('lo swing ritarda gli ottavi o i sedicesimi a seconda del preset', () => {
    const dritto = generateDrumMachine(blueprint({ bars: 1 }), {
      dmPattern: { hh_c: new Array(16).fill(70) }, dmSwing: 0,
    });
    const su16 = generateDrumMachine(blueprint({ bars: 1 }), {
      dmPattern: { hh_c: new Array(16).fill(70) }, dmSwing: 0.5, dmSwingOn16ths: true,
    });
    const su8 = generateDrumMachine(blueprint({ bars: 1 }), {
      dmPattern: { hh_c: new Array(16).fill(70) }, dmSwing: 0.5, dmSwingOn16ths: false,
    });

    // Sui sedicesimi si muovono gli step dispari; sugli ottavi solo gli "and"
    // (step 2, 6, 10, 14). Il conteggio distingue le due modalità.
    const mossi = lista => lista.filter((e, i) => e.tick !== dritto[i].tick).length;
    expect(mossi(su16)).toBe(8);
    expect(mossi(su8)).toBe(4);
  });

  it('non scrive note oltre la fine della sezione', () => {
    const bp = blueprint({ bars: 3 });
    for (const e of generateDrumMachine(bp, { dmPreset: 'trap' })) {
      expect(e.tick).toBeLessThan(bp.sections[0].endTick);
    }
  });

  it('un preset sconosciuto ricade su trap invece di produrre il silenzio', () => {
    const ignoto = generateDrumMachine(blueprint(), { dmPreset: 'non_esiste' });
    const trap   = generateDrumMachine(blueprint(), { dmPreset: 'trap' });

    expect(ignoto).toEqual(trap);
    expect(ignoto.length).toBeGreaterThan(0);
  });

  it('un pattern disegnato a mano vince sul preset', () => {
    const soloKick = { kick: [100, ...new Array(15).fill(0)], swing: 0 };
    const eventi   = generateDrumMachine(blueprint({ bars: 1 }), { dmPreset: 'trap', dmPattern: soloKick });

    expect(eventi).toHaveLength(1);
    expect(eventi[0].note).toBe(DM_NOTES.kick);
  });
});
