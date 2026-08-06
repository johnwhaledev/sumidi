import { describe, it, expect } from 'vitest';
import { SessionManager } from '../src/SessionManager.js';

// Bug segnalato dall'utente: "il tasto ultima modifica elimina le sezioni
// se non ho fatto modifiche?" — una rigenerazione completa (⚡ Genera)
// smontava le sezioni una per una con removeSection()/setSectionProgression(),
// ognuna delle quali salvava il proprio snapshot di undo. Una singola
// rigenerazione con N sezioni riempiva la cronologia con 2N stati
// intermedi del rebuild; cliccare "↩ Annulla" subito dopo un Genera
// restituiva uno di questi stati a metà smontaggio invece del brano
// precedente, sembrando cancellare sezioni senza motivo.
//
// Fix: replaceAllSections() sostituisce l'intero arrangiamento salvando
// UN SOLO snapshot per l'intera operazione.

describe('replaceAllSections — un solo snapshot di undo per rigenerazione completa', () => {
  function buildSpecs(n, labelPrefix = 'v') {
    return Array.from({ length: n }, (_, i) => ({
      type: 'verse',
      bars: 4,
      seed: 1000 + i,
      progression: [`${labelPrefix}${i}-C`, `${labelPrefix}${i}-G`],
    }));
  }

  it('una rigenerazione con N sezioni salva esattamente 1 snapshot, non 2N', () => {
    const mgr = new SessionManager({ key: 'Am', bpm: 90, style: 'unplugged' });
    mgr.replaceAllSections(buildSpecs(9, 'a'));
    expect(mgr.canUndo()).toBe(true);
    expect(mgr._history.length).toBe(1);
  });

  it('annullare subito dopo una rigenerazione restituisce il brano precedente per intero, non uno stato a metà smontaggio', () => {
    const mgr = new SessionManager({ key: 'Am', bpm: 90, style: 'unplugged' });
    mgr.replaceAllSections(buildSpecs(5, 'old'));
    const before = mgr.getSections().map(s => s.id);
    expect(before.length).toBe(5);

    // Rigenerazione successiva (nuovo stile/seed, tipico di un secondo "Genera")
    mgr.replaceAllSections(buildSpecs(9, 'new'));
    expect(mgr.getSections().length).toBe(9);

    // Un solo "↩ Annulla" deve restituire ESATTAMENTE le 5 sezioni precedenti,
    // non uno stato intermedio con un numero di sezioni a caso.
    mgr.undo();
    const after = mgr.getSections();
    expect(after.length).toBe(5);
    expect(after.map(s => s.id)).toEqual(before);
    expect(after.every(s => s.progression[0].startsWith('old'))).toBe(true);
  });

  it('rigenerare ripetutamente senza mai modificare manualmente nulla non svuota le sezioni con un click su Annulla', () => {
    const mgr = new SessionManager({ key: 'Am', bpm: 90, style: 'unplugged' });
    // 3 rigenerazioni consecutive (come premere più volte "⚡ Genera")
    mgr.replaceAllSections(buildSpecs(4, 'r1'));
    mgr.replaceAllSections(buildSpecs(6, 'r2'));
    mgr.replaceAllSections(buildSpecs(8, 'r3'));
    expect(mgr.getSections().length).toBe(8);

    mgr.undo();
    // Deve tornare al risultato della rigenerazione precedente (6 sezioni),
    // non a una cancellazione parziale imprevedibile.
    expect(mgr.getSections().length).toBe(6);
    expect(mgr.getSections().every(s => s.progression[0].startsWith('r2'))).toBe(true);
  });

  it('la cronologia resta cappata a 10 snapshot anche con molte rigenerazioni consecutive', () => {
    const mgr = new SessionManager({ key: 'Am', bpm: 90, style: 'unplugged' });
    for (let i = 0; i < 15; i++) {
      mgr.replaceAllSections(buildSpecs(3, `gen${i}`));
    }
    expect(mgr._history.length).toBe(10);
  });
});
