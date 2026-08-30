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
// B1 di PLAN37: prima di smInit() si applica alla composer bar lo stato
// eventualmente presente nell'URL (?style=&key=&bpm=&seed=), perché smInit
// legge i controlli per costruire il SessionManager. Se il link portava un
// seed, il brano viene rigenerato subito: è quello che rende condivisibile
// un brano con un link, e recuperabile dopo aver chiuso la scheda.
// B4: se il link porta un brano preciso non si ripristina l'autosave — chi
// apre un link condiviso deve sentire quel brano, non l'arrangiamento rimasto
// sul suo computer.
const daLink = window.smApplyUrlState?.() ?? false;
smInit({ ripristina: !daLink });
if (daLink) {
  // L'autosave resta sospeso finché la generazione dal link non è finita: il
  // brano del link è già ricostruibile dall'URL e non deve sovrascrivere
  // l'arrangiamento in corso di chi il link lo ha soltanto aperto.
  Promise.resolve(window.smAutoGenerate()).finally(() => window.smRiattivaAutosave());
}
