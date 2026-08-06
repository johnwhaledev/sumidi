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
 *   AppState.session.*      — stato sessione (playing, undo available)
 * 
 * Usage:
 *   import { AppState } from './AppState.js';
 *   AppState.cache.smCache[`${sid}:drums`] = events;
 */

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
