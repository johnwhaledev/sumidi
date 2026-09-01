import { describe, it, expect } from 'vitest';
import { PROGRESSIONI, POOL_INDICE } from '../src/ProgressioniGradi.js';
import { PROGRESSION_POOLS, PROG_FAMILY_REF_PC } from '../src/SongProgressions.js';
import { parseChord, CHORD_INTERVALS } from '../src/SongArchitect.js';
import { STYLES } from '../src/Styles.js';

// D2 di PLAN37 — il validatore dei dati. Ora che le progressioni sono dati
// dichiarativi (D1) e non piu' codice scritto a mano, quello che prima si
// poteva solo rileggere si puo' controllare: gradi che esistono, durate che
// tornano, niente doppioni, ogni pool abbastanza pieno da avere varieta'.
// Sono i controlli che avrebbero preso il "punk stonato" del 20 agosto prima
// che arrivasse all'orecchio.

const TIPI = ['intro', 'verse', 'chorus', 'bridge', 'outro'];
const records = Object.entries(PROGRESSIONI);

describe('ProgressioniGradi — i record', () => {

  it('ci sono, e nessuno è orfano', () => {
    expect(records.length).toBeGreaterThan(500);
    const usati = new Set(Object.values(POOL_INDICE).flat());
    const orfani = records.filter(([id]) => !usati.has(id)).map(([id]) => id);
    expect(orfani, 'record che nessun pool usa: peso morto scaricato da tutti').toEqual([]);
  });

  it('ogni id elencato in un pool esiste davvero', () => {
    for (const [pool, ids] of Object.entries(POOL_INDICE)) {
      for (const id of ids) {
        expect(PROGRESSIONI[id], `${pool} elenca "${id}", che non esiste`).toBeTruthy();
      }
    }
  });

  it('i gradi sono semitoni validi e le sigle sono parsabili', () => {
    for (const [id, rec] of records) {
      expect(rec.gradi.length, `${id}: progressione vuota`).toBeGreaterThan(0);
      for (const [grado, sigla] of rec.gradi) {
        expect(Number.isInteger(grado) && grado >= 0 && grado <= 11,
          `${id}: grado ${grado} fuori dall'ottava`).toBe(true);
        expect(parseChord(`C${sigla}`), `${id}: sigla "${sigla}" non parsabile`).toBeTruthy();
      }
    }
  });

  it('le sigle senza una qualità nota sono esattamente le tre già trovate', () => {
    // Trovate da questo stesso test appena scritto (D2, voce B11 di PLAN37):
    // `m9`, `m11` e `13` non stanno in CHORD_INTERVALS e non hanno un alias in
    // parseChord, quindi ricadono su 'maj' — cioè un LAm9 scritto nei dati esce
    // come LA MAGGIORE, terza maggiore al posto della minore. Misurate 392
    // regioni armoniche su 23.824 (1,6%), tutte in neo_soul e lo_fi.
    // Correggerlo è un alias per riga, ma cambia il suono di quei due stili:
    // decide il committente. Qui si sorveglia solo che non ne nascano altre.
    const senzaQualita = new Set();
    for (const [, rec] of records) {
      for (const [, sigla] of rec.gradi) {
        const parsed = parseChord(`C${sigla}`);
        if (!CHORD_INTERVALS[parsed.quality]) senzaQualita.add(sigla);
      }
    }
    expect([...senzaQualita].sort()).toEqual(['13', 'm11', 'm9']);
  });

  it('le durate sono battute intere e la progressione dura 4 o 8 battute', () => {
    for (const [id, rec] of records) {
      const durate = rec.durate ?? rec.gradi.map(() => 1);
      expect(durate.length, `${id}: durate e gradi non combaciano`).toBe(rec.gradi.length);
      for (const d of durate) {
        expect(Number.isInteger(d) && d > 0, `${id}: durata ${d}`).toBe(true);
      }
      const battute = durate.reduce((a, b) => a + b, 0);
      expect([4, 8], `${id}: dura ${battute} battute`).toContain(battute);
    }
  });

  it('il modo del record combacia con il pool che lo elenca', () => {
    for (const [pool, ids] of Object.entries(POOL_INDICE)) {
      const atteso = pool.endsWith('_minor') ? 'minore' : 'maggiore';
      for (const id of ids) {
        expect(PROGRESSIONI[id].modo, `${pool} elenca ${id}, che è ${PROGRESSIONI[id].modo}`).toBe(atteso);
      }
    }
  });

});

