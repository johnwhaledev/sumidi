import { describe, it, expect } from 'vitest';
import { CHORD_INTERVALS, SCALE_INTERVALS, PITCH_CLASS, nomeAccordo, accordiPerBattuta } from '../src/ChordTheory.js';
import { PROGRESSION_POOLS, PROGRESSIONS } from '../src/SongProgressions.js';
import { PROGRESSIONI, POOL_INDICE } from '../src/ProgressioniGradi.js';
import { SONG_FORMS } from '../src/SongForms.js';
import { SECTION_PRESETS } from '../src/SectionPresets.js';
import { STYLES } from '../src/Styles.js';
import { buildSong } from '../src/SongArchitect.js';

// Sessione R1 (PLAN35): verifica che i 5 moduli-dati estratti da
// SongArchitect.js siano importabili in modo indipendente e non vuoti —
// regressione diretta contro un'estrazione fatta a metà o un file corrotto.
describe('Moduli dati estratti da SongArchitect.js (R1)', () => {
  it('ChordTheory.js espone teoria armonica di base', () => {
    expect(Object.keys(CHORD_INTERVALS).length).toBeGreaterThan(0);
    expect(Object.keys(SCALE_INTERVALS).length).toBeGreaterThan(0);
    // Include entrambe le grafie enarmoniche (es. C# e Db), quindi >12 chiavi.
    expect(Object.keys(PITCH_CLASS).length).toBeGreaterThanOrEqual(12);
  });

  it('SongProgressions.js espone i pool di progressioni', () => {
    expect(Object.keys(PROGRESSION_POOLS).length).toBeGreaterThan(0);
    expect(Object.keys(PROGRESSIONS).length).toBe(Object.keys(PROGRESSION_POOLS).length);
  });

  it('SongForms.js espone le forme di canzone', () => {
    expect(Object.keys(SONG_FORMS).length).toBeGreaterThan(0);
  });

  it('SectionPresets.js espone i preset di sezione', () => {
    expect(Object.keys(SECTION_PRESETS).length).toBeGreaterThan(0);
  });

  it('Styles.js espone tutti i 13 generi', () => {
    expect(Object.keys(STYLES).length).toBe(13);
    for (const style of ['punk', 'garage_rock', 'chiptune', 'cinematic']) {
      expect(STYLES[style], `manca STYLES['${style}']`).toBeDefined();
    }
  });
});

// PLAN36 B1 — formato misto delle progressioni: 'Am' (una battuta) oppure
// ['Am7', 2] (due battute). Trattare la coppia come stringa produce "Am7,2"
// negli export; ignorarne la durata disallinea la griglia degli accordi.
describe('Formato delle progressioni (B1)', () => {
  it('nomeAccordo normalizza entrambe le forme', () => {
    expect(nomeAccordo('Am')).toBe('Am');
    expect(nomeAccordo(['Am7', 2])).toBe('Am7');
    // Il difetto che il fix elimina: la coppia stampata come stringa.
    expect(`${['Am7', 2]}`).toBe('Am7,2');
    expect(nomeAccordo(['Am7', 2])).not.toBe('Am7,2');
  });

  it('accordiPerBattuta rispetta le durate e cicla sulla sezione', () => {
    expect(accordiPerBattuta(['Am', 'F', 'C', 'G'], 4)).toEqual(['Am', 'F', 'C', 'G']);
    expect(accordiPerBattuta([['Am7', 2], ['D7', 2]], 4)).toEqual(['Am7', 'Am7', 'D7', 'D7']);
    // Sezione più lunga della progressione: si ricomincia da capo.
    expect(accordiPerBattuta([['Am7', 2], ['D7', 2]], 6)).toEqual(['Am7', 'Am7', 'D7', 'D7', 'Am7', 'Am7']);
    // Casi degeneri: nessuna eccezione, array vuoto.
    expect(accordiPerBattuta([], 4)).toEqual([]);
    expect(accordiPerBattuta(['Am'], 0)).toEqual([]);
  });

  it('concorda con gli accordi che il motore assegna a ogni battuta', () => {
    // Stessa fonte di verità di buildHarmonicMap: se divergessero, ciò che si
    // legge negli export non corrisponderebbe a ciò che si sente.
    for (const stile of ['jazz_ballad', 'blues_rock', 'pop_rock', 'folk']) {
      const bp = buildSong({ style: stile, seed: 77 });
      for (const sec of bp.sections) {
        const attesi = accordiPerBattuta(sec.progression, sec.bars);
        const barTicks = bp.meta.barTicks;
        const dalMotore = sec.harmonicMap
          .filter(r => (r.start_tick - sec.startTick) % barTicks === 0)
          .map(r => r.chord);
        expect(dalMotore, `${stile}/${sec.type}`).toEqual(attesi);
      }
    }
  });
});

// D3 di PLAN37 — la voce chiedeva di togliere i dati morti: 27 progressioni di
// valzer in 5 pool, la forma `unplugged_waltz` e `folk_short`, scaricate da
// ogni visitatore e raggiungibili da nessuno. Tolte il 2026-09-02 su decisione
// del committente. Questi test impediscono che il caso si ripresenti: una
// forma che nessuno stile elenca, o una progressione che nessun pool usa,
// diventa rossa qui invece di restare in giro per mesi.
describe('Dati raggiungibili (D3)', () => {
  /** Le forme che un utente può davvero scegliere, dalla composer bar (A2). */
  const raggiungibili = new Set();
  for (const stile of Object.values(STYLES)) {
    for (const forma of stile.availableForms ?? []) raggiungibili.add(forma);
    if (stile.defaultForm) raggiungibili.add(stile.defaultForm);
  }

  it('ogni forma definita è elencata da almeno uno stile', () => {
    const orfane = Object.keys(SONG_FORMS).filter(f => !raggiungibili.has(f));
    expect(orfane, `forme che nessuno stile espone: ${orfane.join(', ')}`).toEqual([]);
  });

  it('ogni forma elencata da uno stile è definita', () => {
    const fantasma = [...raggiungibili].filter(f => !SONG_FORMS[f]);
    expect(fantasma, `forme elencate ma inesistenti: ${fantasma.join(', ')}`).toEqual([]);
  });

  it('nessuna progressione resta senza un pool che la usi', () => {
    const usate  = new Set(Object.values(POOL_INDICE).flat());
    const orfane = Object.keys(PROGRESSIONI).filter(id => !usate.has(id));
    expect(orfane, `progressioni che nessun pool pesca: ${orfane.join(', ')}`).toEqual([]);
  });

  it('ogni pool pesca solo progressioni che esistono', () => {
    for (const [pool, ids] of Object.entries(POOL_INDICE)) {
      for (const id of ids) {
        expect(PROGRESSIONI[id], `${pool} pesca ${id}, che non esiste`).toBeDefined();
      }
    }
  });
});
