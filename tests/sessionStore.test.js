import { describe, it, expect } from 'vitest';
import {
  FORMATO_SESSIONE, CHIAVE_AUTOSAVE,
  costruisciSalvataggio, validaSalvataggio,
  salvaAutosave, leggiAutosave, cancellaAutosave, nomeFileProgetto,
} from '../src/SessionStore.js';
import { SessionManager } from '../src/SessionManager.js';

// B4 di PLAN37 — la persistenza della sessione. Un file .sumidi.json può
// arrivare da chiunque e da qualunque versione: quello che conta qui è che
// nulla di malformato riesca ad entrare nell'app a metà, e che una sessione
// vera faccia il giro completo senza perdere pezzi.

/** localStorage finto, con la stessa superficie di Storage usata dal modulo. */
function storageFinto({ rompiSuScrittura = false, rompiSuLettura = false } = {}) {
  const dati = new Map();
  return {
    getItem: k => { if (rompiSuLettura) throw new Error('bloccato'); return dati.has(k) ? dati.get(k) : null; },
    setItem: (k, v) => { if (rompiSuScrittura) throw new Error('quota'); dati.set(k, String(v)); },
    removeItem: k => { dati.delete(k); },
    _dati: dati,
  };
}

/** Sessione realistica: due sezioni, un personaggio, una progressione custom. */
function sessioneDiProva() {
  const mgr = new SessionManager({ key: 'Dm', bpm: 84, style: 'jazz_ballad' });
  const verse = mgr.addSection('verse');
  mgr.addSection('chorus');
  mgr.setSectionProgression(verse.id, ['Dm7', 'G7', 'Cmaj7', 'A7']);
  mgr.setCharacter(verse.id, 'piano', 'kb_rhodes');
  mgr.setInstrumentActive(verse.id, 'drums', false);
  return mgr;
}

describe('costruisciSalvataggio', () => {
  it('marca app, formato e data', () => {
    const d = costruisciSalvataggio(sessioneDiProva().toJSON());
    expect(d.app).toBe('suMidi');
    expect(d.formato).toBe(FORMATO_SESSIONE);
    expect(Date.parse(d.salvatoIl)).not.toBeNaN();
  });

  it('non salva lo stato transitorio "playing" di Solo Mode', () => {
    const d = costruisciSalvataggio(sessioneDiProva().toJSON(), {
      active: true, inst: 'guitar', style: 'fingerpicking', characterId: 'gtr_nylon', seed: 777, playing: true,
    });
    expect(d.solo.playing).toBeUndefined();
    expect(d.solo).toMatchObject({ inst: 'guitar', style: 'fingerpicking', characterId: 'gtr_nylon', seed: 777 });
  });

  it('omette del tutto la chiave solo se non le viene passato niente', () => {
    expect(costruisciSalvataggio(sessioneDiProva().toJSON()).solo).toBeUndefined();
  });
});

describe('validaSalvataggio — cosa viene rifiutato', () => {
  const base = () => costruisciSalvataggio(sessioneDiProva().toJSON());

  it.each([
    ['null', null],
    ['una stringa', 'ciao'],
    ['un oggetto vuoto', {}],
    ['un JSON di un altro programma', { app: 'altro', formato: 1, sessione: {} }],
  ])('rifiuta %s', (_nome, dati) => {
    expect(validaSalvataggio(dati).ok).toBe(false);
  });

  it('rifiuta un formato più recente di quello che sa leggere', () => {
    const d = { ...base(), formato: FORMATO_SESSIONE + 1 };
    const esito = validaSalvataggio(d);
    expect(esito.ok).toBe(false);
    expect(esito.errore).toMatch(/più recente/);
  });

  it('rifiuta una sessione senza tonalità, stile o BPM', () => {
    for (const campo of ['key', 'style', 'bpm']) {
      const d = base();
      delete d.sessione[campo];
      expect(validaSalvataggio(d).ok).toBe(false);
    }
  });

  it('rifiuta una sezione con battute non valide', () => {
    for (const bars of [0, -4, 'otto', null]) {
      const d = base();
      d.sessione.sections[0].bars = bars;
      expect(validaSalvataggio(d).ok).toBe(false);
    }
  });

  it('rifiuta una sezione a cui manca uno strumento', () => {
    const d = base();
    delete d.sessione.sections[0].instruments.piano;
    const esito = validaSalvataggio(d);
    expect(esito.ok).toBe(false);
    expect(esito.errore).toMatch(/piano/);
  });

  it('rifiuta un elenco di sezioni che non è un array', () => {
    const d = base();
    d.sessione.sections = { uno: {} };
    expect(validaSalvataggio(d).ok).toBe(false);
  });

  it('accetta una sessione senza sezioni: è vuota, non corrotta', () => {
    const d = costruisciSalvataggio(new SessionManager().toJSON());
    expect(validaSalvataggio(d).ok).toBe(true);
  });
});

