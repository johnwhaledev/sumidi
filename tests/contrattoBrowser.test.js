import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AppState } from '../src/AppState.js';
import { CHARACTER_ROSTER } from '../src/CharacterRoster.js';
import { isReady, stopAll } from '../src/Playback.js';

// T1 di PLAN37 — Session.js (2.828 righe), SongEngine.js (738) e main.js sono
// i tre moduli che il resto della suite non può nemmeno importare: registrano
// i loro handler su `window` al caricamento, quindi in Node esplodono con
// "window is not defined". Sono anche i tre che ESLint non apriva fino a
// `e28b925`, cioè quelli dove un refuso è passato inosservato più a lungo.
//
// Qui non si collauda la loro logica — quella vive nel DOM e la verifica il
// browser. Si sorveglia il **contratto**: ogni funzione che l'HTML chiama in
// un onclick deve esistere davvero dopo il caricamento dei moduli. È la stessa
// forma di bug che la nota di metodo di PLAN37 indica come la più costosa del
// progetto: una verità scritta due volte (nell'HTML e nel modulo) con una
// sincronizzazione fragile in mezzo. Un refuso in un onclick non produce
// nessun errore fino al click dell'utente, e il lint non lo vede.

const RADICE = fileURLToPath(new URL('..', import.meta.url));

/** DOM finto ridotto all'osso: quanto basta a far caricare i due moduli. */
function installaStubDom() {
  const elementoFinto = () => ({
    style: {}, value: '', checked: false, textContent: '', innerHTML: '',
    dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild() {}, setAttribute() {}, addEventListener() {}, querySelector: () => null,
    querySelectorAll: () => [],
  });
  globalThis.window = globalThis;
  globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: elementoFinto,
    addEventListener() {},
    body: { appendChild() {}, classList: { add() {}, remove() {} } },
  };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.location = { href: '', search: '', origin: '', pathname: '' };
  globalThis.history = { replaceState() {} };
  globalThis.alert = () => {};
  if (!globalThis.navigator) {
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: async () => {} } }, configurable: true,
    });
  }
}

/**
 * Gli identificatori chiamati dentro gli attributi handler di un sorgente.
 * Vale sia per index.html sia per i template che Session.js genera a runtime.
 */
