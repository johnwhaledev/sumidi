/**
 * main.js — Entry point
 * ─────────────────────────────────────────────────────────
 * T4/B3: il motore di generazione (gen(), pannello Classic/lab.html) vive
 * in SongEngine.js; Session Mode (pannelli, chord track, playback, export,
 * lifecycle del SessionManager) vive in Session.js. Qui resta solo il
 * bootstrap: caricare i due moduli (side-effect: registrano i loro
 * handler window.sm... / window.gen...) e avviare Session Mode.
 */
import './SongEngine.js';
import { smInit } from './Session.js';

// SC2: shortcut Ctrl+Z
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    // Non intercettare se il focus è su un input/select/textarea
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    e.preventDefault();
    window.smUndo();
  }
});

// ── Avvio automatico Session Mode ────────────────────────────────
// Non ci sono più tab: Session è l'unica vista, si inizializza subito.
smInit();