describe('giro completo salva → rileggi → ricostruisci', () => {
  it('un progetto torna identico, personaggi e accordi custom compresi', () => {
    const mgr = sessioneDiProva();
    const prima = mgr.toJSON();
    const st = storageFinto();

    expect(salvaAutosave(st, costruisciSalvataggio(prima, null))).toBe(true);
    const esito = leggiAutosave(st);
    expect(esito.ok).toBe(true);

    const ricostruito = SessionManager.fromJSON(esito.sessione);
    expect(ricostruito.toJSON()).toEqual(prima);

    const secs = ricostruito.getSections();
    expect(secs).toHaveLength(2);
    expect(secs[0].progression).toEqual(['Dm7', 'G7', 'Cmaj7', 'A7']);
    expect(secs[0].instruments.piano.characterId).toBe('kb_rhodes');
    expect(secs[0].instruments.drums.active).toBe(false);
    // I seed sono la ragione per cui il ripristino basta: la generazione è
    // deterministica, quindi lo stesso arrangiamento riproduce lo stesso audio.
    expect(secs[0].seed).toBe(mgr.getSections()[0].seed);
    expect(secs[0].instruments.bass.seed).toBe(mgr.getSections()[0].instruments.bass.seed);
  });

  it('lo stato di Solo Mode sopravvive al giro', () => {
    const st = storageFinto();
    salvaAutosave(st, costruisciSalvataggio(sessioneDiProva().toJSON(), {
      active: false, inst: 'bass', style: 'fretless', characterId: 'bass_jazz', seed: 4242, playing: false,
    }));
    expect(leggiAutosave(st).solo).toMatchObject({ inst: 'bass', style: 'fretless', seed: 4242 });
  });

  it('usa la chiave attesa in localStorage', () => {
    const st = storageFinto();
    salvaAutosave(st, costruisciSalvataggio(sessioneDiProva().toJSON()));
    expect(st._dati.has(CHIAVE_AUTOSAVE)).toBe(true);
  });
});

describe('autosave — casi in cui lo storage non collabora', () => {
  it('senza autosave ritorna null, non un errore', () => {
    expect(leggiAutosave(storageFinto())).toBeNull();
  });

  it('uno storage che lancia in lettura non fa esplodere niente', () => {
    expect(leggiAutosave(storageFinto({ rompiSuLettura: true }))).toBeNull();
  });

  it('uno storage pieno riporta false senza lanciare', () => {
    expect(salvaAutosave(storageFinto({ rompiSuScrittura: true }), { app: 'suMidi' })).toBe(false);
  });

  it('un autosave corrotto viene segnalato, non caricato', () => {
    const st = storageFinto();
    st.setItem(CHIAVE_AUTOSAVE, '{ questo non e JSON');
    const esito = leggiAutosave(st);
    expect(esito.ok).toBe(false);
  });

  it('cancellare l autosave lo toglie davvero', () => {
    const st = storageFinto();
    salvaAutosave(st, costruisciSalvataggio(sessioneDiProva().toJSON()));
    cancellaAutosave(st);
    expect(leggiAutosave(st)).toBeNull();
  });
});

describe('nomeFileProgetto', () => {
  it('mette stile, tonalità e BPM nel nome', () => {
    expect(nomeFileProgetto({ style: 'jazz_ballad', key: 'Dm', bpm: 84 }))
      .toBe('sumidi_jazz_ballad_Dm_84bpm.sumidi.json');
  });

  it('non lascia passare caratteri che romperebbero un nome file', () => {
    const nome = nomeFileProgetto({ style: 'pop/rock', key: 'F#', bpm: 120 });
    expect(nome).not.toMatch(/[/#]/);
    expect(nome.endsWith('.sumidi.json')).toBe(true);
  });
});
