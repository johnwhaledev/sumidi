import { describe, it, expect } from 'vitest';
import { applyGrooveLock } from '../src/GrooveLock.js';
import { makeRng } from '../src/SongArchitect.js';

// T1 di PLAN37 — GrooveLock.js non aveva un solo test, ed è il modulo dove è
// nato il bug B4 di agosto (il basso che swingava il 50-65% più degli altri
// strumenti, audit timing metrica 1). Il fix del 2026-08-26 — agganciare solo
// gli step 0 e 8 esatti invece di tutta la finestra larga un quarto — è quindi
// rimasto senza rete per una settimana. Questi test la tendono.

const PPQ       = 480;
const BAR_TICKS = PPQ * 4;
const S16       = PPQ / 4;
const META      = { ppq: PPQ, bpm: 120, barTicks: BAR_TICKS };

/** Kick su beat 1 e beat 3, gli unici due ancoraggi che GrooveLock conosce. */
function drumsConKick() {
  return [
    { tick: 0,             note: 36, velocity: 100, duration: 60 },
    { tick: BAR_TICKS / 2, note: 36, velocity: 100, duration: 60 },
  ];
}

const nota = (tick, note) => ({ tick, note, velocity: 90, duration: 200 });

describe('GrooveLock — pocket offset (T1)', () => {
  it('aggancia al kick le note di basso sulla battuta 1 e sulla battuta 3', () => {
    const tracce = {
      drums: drumsConKick(),
      bass:  [nota(0, 40), nota(BAR_TICKS / 2, 45)],
    };
    applyGrooveLock(tracce, META, makeRng(1));

    // Offset dichiarato: 12-20ms su beat 1, 8-15ms su beat 3, ±3 tick di
    // jitter. A 120 bpm un ms vale 0,96 tick, quindi lo spostamento sta fra
    // ~8 e ~23 tick: si verifica che la nota si sia mossa in avanti, non il
    // numero esatto, che dipende dal rng.
    expect(tracce.bass[0].tick).toBeGreaterThan(0);
    expect(tracce.bass[0].tick).toBeLessThan(S16);
    expect(tracce.bass[1].tick).toBeGreaterThan(BAR_TICKS / 2);
    expect(tracce.bass[1].tick).toBeLessThan(BAR_TICKS / 2 + S16);
  });

  it('NON tocca le note su un sedicesimo dispari già ritardate dallo swing (regressione B4)', () => {
    // È il difetto costato l'audit timing: la finestra di match larga un
    // quarto catturava anche gli upbeat swingati e ne sovrascriveva il tick
    // con anchorTick+offset, buttando via lo swing invece di rispettarlo.
    const tickSwingato = S16 + 30;
    const tracce = {
      drums: drumsConKick(),
      bass:  [nota(tickSwingato, 40)],
    };
    applyGrooveLock(tracce, META, makeRng(1));

    expect(tracce.bass[0].tick).toBe(tickSwingato);
  });

  it('non tocca gli eventi di automazione (CC)', () => {
    const tracce = {
      drums: drumsConKick(),
      piano: [{ tick: 0, cc: 64, value: 127 }],
    };
    applyGrooveLock(tracce, META, makeRng(1));

    expect(tracce.piano[0].tick).toBe(0);
  });

  it('senza batteria non sposta niente: il kick è l’unico ancoraggio', () => {
    const tracce = { drums: [], bass: [nota(0, 40)] };
    applyGrooveLock(tracce, META, makeRng(1));

    expect(tracce.bass[0].tick).toBe(0);
  });

  it('sulla chitarra muove solo le corde basse, non il registro acuto', () => {
    const tracce = {
      drums:  drumsConKick(),
      guitar: [nota(0, 64), nota(0, 45)],
    };
    applyGrooveLock(tracce, META, makeRng(1));

    expect(tracce.guitar[0].tick).toBe(0);          // 64 = E4, resta sulla griglia
    expect(tracce.guitar[1].tick).toBeGreaterThan(0); // 45 = A2, segue il kick
  });

  it('è deterministico: stesso seed, stessi tick', () => {
    const costruisci = () => ({
      drums: drumsConKick(),
      bass:  [nota(0, 40), nota(BAR_TICKS / 2, 45)],
    });
    const a = costruisci();
    const b = costruisci();
    applyGrooveLock(a, META, makeRng(7));
    applyGrooveLock(b, META, makeRng(7));

    expect(a.bass.map(e => e.tick)).toEqual(b.bass.map(e => e.tick));
  });

  // ── Comportamento documentato, non approvato ──────────────────────
  it('sul piano la soglia effettiva è 57, non il 60 dichiarato dal commento', () => {
    // SEGNALATO, NON CORRETTO (v. PLAN37, "Segnalato durante T1").
    // `bass_string_only` filtra `note >= 57` ed è condiviso con la chitarra,
    // dove 57 è la soglia giusta; il commento nella chiamata per il piano dice
    // però "solo note sotto C4 (60) = LH". Da quando O2 ha alzato LH_HI da 57
    // a 60, la mano sinistra arriva davvero fino al DO4: le note 57, 58 e 59
    // sono mano sinistra a tutti gli effetti e non ricevono il pocket offset.
    // Allineare la soglia cambierebbe il timing del piano su ogni brano,
    // quindi la decisione è del committente. Questo test fotografa il
    // comportamento di oggi: se un giorno la soglia si allinea, va aggiornato.
    const tracce = {
      drums: drumsConKick(),
      piano: [nota(0, 58), nota(0, 50)],
    };
    applyGrooveLock(tracce, META, makeRng(1));

    expect(tracce.piano[0].tick).toBe(0);            // 58 = Sib3, ignorata
    expect(tracce.piano[1].tick).toBeGreaterThan(0); // 50 = Re3, agganciata
  });
});
