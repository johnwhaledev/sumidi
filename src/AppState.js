/**
 * AppState.js — Stato globale centralizzato
 * ─────────────────────────────────────────────────────────
 * Sostituisce le variabili globali sparse in index.html.
 *
 * Regola: nessuna variabile let _sm* rimane in index.html dopo R1.
 *
 * API pubblica:
 *   AppState.preview.*     — stato preview audio
 *   AppState.ui.*          — stato UI (flyout, panel, chip editing)
 *   AppState.cache.*       — cache eventi e blueprint
 *   AppState.session.*     — SessionManager + memoria melodica inter-sezione
 *
 * Usage:
 *   import { AppState } from './AppState.js';
 *   AppState.cache.smCache[`${sid}:drums`] = events;
 */

import { CrossSectionMemory } from './FlowCore.js';

export const AppState = {
  
  // ── Preview audio ───────────────────────────────────────────
  preview: {
    voices:    null,   // era _previewVoices
    ppqBpm:    null,   // era _previewPpqBpm  { ppq, bpm }
    tracks:    [],     // era _tracks
    guitarEvts:[],     // era _guitarEvents
    bassEvts:  [],     // era _bassEvents
    lastBP:    null,   // era lastBP
    lastURL:   null,   // era lastURL
    disabled:  new Set(), // era disabled (moduli disabilitati)
  },

  // ── UI state ───────────────────────────────────────────────
  ui: {
    flyoutOpen:   null,   // era _smFlyoutOpen  { sectionId, inst }
    expanded:     new Set(), // era _smExpanded   sectionId delle sezioni con panel aperto
    activeInst:   new Map(), // era _smActiveInst  sectionId → strumento tab attivo
    chipEditing:  null,   // era _smChipEditing  { sectionId, chordIndex }
    playing:      false,  // era _smPlaying
    mixerVol:     { drums:1, bass:1, guitar:1, piano:1, ensemble:1 },
    mixerMute:    { drums:false, bass:false, guitar:false, piano:false, ensemble:false },
  },

  // ── Cache ──────────────────────────────────────────────────
  cache: {
    sm:    {},  // era _smCache        key = `${sectionId}:${instrument}` → { events, program }
    bp:    {},  // era _smBpCache      key = `${sectionId}:_bp` → SongBlueprint
  },

  // ── Session (T4/B3) ──────────────────────────────────────────
  // Centralizzato dallo scorporo di main.js in SongEngine.js/Session.js:
  // _smgr e _smCrossMemory erano `let` di modulo lette/scritte da funzioni
  // che ora vivono in file diversi.
  session: {
    manager:     null,                     // era _smgr — istanza di SessionManager
    crossMemory: new CrossSectionMemory(), // era _smCrossMemory — persiste tra sezioni, si ricrea a ogni full rebuild/undo

    // ── Solo Mode (O6 di PLAN37) ─────────────────────────────
    // Era un `let _smSolo` di modulo in Session.js, quindi fuori da qualunque
    // stato osservabile: niente undo, e il pannello non sarebbe stato né
    // salvato né ripristinato dalla persistenza di sessione.
    // ATTENZIONE per chi implementerà il ripristino: questo oggetto va
    // aggiornato IN PLACE (Object.assign), mai sostituito — Session.js ne
    // tiene un alias locale, e una riassegnazione lo lascerebbe indietro.
    solo: {
      active:      false,
      inst:        'piano',
      style:       '',     // '' = Auto (varia per tipo di sezione)
      // O5 di PLAN37: sectionId → stile scelto a mano per quella sezione. La
      // tabella per tipo di sezione resta il default (l'etichetta "Auto" era
      // giusta, non era un errore); questa mappa è l'eccezione esplicita, lo
      // stesso modello che l'Arrangement ha sempre avuto. Vuota = nessuna
      // eccezione. Viene salvata nel .sumidi.json insieme al resto del solo.
      stylePerSection: {},
      characterId: null,   // null = nessun personaggio scelto
      seed:        42,
      playing:     false,  // transitorio: non ha senso salvarlo
    },
  },

  // ── Helpers ────────────────────────────────────────────────
  
  /** Resetta tutta la cache (es. dopo undo). */
  clearCache() {
    this.cache.sm = {};
    this.cache.bp = {};
  },

  /** Resetta solo la cache di una sezione. */
  clearSectionCache(sectionId) {
    for (const key of Object.keys(this.cache.sm)) {
      if (key.startsWith(`${sectionId}:`)) delete this.cache.sm[key];
    }
    delete this.cache.bp[`${sectionId}:_bp`];
  },

  /** getter/setter per compatibilità con codice esistente _smCache */
  get smCache() { return this.cache.sm; },
  
  /** Resetta stato UI al valore iniziale. */
  resetUI() {
    this.ui.flyoutOpen  = null;
    this.ui.expanded.clear();
    this.ui.activeInst.clear();
    this.ui.chipEditing = null;
    this.ui.playing     = false;
  },
};