describe('ProgressioniGradi — i pool', () => {

  it('ogni pool ha almeno tre progressioni fra cui pescare', () => {
    for (const [pool, ids] of Object.entries(POOL_INDICE)) {
      expect(ids.length, `${pool} ne ha ${ids.length}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('nessun pool elenca due volte la stessa progressione, tranne quella nota', () => {
    // Un doppione dentro il pool riduce la varietà senza che si veda: il
    // meccanismo "non ripetere l'ultima" può ripescare la gemella e suonare
    // uguale. folk_intro ha `C F C G` due volte su dieci (indici 2 e 8):
    // toglierlo cambia quale progressione esce a ogni seed, quindi è una
    // modifica da fare all'ascolto (PLAN37, voce D4). Questo test non la sana:
    // impedisce che ne nascano altri.
    const noti = new Set(['folk_intro:p002']);
    const doppioni = [];
    for (const [pool, ids] of Object.entries(POOL_INDICE)) {
      const visti = new Set();
      for (const id of ids) {
        if (visti.has(id) && !noti.has(`${pool}:${id}`)) doppioni.push(`${pool}:${id}`);
        visti.add(id);
      }
    }
    expect(doppioni).toEqual([]);
  });

  it('ogni stile ha un pool per tutti e cinque i tipi di sezione', () => {
    for (const style of Object.keys(STYLES)) {
      const famiglia = STYLES[style].progressionFamily ?? style;
      for (const tipo of TIPI) {
        expect(POOL_INDICE[`${famiglia}_${tipo}`],
          `manca ${famiglia}_${tipo} (stile ${style})`).toBeTruthy();
      }
    }
  });

  it('le famiglie con una tonica di riferimento dichiarata esistono', () => {
    const famiglie = new Set(Object.keys(POOL_INDICE).map(k => k.replace(/_(minor)$/, '').replace(/_(intro|verse|chorus|bridge|outro)$/, '')));
    for (const famiglia of Object.keys(PROG_FAMILY_REF_PC)) {
      expect(famiglie.has(famiglia), `PROG_FAMILY_REF_PC dichiara "${famiglia}", che non ha pool`).toBe(true);
    }
  });

});

describe('PROGRESSION_POOLS — la forma ricostruita è quella di sempre', () => {

  it('ogni voce è una stringa, o una coppia [accordo, battute]', () => {
    for (const [pool, progs] of Object.entries(PROGRESSION_POOLS)) {
      for (const prog of progs) {
        expect(Array.isArray(prog), `${pool}: progressione non è un array`).toBe(true);
        for (const voce of prog) {
          if (Array.isArray(voce)) {
            expect(typeof voce[0]).toBe('string');
            expect(Number.isInteger(voce[1]) && voce[1] > 1, `${pool}: durata ${voce[1]} scritta come coppia`).toBe(true);
          } else {
            expect(typeof voce, `${pool}: voce di tipo ${typeof voce}`).toBe('string');
          }
        }
      }
    }
  });

  it('ogni accordo ricostruito è suonabile', () => {
    for (const [pool, progs] of Object.entries(PROGRESSION_POOLS)) {
      for (const prog of progs) {
        for (const voce of prog) {
          const nome = Array.isArray(voce) ? voce[0] : voce;
          expect(parseChord(nome), `${pool}: "${nome}" non è un accordo`).toBeTruthy();
        }
      }
    }
  });

  it('i pool hanno le stesse chiavi dell’indice, e nello stesso numero', () => {
    expect(Object.keys(PROGRESSION_POOLS).sort()).toEqual(Object.keys(POOL_INDICE).sort());
    for (const [pool, ids] of Object.entries(POOL_INDICE)) {
      expect(PROGRESSION_POOLS[pool].length, pool).toBe(ids.length);
    }
  });

});
