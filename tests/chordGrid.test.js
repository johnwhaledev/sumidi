import { describe, it, expect } from 'vitest';
import { analizzaGriglia, MAX_BATTUTE } from '../src/ChordGrid.js';
import { accordiPerFinestra, etichettePerBattuta } from '../src/ChordTheory.js';
import { SessionManager, buildSectionBlueprint } from '../src/SessionManager.js';

// A4 di PLAN37 — la griglia di accordi incollata a mano. È il secondo caso
// d'uso del programma ("accompagnami sui MIEI accordi") e il primo consumatore
// vero delle mezze battute aperte da A1. Un testo incollato arriva sporco per
// definizione: qui si controlla che quello che entra sia esattamente quello che
// si sente, e che quello che non si capisce dica dove guardare.

describe('analizzaGriglia — quello che entra', () => {

  it('legge la griglia con le barre', () => {
    const r = analizzaGriglia('| Am7 | D7 | Gmaj7 | Cmaj7 |');
    expect(r.ok).toBe(true);
    expect(r.battute).toBe(4);
    expect(r.progressione).toEqual([['Am7', 1], ['D7', 1], ['Gmaj7', 1], ['Cmaj7', 1]]);
  });

  it('le barre a inizio e fine riga sono facoltative', () => {
    expect(analizzaGriglia('Am7 | D7').progressione).toEqual([['Am7', 1], ['D7', 1]]);
  });

  it('più righe sono solo un modo di andare a capo', () => {
    const r = analizzaGriglia('| Am | F |\n| C | G |');
    expect(r.battute).toBe(4);
    expect(r.anteprima).toEqual(['Am', 'F', 'C', 'G']);
  });

  it('senza barre vale una battuta per accordo', () => {
    const r = analizzaGriglia('Am F C G');
    expect(r.battute).toBe(4);
    expect(r.anteprima).toEqual(['Am', 'F', 'C', 'G']);
  });

  it('% ripete la battuta precedente, anche due volte', () => {
    const r = analizzaGriglia('| Am7 | % | % | D7 |');
    expect(r.battute).toBe(4);
    expect(r.anteprima).toEqual(['Am7', 'Am7', 'Am7', 'D7']);
    // Battute uguali di fila si fondono: è la forma compatta del motore.
    expect(r.progressione).toEqual([['Am7', 3], ['D7', 1]]);
  });

  it('due accordi in una battuta prendono mezza battuta ciascuno (A1)', () => {
    const r = analizzaGriglia('| Dm7 G7 | Cmaj7 |');
    expect(r.battute).toBe(2);
    expect(r.progressione).toEqual([['Dm7', 0.5], ['G7', 0.5], ['Cmaj7', 1]]);
  });

  it('accetta slash chord ed estensioni, come il resto del motore', () => {
    const r = analizzaGriglia('| C/E | F#m7b5 | Bb7 | Dsus4 |');
    expect(r.ok).toBe(true);
    expect(r.anteprima).toEqual(['C/E', 'F#m7b5', 'Bb7', 'Dsus4']);
  });

});

describe('analizzaGriglia — quello che non si capisce', () => {

  it('un accordo inventato dice quale e dove', () => {
    const r = analizzaGriglia('| Am | Hm |');
    expect(r.ok).toBe(false);
    expect(r.battuta).toBe(2);
    expect(r.errore).toContain('Hm');
  });

  it('una sigla che non esiste non passa per un accordo maggiore', () => {
    // parseChord da solo ricadrebbe su 'maj' senza dire niente.
    const r = analizzaGriglia('| Am7x |');
    expect(r.ok).toBe(false);
    expect(r.errore).toContain('Am7x');
  });

  it('una battuta vuota non viene ingoiata', () => {
    const r = analizzaGriglia('| Am | | C |');
    expect(r.ok).toBe(false);
    expect(r.battuta).toBe(2);
  });

  it('% come prima battuta non ha niente da ripetere', () => {
    expect(analizzaGriglia('| % | Am |').ok).toBe(false);
  });

  it('tre accordi in una battuta non ci stanno', () => {
    const r = analizzaGriglia('| Dm7 G7 C7 |');
    expect(r.ok).toBe(false);
    expect(r.errore).toContain('massimo');
  });

  it('una griglia infinita viene fermata', () => {
    const r = analizzaGriglia(Array.from({ length: MAX_BATTUTE + 5 }, () => 'Am').join(' | '));
    expect(r.ok).toBe(false);
    expect(r.errore).toContain('Troppe battute');
  });

  it('testo vuoto o solo spazi non è un errore da capire, è niente', () => {
    expect(analizzaGriglia('').ok).toBe(false);
    expect(analizzaGriglia('   \n  ').ok).toBe(false);
    expect(analizzaGriglia(null).ok).toBe(false);
  });

});

describe('dalla griglia al brano', () => {

  it('la progressione entra nella sezione e si sente per intero', () => {
    const r = analizzaGriglia('| Dm7 G7 | Cmaj7 | Am7 | % |');
    const mgr = new SessionManager({ key: 'C', bpm: 90, style: 'jazz_ballad' });
    const sec = mgr.addSection('verse', { seed: 4242 });
    mgr.setSectionBars(sec.id, r.battute);
    mgr.setSectionProgression(sec.id, r.progressione);

    const bp = buildSectionBlueprint(mgr.getState(), mgr.getSection(sec.id));
    const accordi = bp.sections[0].harmonicMap.map(x => x.chord);
    // 4 battute x 2 finestre: il ii-V sta dentro la prima battuta.
    expect(accordi).toEqual(['Dm7', 'G7', 'Cmaj7', 'Cmaj7', 'Am7', 'Am7', 'Am7', 'Am7']);
  });

  it('le tre letture della progressione dicono la stessa cosa', () => {
    const { progressione, battute } = analizzaGriglia('| Dm7 G7 | Cmaj7 |');
    expect(accordiPerFinestra(progressione, battute)).toEqual(['Dm7', 'G7', 'Cmaj7', 'Cmaj7']);
    expect(etichettePerBattuta(progressione, battute)).toEqual(['Dm7 G7', 'Cmaj7']);
  });

  it('setSectionBars non accetta numeri che romperebbero il render', () => {
    const mgr = new SessionManager();
    const sec = mgr.addSection('verse');
    expect(mgr.setSectionBars(sec.id, 0)).toBe(false);
    expect(mgr.setSectionBars(sec.id, 2.5)).toBe(false);
    expect(mgr.setSectionBars(sec.id, 999)).toBe(false);
    expect(mgr.setSectionBars('inesistente', 8)).toBe(false);
    expect(mgr.getSection(sec.id).bars).toBe(8);
    expect(mgr.setSectionBars(sec.id, 12)).toBe(true);
    expect(mgr.getSection(sec.id).bars).toBe(12);
  });

});