function funzioniChiamateNegliHandler(testo) {
  const trovate = new Set();
  const handler = /on(?:click|change|input|submit|keydown|keyup|blur|focus)\s*=\s*(["'`])([\s\S]*?)\1/g;
  for (const h of testo.matchAll(handler)) {
    // Solo chiamate a funzione libera: `smFoo(` sì, `event.stopPropagation(` no.
    for (const c of h[2].matchAll(/(^|[^.\w$])([a-zA-Z_$][\w$]*)\s*\(/g)) trovate.add(c[2]);
  }
  // Parole chiave e API del browser che la regex raccoglie ma che non sono
  // funzioni del progetto.
  for (const parola of ['if', 'for', 'while', 'return', 'typeof', 'new', 'catch', 'switch',
    'getElementById', 'querySelector', 'parseInt', 'parseFloat', 'Number', 'String',
    'alert', 'confirm', 'setTimeout', 'requestAnimationFrame']) trovate.delete(parola);
  return trovate;
}

/** Le funzioni globali registrate dai soli moduli che carica index.html. */
let senzaLab = new Set();

describe('Contratto fra HTML e moduli browser (T1)', () => {
  beforeAll(async () => {
    installaStubDom();
    await import('../src/SongEngine.js');
    await import('../src/Session.js');
    // Fotografate qui, prima che SongEngineLab.js aggiunga le sue: index.html
    // non carica quel modulo, quindi non può contare sulle funzioni che
    // registra. Senza questa distinzione il test resterebbe verde anche
    // spostando nel lab una funzione che serve alla pagina principale.
    senzaLab = new Set(Object.keys(globalThis).filter(k => typeof globalThis[k] === 'function'));
  });

  it('SongEngine.js e Session.js si caricano e registrano i loro handler', () => {
    // Vale anche come controllo di parsabilità: fino a `e28b925` il lint non
    // apriva questi file, e un apostrofo non chiuso in Session.js passava.
    expect(typeof globalThis.smTogglePanel).toBe('function');   // Session.js
    expect(typeof globalThis.smAutoGenerate).toBe('function');   // SongEngine.js
  });

  it('ogni funzione chiamata da un onclick di index.html esiste', () => {
    const chiamate = funzioniChiamateNegliHandler(readFileSync(`${RADICE}index.html`, 'utf8'));
    expect(chiamate.size).toBeGreaterThan(10);

    const mancanti = [...chiamate].filter(nome => !senzaLab.has(nome));
    expect(mancanti, `onclick che puntano nel vuoto: ${mancanti.join(', ')}`).toEqual([]);
  });

  it('ogni funzione chiamata dagli onclick che Session.js scrive a runtime esiste', () => {
    // I pannelli, i chip del chord track e il mixer sono HTML costruito con
    // template literal: quei bottoni non esistono in index.html e nessun test
    // li aveva mai guardati.
    const chiamate = funzioniChiamateNegliHandler(readFileSync(`${RADICE}src/Session.js`, 'utf8'));
    expect(chiamate.size).toBeGreaterThan(10);

    const mancanti = [...chiamate].filter(nome => !senzaLab.has(nome));
    expect(mancanti, `bottoni generati che puntano nel vuoto: ${mancanti.join(', ')}`).toEqual([]);
  });

  it('main.js trova tutte le funzioni globali su cui appoggia il bootstrap', () => {
    // main.js non si può importare qui: chiama smInit(), che vuole il DOM
    // vero. Ma il suo contratto sì — sono le quattro funzioni che il boot
    // chiama per nome, comprese le due che reggono l'apertura di un link
    // condiviso senza sovrascrivere l'autosave (B1 + B4).
    const sorgente = readFileSync(`${RADICE}src/main.js`, 'utf8');
    // Solo le chiamate vere: `window.smUndo()` e `window.smApplyUrlState?.()`,
    // non le citazioni nei commenti dell'intestazione.
    const usate = [...sorgente.matchAll(/window\.(\w+)\s*\??\.?\(/g)].map(m => m[1]);
    expect(usate.length).toBeGreaterThan(0);

    for (const nome of usate) {
      expect(typeof globalThis[nome], `main.js chiama window.${nome}, che nessun modulo registra`).toBe('function');
    }
  });
});

describe('lab.html e il suo modulo (D3(c))', () => {
  beforeAll(async () => {
    installaStubDom();
    await import('../src/SongEngineLab.js');
  });

  it('ogni funzione chiamata da un onclick di lab.html esiste', () => {
    // lab.html carica main.js più SongEngineLab.js: il contratto vale sulla
    // somma dei due. Se un bottone del pannello Classic restasse orfano dopo
    // l'estrazione, qui diventa rosso.
    const chiamate = funzioniChiamateNegliHandler(readFileSync(`${RADICE}lab.html`, 'utf8'));
    expect(chiamate.size).toBeGreaterThan(5);

    const mancanti = [...chiamate].filter(nome => typeof globalThis[nome] !== 'function');
    expect(mancanti, `onclick di lab.html che puntano nel vuoto: ${mancanti.join(', ')}`).toEqual([]);
  });

  it('index.html non chiama niente che viva solo nel modulo del lab', () => {
    // È il senso di D3(c): il codice del pannello Classic non viene più
    // scaricato da chi apre il sito. Se una funzione servisse a entrambe le
    // pagine, andrebbe lasciata in SongEngine.js, non spostata qui.
    const soloLab = Object.keys(globalThis).filter(k => typeof globalThis[k] === 'function' && !senzaLab.has(k));
    const chiamateIndex = funzioniChiamateNegliHandler(readFileSync(`${RADICE}index.html`, 'utf8'));

    const sconfinate = [...chiamateIndex].filter(nome => soloLab.includes(nome));
    expect(sconfinate, `index.html chiama funzioni che solo lab.html carica: ${sconfinate.join(', ')}`).toEqual([]);
  });
});

describe('Playback — smoke senza audio (T1)', () => {
  it('non è pronto finché non ha caricato la libreria', () => {
    expect(isReady()).toBe(false);
  });

  it('stopAll() è sicuro anche se non ha mai suonato niente', () => {
    expect(() => stopAll()).not.toThrow();
  });
});

describe('AppState — stato centralizzato (T1)', () => {
  it('svuota la cache di una sola sezione senza toccare le altre', () => {
    AppState.cache.sm = { 's1:drums': 1, 's1:bass': 2, 's2:drums': 3 };
    AppState.cache.bp = { 's1:_bp': {}, 's2:_bp': {} };

    AppState.clearSectionCache('s1');

    expect(Object.keys(AppState.cache.sm)).toEqual(['s2:drums']);
    expect(Object.keys(AppState.cache.bp)).toEqual(['s2:_bp']);
  });

  it('clearCache() svuota tutto', () => {
    AppState.cache.sm = { 'x:drums': 1 };
    AppState.cache.bp = { 'x:_bp': {} };

    AppState.clearCache();

    expect(AppState.cache.sm).toEqual({});
    expect(AppState.cache.bp).toEqual({});
  });

  it('smCache resta un alias vivo di cache.sm', () => {
    AppState.clearCache();
    AppState.smCache['s1:piano'] = 42;

    expect(AppState.cache.sm['s1:piano']).toBe(42);
  });

  it('resetUI() riporta il pannello allo stato iniziale', () => {
    AppState.ui.flyoutOpen = { sectionId: 's1', inst: 'bass' };
    AppState.ui.expanded.add('s1');
    AppState.ui.activeInst.set('s1', 'piano');
    AppState.ui.playing = true;

    AppState.resetUI();

    expect(AppState.ui.flyoutOpen).toBeNull();
    expect(AppState.ui.expanded.size).toBe(0);
    expect(AppState.ui.activeInst.size).toBe(0);
    expect(AppState.ui.playing).toBe(false);
  });

  it('session.solo si aggiorna in place: Session.js ne tiene un alias', () => {
    // O6 di PLAN37, avvertenza scritta nel modulo: riassegnare l'oggetto
    // lascerebbe indietro l'alias locale di Session.js, e il pannello di Solo
    // Mode continuerebbe a leggere lo stato vecchio.
    const riferimento = AppState.session.solo;
    Object.assign(AppState.session.solo, { active: true, inst: 'piano', seed: 7 });

    expect(AppState.session.solo).toBe(riferimento);
    expect(riferimento.active).toBe(true);

    Object.assign(AppState.session.solo, { active: false, seed: 42 });
  });
});

describe('CharacterRoster — i personaggi di Session Mode (T1)', () => {
  const tutti = Object.values(CHARACTER_ROSTER).flat();

  it('copre i cinque strumenti dell’arrangiamento', () => {
    for (const strumento of ['drums', 'bass', 'guitar', 'piano', 'ensemble']) {
      expect(CHARACTER_ROSTER[strumento]?.length, `nessun personaggio per ${strumento}`).toBeGreaterThan(0);
    }
  });

  it('nessun id ripetuto: è la chiave con cui la sessione li salva', () => {
    const id = tutti.map(p => p.id);
    expect(new Set(id).size, `id duplicati: ${id.filter((v, i) => id.indexOf(v) !== i).join(', ')}`).toBe(id.length);
  });

  it('ogni personaggio ha nome, stile, bio e immagine', () => {
    for (const p of tutti) {
      expect(p.name, `${p.id} senza nome`).toBeTruthy();
      expect(p.style, `${p.id} senza stile`).toBeTruthy();
      expect(p.bio, `${p.id} senza bio`).toBeTruthy();
      expect(p.img, `${p.id} senza immagine`).toMatch(/^img\/.+\.(png|jpg|webp)$/);
    }
  });

  it('il feel sta fra 0 (pull) e 1 (push)', () => {
    for (const p of tutti) {
      expect(typeof p.feel, `${p.id}: feel non numerico`).toBe('number');
      expect(p.feel, `${p.id}: feel fuori scala`).toBeGreaterThanOrEqual(0);
      expect(p.feel).toBeLessThanOrEqual(1);
    }
  });
});
