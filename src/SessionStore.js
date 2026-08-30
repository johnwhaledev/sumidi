/**
 * SessionStore.js — Persistenza della sessione (B4 di PLAN37)
 * ─────────────────────────────────────────────────────────────────
 * Prima di questo modulo localStorage era usato in un punto solo, per i
 * contatori dei toast Ko-fi: chiudere la scheda cancellava il lavoro. Con B1
 * il brano *generato* torna da solo (basta il seed nell'URL), ma un
 * arrangiamento costruito a mano — sezioni aggiunte, personaggi scelti,
 * progressioni custom sul chord track, strumenti mutati per lane — no.
 *
 * Due livelli, come da piano:
 *   (a) autosave in localStorage, ripristinato all'avvio. È una rete di
 *       sicurezza contro la scheda chiusa per sbaglio, non un archivio: c'è
 *       un solo slot e rispecchia sempre quello che è a schermo.
 *   (b) export/import di un file `.sumidi.json`. È il salvataggio vero, ed è
 *       anche il formato con cui condividere un progetto o allegare un bug
 *       in modo riproducibile.
 *
 * Qui dentro non si tocca il DOM e non si importa nulla dall'app: sono
 * funzioni pure più tre wrapper su uno Storage passato come parametro. È
 * quello che le rende verificabili dalla suite senza un browser.
 */

/** Versione del formato salvato. Si alza solo per cambi non retrocompatibili. */
export const FORMATO_SESSIONE = 1;

/** Chiave dell'autosave in localStorage. */
export const CHIAVE_AUTOSAVE = 'sumidi_session';

const INSTRUMENTS = ['drums', 'bass', 'guitar', 'piano', 'ensemble'];

/**
 * Costruisce l'oggetto da salvare (autosave o file).
 * @param {object} sessione  — SessionManager.toJSON(), già privo di cachedEvents
 * @param {object} [solo]    — AppState.session.solo
 * @returns {object}
 */
export function costruisciSalvataggio(sessione, solo = null) {
  const dati = {
    app: 'suMidi',
    formato: FORMATO_SESSIONE,
    salvatoIl: new Date().toISOString(),
    sessione,
  };
  if (solo) {
    // `playing` è transitorio: salvarlo significherebbe riaprire il progetto
    // convinti che stia suonando qualcosa.
    const { playing: _ignorato, ...resto } = solo;
    dati.solo = resto;
  }
  return dati;
}

/**
 * Controlla che un salvataggio sia utilizzabile prima di darlo in pasto
 * all'app. Un file `.sumidi.json` può arrivare da chiunque e da qualunque
 * versione: qui si scarta tutto ciò che romperebbe il render a metà.
 * @param {*} dati
 * @returns {{ ok: boolean, errore?: string, sessione?: object, solo?: object }}
 */
export function validaSalvataggio(dati) {
  if (!dati || typeof dati !== 'object') return { ok: false, errore: 'File non leggibile.' };
  if (dati.app !== 'suMidi') return { ok: false, errore: 'Non è un progetto suMidi.' };
  if (!Number.isInteger(dati.formato) || dati.formato < 1) {
    return { ok: false, errore: 'Versione del formato mancante o non valida.' };
  }
  if (dati.formato > FORMATO_SESSIONE) {
    return { ok: false, errore: `Progetto salvato con una versione più recente di suMidi (formato ${dati.formato}).` };
  }

  const s = dati.sessione;
  if (!s || typeof s !== 'object') return { ok: false, errore: 'Il progetto non contiene una sessione.' };
  if (typeof s.key !== 'string' || typeof s.style !== 'string' || !Number.isFinite(s.bpm)) {
    return { ok: false, errore: 'Tonalità, stile o BPM mancanti nel progetto.' };
  }
  if (!Array.isArray(s.sections)) return { ok: false, errore: 'Elenco delle sezioni mancante.' };
  for (const sec of s.sections) {
    if (!sec || typeof sec !== 'object') return { ok: false, errore: 'Sezione non valida nel progetto.' };
    if (typeof sec.id !== 'string' || typeof sec.type !== 'string') {
      return { ok: false, errore: 'Sezione senza id o tipo.' };
    }
    if (!Number.isFinite(sec.bars) || sec.bars <= 0) {
      return { ok: false, errore: `Numero di battute non valido nella sezione "${sec.type}".` };
    }
    if (!sec.instruments || typeof sec.instruments !== 'object') {
      return { ok: false, errore: `Strumenti mancanti nella sezione "${sec.type}".` };
    }
    for (const inst of INSTRUMENTS) {
      if (!sec.instruments[inst]) return { ok: false, errore: `Strumento "${inst}" mancante nella sezione "${sec.type}".` };
    }
  }

  return { ok: true, sessione: s, solo: dati.solo ?? null };
}

// ── Autosave su Storage ───────────────────────────────────────────
// Lo Storage arriva come parametro invece di leggere localStorage direttamente:
// serve a poterlo testare, e a non fare esplodere niente dove non esiste
// (modalità privata, iframe con storage bloccato). Ogni accesso è in try/catch
// per la stessa ragione dei contatori Ko-fi: in alcuni browser il solo fatto
// di leggere localStorage lancia.

/**
 * @param {Storage} storage
 * @param {object} dati — da costruisciSalvataggio()
 * @returns {boolean} true se salvato davvero
 */
export function salvaAutosave(storage, dati) {
  try {
    storage.setItem(CHIAVE_AUTOSAVE, JSON.stringify(dati));
    return true;
  } catch {
    // Storage pieno o non disponibile: l'app continua, si perde solo la rete
    // di sicurezza. Il salvataggio su file resta l'unico davvero affidabile.
    return false;
  }
}

/**
 * @param {Storage} storage
 * @returns {{ ok: boolean, errore?: string, sessione?: object, solo?: object }|null}
 *          null se non c'è nessun autosave.
 */
export function leggiAutosave(storage) {
  let grezzo = null;
  try {
    grezzo = storage.getItem(CHIAVE_AUTOSAVE);
  } catch {
    return null;
  }
  if (!grezzo) return null;
  let dati;
  try {
    dati = JSON.parse(grezzo);
  } catch {
    return { ok: false, errore: 'Autosave illeggibile.' };
  }
  return validaSalvataggio(dati);
}

/** @param {Storage} storage */
export function cancellaAutosave(storage) {
  try {
    storage.removeItem(CHIAVE_AUTOSAVE);
  } catch { /* vedi sopra */ }
}

/**
 * Nome file suggerito per l'export del progetto.
 * @param {object} sessione
 * @returns {string}
 */
export function nomeFileProgetto(sessione) {
  const pulisci = t => String(t ?? '').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'progetto';
  return `sumidi_${pulisci(sessione.style)}_${pulisci(sessione.key)}_${pulisci(sessione.bpm)}bpm.sumidi.json`;
}
