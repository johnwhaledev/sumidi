/**
 * Session.js — T4/B3: Session Mode (pannelli, chord track, playback, export)
 * ─────────────────────────────────────────────────────────
 * Estratto da main.js: tutto ciò che riguarda Session Mode — pannelli per
 * sezione/strumento, chord track, playback in-app, export (MIDI/CRD/tab
 * avanzato), più il lifecycle del SessionManager (init, add/remove/move
 * sezione, undo). Tenuto insieme in un solo file perché fortemente
 * interconnesso: quasi ogni funzione qui chiama smRender(), smToast() o
 * legge/scrive AppState.session.manager — separarlo in file più piccoli
 * avrebbe solo spostato l'accoppiamento dentro import/export incrociati,
 * senza ridurlo davvero.
 *
 * smImportFromBlueprint() e smBumpSupportCounter() sono esportate: le usa
 * gen() in SongEngine.js (il "ponte" fra generazione a blueprint intero e
 * SessionManager). smInit() è esportata per il bootstrap in main.js.
 */
import { AppState } from './AppState.js';
import { SessionManager, buildSectionBlueprint } from './SessionManager.js';
import { CHARACTER_ROSTER } from './CharacterRoster.js';
import { createKnob, createSlider, createPatternDots, createToggle } from '../design/DesignSystem.js';
import { makeRng, parseChord } from './SongArchitect.js';
import { generateDrums } from './Percussionist.js';
import { generateDrumMachine, DM_PRESETS, DM_CHANNELS } from './DrumMachineGenerator.js';
import { generateBass } from './BassGenerator.js';
import { generateGuitar } from './GuitarGenerator.js';
import { generateEnsemble } from './EnsembleGenerator.js';
import { generatePiano } from './PianoGenerator.js';
import { humanize, applySwing } from './Humanizer.js';
import { buildDrumContext, CrossSectionMemory } from './FlowCore.js';
import { buildGuitarTab, buildBassTab, renderChordChart } from './TabRenderer.js';
import { applyGrooveLock } from './GrooveLock.js';
import { playTracks, stopAll as stopPlayback } from './Playback.js';
import { STYLES } from './Styles.js';
import { costruisciSalvataggio, validaSalvataggio, salvaAutosave, leggiAutosave, nomeFileProgetto } from './SessionStore.js';
import { buildSessionMidi, buildSoloMidi } from './SessionExport.js';
import { analizzaGriglia } from './ChordGrid.js';
import { nomeAccordo } from './ChordTheory.js';

const SM_PPQ = 480;   // PPQ standard usato da buildSong

// AppState.ui.expanded, AppState.ui.activeInst → AppState.ui

// Apre/chiude il pannello di configurazione di una sezione
window.smTogglePanel = sectionId => {
  if (AppState.ui.expanded.has(sectionId)) {
    AppState.ui.expanded.delete(sectionId);
  } else {
    AppState.ui.expanded.add(sectionId);
    if (!AppState.ui.activeInst.has(sectionId)) AppState.ui.activeInst.set(sectionId, 'drums');
  }
  smRender();
};

// Cambia tab strumento senza full re-render
window.smSetPanelInst = (sectionId, instrument) => {
  AppState.ui.activeInst.set(sectionId, instrument);
  const section = AppState.session.manager?.getSection(sectionId);
  const panelEl = document.getElementById(`sm-panel-${sectionId}`);
  if (section && panelEl) { panelEl.innerHTML = ''; smBuildPanelContent(sectionId, section, panelEl); }
};

// Salva un singolo param e invalida la cache dell'strumento
window.smSetParam = (sectionId, instrument, key, value) => {
  AppState.session.manager?.setInstrumentParams(sectionId, instrument, { [key]: value });
  smInvalidateCache(sectionId, instrument);
};

// Seleziona un personaggio: imposta style e feel di default del personaggio
window.smSelectCharacter = (sectionId, instrument, character) => {
  AppState.session.manager?.setCharacter(sectionId, instrument, character.id);
  // Applica style/feel come param strumento (non sovrascrive ensStyle)
  const paramUpdate = { feel: character.feel };
  if (instrument === 'ensemble') {
    paramUpdate.ensStyle = character.style;  // tipo strumento (strings/brass/…)
  } else {
    paramUpdate.style = character.style;
  }
  AppState.session.manager?.setInstrumentParams(sectionId, instrument, paramUpdate);
  smInvalidateCache(sectionId, instrument);
  smRender();
  // Ricarica cache in background per aggiornare i pattern dots
  smGenerateSection(sectionId).then(() => {
    const panelEl = document.getElementById(`sm-panel-${sectionId}`);
    if (panelEl && AppState.ui.expanded.has(sectionId)) {
      const section = AppState.session.manager?.getSection(sectionId);
      if (section) { panelEl.innerHTML = ''; smBuildPanelContent(sectionId, section, panelEl); }
    }
  }).catch(() => { });
};

// ── Estrai pattern da eventi cached ──────────────────────────────
function _drumPatterns(sectionId) {
  const cached = AppState.cache.sm[`${sectionId}:drums`];
  const kick = Array(16).fill(false), snare = Array(16).fill(false), hh = Array(16).fill(false);
  if (!cached?.events?.length) return { kick, snare, hh };
  const s16 = SM_PPQ / 4;
  for (const e of cached.events) {
    if (e.cc != null) continue;
    const step = Math.round(e.tick / s16) % 16;
    if (step < 0 || step >= 16) continue;
    if (e.note === 35 || e.note === 36) kick[step] = true;
    else if (e.note === 38 || e.note === 40 || e.note === 37) snare[step] = true;
    else if (e.note === 42 || e.note === 44 || e.note === 46) hh[step] = true;
  }
  return { kick, snare, hh };
}

function _bassPattern(sectionId) {
  const cached = AppState.cache.sm[`${sectionId}:bass`];
  const pat = Array(16).fill(false);
  if (!cached?.events?.length) return pat;
  const s16 = SM_PPQ / 4;
  for (const e of cached.events) {
    if (e.cc != null) continue;
    const step = Math.round(e.tick / s16) % 16;
    if (step >= 0 && step < 16) pat[step] = true;
  }
  return pat;
}

// ── Costruzione panel (S18: solo strumento attivo, no tabs) ──────────────────
function smBuildPanelContent(sectionId, section, panelEl) {
  // Lo strumento attivo è quello cliccato nella lane
  const activeInst = AppState.ui.activeInst.get(sectionId) ?? 'drums';

  // Seed Row per strumento
  const seedRow = document.createElement('div');
  seedRow.className = 'sm-ctrl-row';
  seedRow.style.marginBottom = '14px';
  seedRow.innerHTML = `<span class="sm-ctrl-label">Seed Strumento</span>
    <span style="font-family:monospace;font-size:11px;color:var(--text);width:40px;display:inline-block">#${section.instruments[activeInst]?.seed ?? '---'}</span>
    <button class="sm-icon-btn" title="Nuovo seed casuale" onclick="smMutateInstrumentSeed('${sectionId}','${activeInst}')">🎲</button>
    <select class="sm-style-sel" style="width:auto; margin-left:6px" onchange="if(this.value) { smCopySeed('${sectionId}','${activeInst}', this.value); this.value=''; }">
      <option value="">🔗 Copia seed da...</option>
      ${_getSeedOptionsHTML(sectionId, activeInst)}
    </select>`;
  panelEl.appendChild(seedRow);

  // Contenuto (solo strumento attivo, niente tabs)
  const content = document.createElement('div');
  panelEl.appendChild(content);

  if (activeInst === 'drums') {
    _buildCharSelector('drums', section, content, sectionId);
    const drumCharId = section.instruments.drums.characterId ?? '';
    if (drumCharId.startsWith('dm_')) {
      _buildPanelDrumMachine(section, content, sectionId);
    } else {
      _buildPanelDrums(section, content, sectionId);
    }
  } else if (activeInst === 'bass') {
    _buildCharSelector('bass', section, content, sectionId);
    _buildPanelBass(section, content, sectionId);
  } else if (activeInst === 'piano') {
    _buildCharSelector('piano', section, content, sectionId);
    _buildPanelPiano(section, content, sectionId);
  } else if (activeInst === 'guitar') {
    _buildCharSelector('guitar', section, content, sectionId);
    _buildPanelGuitar(section, content, sectionId);
  } else if (activeInst === 'ensemble') {
    _buildCharSelector('ensemble', section, content, sectionId);
    _buildPanelEnsemble(section, content, sectionId);
  } else {
    content.innerHTML = `<div class="sm-panel-placeholder">Panel <strong>${activeInst}</strong> non disponibile.</div>`;
  }
}

// ── Character Selector ────────────────────────────────────────────
function _buildCharSelector(instrument, section, container, sectionId) {
  const roster = CHARACTER_ROSTER[instrument] ?? [];
  if (!roster.length) return;

  const currentId = section.instruments[instrument].characterId;
  let idx = roster.findIndex(c => c.id === currentId);
  if (idx < 0) idx = 0;

  const wrap = document.createElement('div');
  wrap.className = 'sm-char-selector';

  const prev = document.createElement('button');
  prev.className = 'sm-char-nav-btn';
  prev.textContent = '◀';
  prev.title = 'Personaggio precedente';
  prev.onclick = () => smSelectCharacter(sectionId, instrument, roster[(idx - 1 + roster.length) % roster.length]);

  const img = document.createElement('img');
  img.className = 'sm-char-img';
  img.src = roster[idx].img;
  img.alt = roster[idx].name;
  img.onerror = () => img.style.display = 'none';

  const info = document.createElement('div');
  info.className = 'sm-char-info';
  info.innerHTML = `<div class="sm-char-name">${roster[idx].name}</div><div class="sm-char-bio">${roster[idx].bio}</div>`;

  const next = document.createElement('button');
  next.className = 'sm-char-nav-btn';
  next.textContent = '▶';
  next.title = 'Personaggio successivo';
  next.onclick = () => smSelectCharacter(sectionId, instrument, roster[(idx + 1) % roster.length]);

  wrap.append(prev, img, info, next);
  container.appendChild(wrap);
}

// ── Panel Drums ───────────────────────────────────────────────────
function _buildPanelDrums(section, container, sectionId) {
  const p = section.instruments.drums.params ?? {};
  const charId = section.instruments.drums.characterId ?? '';
  const isPerc = charId.startsWith('perc_');

  // Riga stile — lista diversa per percussionisti etnici
  const drumStyles = ['brushes', 'rock', 'cajon', 'jazz', 'blues_shuffle', 'pop', 'waltz_8th'];
  const percStyles = ['cajon', 'folk'];
  const styleList = isPerc ? percStyles : drumStyles;
  const defaultStyle = isPerc ? 'cajon' : 'rock';

  const styleRow = document.createElement('div');
  styleRow.className = 'sm-ctrl-row';
  styleRow.innerHTML = `<span class="sm-ctrl-label">Stile</span>
    <select class="sm-style-sel" onchange="smSetParam('${sectionId}','drums','style',this.value)">
      ${styleList
      .map(s => `<option value="${s}"${s === (p.style ?? defaultStyle) ? ' selected' : ''}>${s}</option>`).join('')}
    </select>`;
  container.appendChild(styleRow);

  // Pattern dots — kick/snare/HH (modificabili)
  const { kick, snare, hh } = _drumPatterns(sectionId);
  const pRows = document.createElement('div');
  pRows.className = 'sm-pattern-rows';
  pRows.id = `sm-drum-pat-${sectionId}`;
  for (const [lbl, pat] of [['Kick', kick], ['Snare', snare], ['HH', hh]]) {
    const row = document.createElement('div');
    row.className = 'sm-pattern-row';
    const l = document.createElement('span');
    l.className = 'sm-pattern-lbl';
    l.textContent = lbl;
    row.appendChild(l);
    createPatternDots(row, {
      pattern: pat,
      label: '',
      onChange: (newPat) => smDmPatternChanged(sectionId, lbl.toLowerCase(), newPat)
    });
    pRows.appendChild(row);
  }
  container.appendChild(pRows);

  // Controlli
  const ctrl = document.createElement('div');
  ctrl.className = 'sm-panel-controls';
  container.appendChild(ctrl);

  createSlider(ctrl, {
    value: p.feel ?? 0.5, orient: 'horizontal', length: 110,
    label: 'Feel  Pull ← Push',
    onChange: v => smSetParam(sectionId, 'drums', 'feel', v),
  });

  const gWrap = document.createElement('div'); gWrap.className = 'sm-ctrl-group';
  createToggle(gWrap, {
    value: (p.ghost ?? 1.0) > 0.5, label: 'Ghost',
    onChange: v => smSetParam(sectionId, 'drums', 'ghost', v ? 1.5 : 0),
  });
  ctrl.appendChild(gWrap);

  const fWrap = document.createElement('div'); fWrap.className = 'sm-ctrl-group';
  createToggle(fWrap, {
    value: p.fills == null || p.fills > 0.1, label: 'Fills',
    onChange: v => smSetParam(sectionId, 'drums', 'fills', v ? null : 0),
  });
  ctrl.appendChild(fWrap);

  createKnob(ctrl, {
    value: p.velocity ?? 0.72, label: 'Volume',
    min: 0, max: 1, size: 46,
    onChange: v => smSetParam(sectionId, 'drums', 'velocity', v),
  });
}

// ── Panel Drum Machine ────────────────────────────────────────────
function _buildPanelDrumMachine(section, container, sectionId) {
  const p = section.instruments.drums.params ?? {};
  const charId = section.instruments.drums.characterId ?? '';
  // Preset di default dal personaggio se non ancora impostato
  const defPreset = charId === 'dm_lo1' ? 'lo_fi' : charId === 'dm_e909' ? 'electro' : 'trap';
  const presetName = p.dmPreset ?? defPreset;
  const preset = DM_PRESETS[presetName] ?? DM_PRESETS.trap;
  const pattern = p.dmPattern ?? preset;

  // Preset selector
  const presetRow = document.createElement('div');
  presetRow.className = 'sm-ctrl-row';
  presetRow.innerHTML = `<span class="sm-ctrl-label">Preset</span>
    <select class="sm-style-sel" onchange="smDmSetPreset('${sectionId}',this.value)">
      ${[['trap', 'Trap'], ['lo_fi', 'Lo-Fi'], ['electro', 'Electro']]
      .map(([v, l]) => `<option value="${v}"${v === presetName ? ' selected' : ''}>${l}</option>`).join('')}
    </select>`;
  container.appendChild(presetRow);

  // Griglia 16 step per ogni canale
  const grid = document.createElement('div');
  grid.className = 'sm-dm-grid';

  for (const [ch, label] of DM_CHANNELS) {
    const row = document.createElement('div');
    row.className = 'sm-dm-row';

    const lbl = document.createElement('span');
    lbl.className = 'sm-dm-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    const steps = pattern[ch] ?? Array(16).fill(0);
    for (let i = 0; i < 16; i++) {
      const btn = document.createElement('button');
      btn.className = 'sm-dm-step' + (steps[i] > 0 ? ' active' : '');
      if (i > 0 && i % 4 === 0) btn.classList.add('sm-dm-beat4');
      btn.title = `${label} step ${i + 1}`;
      btn.onclick = () => smDmToggleStep(sectionId, ch, i, preset[ch]?.[i] || 80);
      row.appendChild(btn);
    }
    grid.appendChild(row);
  }
  container.appendChild(grid);

  // Swing + Volume
  const ctrl = document.createElement('div');
  ctrl.className = 'sm-panel-controls';
  container.appendChild(ctrl);

  createSlider(ctrl, {
    value: p.dmSwing ?? (preset.swing ?? 0), orient: 'horizontal', length: 110,
    label: 'Swing',
    onChange: v => smSetParam(sectionId, 'drums', 'dmSwing', v),
  });

  createKnob(ctrl, {
    value: p.velocity ?? 0.72, label: 'Volume',
    min: 0, max: 1, size: 46,
    onChange: v => smSetParam(sectionId, 'drums', 'velocity', v),
  });
}

// Globali per il drum machine panel ──────────────────────────────
window.smDmToggleStep = function (sectionId, channel, step, defVel) {
  const section = AppState.session.manager?.getSection(sectionId);
  if (!section) return;
  const p = section.instruments.drums.params ?? {};
  const presetName = p.dmPreset
    ?? ((section.instruments.drums.characterId ?? '') === 'dm_lo1' ? 'lo_fi'
      : (section.instruments.drums.characterId ?? '') === 'dm_e909' ? 'electro' : 'trap');
  const preset = DM_PRESETS[presetName] ?? DM_PRESETS.trap;
  // Clona il pattern corrente (custom o preset)
  const pat = JSON.parse(JSON.stringify(p.dmPattern ?? preset));
  const steps = pat[channel] ?? Array(16).fill(0);
  steps[step] = steps[step] > 0 ? 0 : (defVel ?? 80);
  pat[channel] = steps;
  smSetParam(sectionId, 'drums', 'dmPattern', pat);
};

window.smDmSetPreset = function (sectionId, presetName) {
  AppState.session.manager?.setInstrumentParams(sectionId, 'drums', { dmPreset: presetName, dmPattern: null });
  AppState.session.manager?.invalidateCache(sectionId, 'drums');
  smRender();
};

// Handler per pattern dots modificati (kick/snare/hh)
// Modifica direttamente gli eventi cached (kick=35/36, snare=38/40, hh=42/44/46)
window.smDmPatternChanged = function (sectionId, patternType, newPattern) {
  const section = AppState.session.manager?.getSection(sectionId);
  if (!section) return;

  const ckey = `${sectionId}:drums`;
  const cached = AppState.cache.sm[ckey];
  if (!cached?.events?.length) return;

  const s16 = SM_PPQ / 4;
  const barTicks = SM_PPQ * 4;

  // Mappa patternType → note GM
  const noteMap = {
    'kick': [35, 36],
    'snare': [38, 40, 37],
    'hh': [42, 44, 46]
  };
  const targetNotes = noteMap[patternType] ?? [];

  // Raggruppa eventi per barra
  const barsMap = new Map();
  for (const e of cached.events) {
    if (e.cc != null) continue;
    const barTick = Math.floor(e.tick / barTicks) * barTicks;
    if (!barsMap.has(barTick)) barsMap.set(barTick, []);
    barsMap.get(barTick).push(e);
  }

  // Modifica gli eventi kick/snare/hh in ogni barra
  for (const [barTickStr, barEvents] of barsMap) {
    const barTick = Number(barTickStr);

    // Rimuovi eventi del tipo target in questa barra
    const filtered = barEvents.filter(e => !targetNotes.includes(e.note));

    // Aggiungi nuovi eventi basati sul pattern
    for (let step = 0; step < 16; step++) {
      if (!newPattern[step]) continue;
      const tick = barTick + step * s16;
      const note = targetNotes[0];  // Usa la nota principale
      filtered.push({ tick, note, velocity: 80, duration: Math.round(s16 * 0.5) });
    }

    // Aggiorna cached.events con la lista filtrata
    // Sostituisci gli eventi della barra originale nella lista completa
    const otherEvents = cached.events.filter(e => {
      const eBarTick = Math.floor(e.tick / barTicks) * barTicks;
      return eBarTick !== barTick || targetNotes.includes(e.note) === false;
    });
    cached.events = [...otherEvents, ...filtered];
  }

  // Salva pattern custom nei params per persistenza
  const current = _drumPatterns(sectionId);
  AppState.session.manager?.setInstrumentParams(sectionId, 'drums', { customPattern: current });

  // Aggiorna UI
  smRenderChordTrack();
  const flyPanel = document.getElementById('sm-flyout-panel');
  if (flyPanel && AppState.ui.flyoutOpen?.sectionId === sectionId) {
    // Aggiorna solo i pattern dots senza rebuild completo
    const patContainer = document.getElementById(`sm-drum-pat-${sectionId}`);
    if (patContainer) {
      patContainer.innerHTML = '';
      for (const [lbl, pat] of [['Kick', current.kick], ['Snare', current.snare], ['HH', current.hh]]) {
        const row = document.createElement('div');
        row.className = 'sm-pattern-row';
        const l = document.createElement('span');
        l.className = 'sm-pattern-lbl';
        l.textContent = lbl;
        row.appendChild(l);
        createPatternDots(row, {
          pattern: pat,
          label: '',
          onChange: (newPat) => smDmPatternChanged(sectionId, lbl.toLowerCase(), newPat)
        });
        patContainer.appendChild(row);
      }
    }
  }
};

// ── Panel Bass ────────────────────────────────────────────────────
function _buildPanelBass(section, container, sectionId) {
  const p = section.instruments.bass.params ?? {};

  // Riga stile
  const styleRow = document.createElement('div');
  styleRow.className = 'sm-ctrl-row';
  styleRow.innerHTML = `<span class="sm-ctrl-label">Stile</span>
    <select class="sm-style-sel" onchange="smSetParam('${sectionId}','bass','style',this.value)">
      ${['walking', 'fingerstyle', 'slap', 'fretless', 'acoustic_bass']
      .map(s => `<option value="${s}"${s === (p.style ?? 'fingerstyle') ? ' selected' : ''}>${s}</option>`).join('')}
    </select>`;
  container.appendChild(styleRow);

  // Pattern dots — ritmo basso (read-only)
  const bassPat = _bassPattern(sectionId);
  const bPatRow = document.createElement('div');
  bPatRow.className = 'sm-pattern-rows';
  bPatRow.id = `sm-bass-pat-${sectionId}`;
  const bRow = document.createElement('div');
  bRow.className = 'sm-pattern-row';
  const bl = document.createElement('span');
  bl.className = 'sm-pattern-lbl'; bl.textContent = 'Bass';
  bRow.appendChild(bl);
  const bdots = createPatternDots(bRow, { pattern: bassPat, label: '' });
  bdots.element.style.pointerEvents = 'none';
  bdots.element.style.opacity = '0.75';
  bPatRow.appendChild(bRow);
  container.appendChild(bPatRow);

  // Controlli
  const ctrl = document.createElement('div');
  ctrl.className = 'sm-panel-controls';
  container.appendChild(ctrl);

  createKnob(ctrl, {
    value: p.density ?? 0.5, label: 'Densità',
    min: 0, max: 1, size: 46,
    onChange: v => smSetParam(sectionId, 'bass', 'density', v),
  });
  createKnob(ctrl, {
    value: p.rest ?? 0, label: 'Pausa',
    min: 0, max: 0.5, size: 46,
    onChange: v => smSetParam(sectionId, 'bass', 'rest', v),
  });
  createKnob(ctrl, {
    value: p.velocity ?? 0.65, label: 'Volume',
    min: 0, max: 1, size: 46,
    onChange: v => smSetParam(sectionId, 'bass', 'velocity', v),
  });

  // Nota più bassa
  const noteRow = document.createElement('div');
  noteRow.className = 'sm-ctrl-row';
  noteRow.style.marginTop = '8px';
  noteRow.innerHTML = `<span class="sm-ctrl-label">Nota più bassa</span>
    <select class="sm-style-sel" onchange="smSetParam('${sectionId}','bass','lowestNote',+this.value)">
      ${[[28, 'E1'], [33, 'A1'], [38, 'D2'], [43, 'G2']]
      .map(([v, l]) => `<option value="${v}"${v === (p.lowestNote ?? 28) ? ' selected' : ''}>${l}</option>`).join('')}
    </select>`;
  container.appendChild(noteRow);
}

// ── Panel Piano / Keyboard ────────────────────────────────────────
function _buildPanelPiano(section, container, sectionId) {
  const p = section.instruments.piano.params ?? {};
  const charId = section.instruments.piano.characterId ?? '';
  const isKeyboard = charId.startsWith('kb_');

  // Style
  const allPianoStyles = isKeyboard
    ? ['comping', 'hip_hop_keys', 'broken_chords', 'freely', 'ballad', 'new_age_flow']
    : ['ballad', 'new_age_flow', 'comping', 'alberti_bass', 'freely'];
  const defStyle = isKeyboard ? 'comping' : 'ballad';
  const styleRow = document.createElement('div');
  styleRow.className = 'sm-ctrl-row';
  styleRow.innerHTML = `<span class="sm-ctrl-label">Stile</span>
    <select class="sm-style-sel" onchange="smSetParam('${sectionId}','piano','style',this.value)">
      ${allPianoStyles
      .map(s => `<option value="${s}"${s === (p.style ?? defStyle) ? ' selected' : ''}>${s}</option>`).join('')}
    </select>`;
  container.appendChild(styleRow);

  // Program (acustico vs tastiera elettrica)
  const programs = isKeyboard
    ? [[4, 'Electric Piano 1 (Rhodes)'], [5, 'Electric Piano 2 (Wurly)'],
    [0, 'Grand Piano'], [6, 'Harpsichord'], [7, 'Clavinet']]
    : [[0, 'Grand Piano'], [1, 'Bright Piano'], [4, 'Electric Piano 1'], [6, 'Harpsichord']];
  const defProg = isKeyboard ? 4 : 0;
  const progRow = document.createElement('div');
  progRow.className = 'sm-ctrl-row';
  progRow.innerHTML = `<span class="sm-ctrl-label">Suono</span>
    <select class="sm-style-sel" onchange="smSetParam('${sectionId}','piano','program',+this.value)">
      ${programs.map(([v, l]) =>
    `<option value="${v}"${v === (p.program ?? defProg) ? ' selected' : ''}>${l}</option>`).join('')}
    </select>`;
  container.appendChild(progRow);

  // Dinamica arc
  const arcRow = document.createElement('div');
  arcRow.className = 'sm-ctrl-row';
  arcRow.innerHTML = `<span class="sm-ctrl-label">Dinamica</span>
    <select class="sm-style-sel" onchange="smSetParam('${sectionId}','piano','arcType',this.value)">
      ${[['flat', 'Piatta'], ['rise', 'Crescendo'], ['fall', 'Diminuendo']]
      .map(([v, l]) => `<option value="${v}"${v === (p.arcType ?? 'flat') ? ' selected' : ''}>${l}</option>`).join('')}
    </select>`;
  container.appendChild(arcRow);

  // Movimento — relevante per stile "freely" (jazz-soul improvisation)
  const movRow = document.createElement('div');
  movRow.className = 'sm-ctrl-row';
  movRow.innerHTML = `<span class="sm-ctrl-label">Movimento</span>
    <select class="sm-style-sel" onchange="smSetParam('${sectionId}','piano','movement',this.value)">
      ${[['minimal', 'Minimal'], ['medium', 'Medium'], ['full', 'Full']]
      .map(([v, l]) => `<option value="${v}"${v === (p.movement ?? 'medium') ? ' selected' : ''}>${l}</option>`).join('')}
    </select>`;
  container.appendChild(movRow);

  // Volume knob
  const ctrl = document.createElement('div');
  ctrl.className = 'sm-panel-controls';
  ctrl.style.marginTop = '6px';
  container.appendChild(ctrl);
  createKnob(ctrl, {
    value: p.velocity ?? 0.65, label: 'Volume',
    min: 0, max: 1, size: 46,
    onChange: v => smSetParam(sectionId, 'piano', 'velocity', v),
  });
}

// ── Panel Guitar ──────────────────────────────────────────────────
function _guitarPattern(sectionId) {
  const cached = AppState.cache.sm[`${sectionId}:guitar`];
  const pat = Array(16).fill(false);
  if (!cached?.events?.length) return pat;
  const s16 = SM_PPQ / 4;
  for (const e of cached.events) {
    if (e.cc != null) continue;
    const step = Math.round(e.tick / s16) % 16;
    if (step >= 0 && step < 16) pat[step] = true;
  }
  return pat;
}

function _buildPanelGuitar(section, container, sectionId) {
  const p = section.instruments.guitar.params ?? {};
  const charId = section.instruments.guitar.characterId ?? '';
  const isElectric = charId.startsWith('elgtr_');

  // Style
  const styles = isElectric
    ? ['powerchord', 'riff', 'strumming', 'arpeggio']
    : ['fingerpicking', 'arpeggio', 'strumming', 'classical', 'powerchord', 'riff'];
  const defStyle = p.style ?? styles[0];
  const styleRow = document.createElement('div');
  styleRow.className = 'sm-ctrl-row';
  styleRow.innerHTML = `<span class="sm-ctrl-label">Stile</span>
    <select class="sm-style-sel" onchange="smSetParam('${sectionId}','guitar','style',this.value)">
      ${styles.map(s => `<option value="${s}"${s === defStyle ? ' selected' : ''}>${s}</option>`).join('')}
    </select>`;
  container.appendChild(styleRow);

  // Pattern dots (read-only)
  const gitPat = _guitarPattern(sectionId);
  const pRows = document.createElement('div');
  pRows.className = 'sm-pattern-rows';
  pRows.id = `sm-git-pat-${sectionId}`;
  const pRow = document.createElement('div');
  pRow.className = 'sm-pattern-row';
  const lbl = document.createElement('span');
  lbl.className = 'sm-pattern-lbl';
  lbl.textContent = isElectric ? 'Elec' : 'Gtr';
  pRow.appendChild(lbl);
  const dots = createPatternDots(pRow, { pattern: gitPat, label: '' });
  dots.element.style.pointerEvents = 'none';
  dots.element.style.opacity = '0.75';
  pRows.appendChild(pRow);
  container.appendChild(pRows);

  // Volume knob
  const ctrl = document.createElement('div');
  ctrl.className = 'sm-panel-controls';
  container.appendChild(ctrl);
  createKnob(ctrl, {
    value: p.velocity ?? 0.65, label: 'Volume',
    min: 0, max: 1, size: 46,
    onChange: v => smSetParam(sectionId, 'guitar', 'velocity', v),
  });
}

// ── Panel Ensemble ────────────────────────────────────────────────
function _buildPanelEnsemble(section, container, sectionId) {
  const p = section.instruments.ensemble.params ?? {};

  // Tipo strumento
  const typeRow = document.createElement('div');
  typeRow.className = 'sm-ctrl-row';
  typeRow.innerHTML = `<span class="sm-ctrl-label">Strumento</span>
    <select class="sm-style-sel" onchange="smSetParam('${sectionId}','ensemble','ensStyle',this.value)">
      ${[['strings', 'Archi'], ['chamber', 'Camera'], ['brass', 'Ottoni'], ['woodwinds', 'Legni']]
      .map(([v, l]) => `<option value="${v}"${v === (p.ensStyle ?? p.style ?? 'strings') ? ' selected' : ''}>${l}</option>`).join('')}
    </select>`;
  container.appendChild(typeRow);

  // Stile esecuzione
  const playRow = document.createElement('div');
  playRow.className = 'sm-ctrl-row';
  playRow.innerHTML = `<span class="sm-ctrl-label">Modo</span>
    <select class="sm-style-sel" onchange="smSetParam('${sectionId}','ensemble','playStyle',this.value)">
      ${[['pad', 'Pad (accordi)'], ['melodic', 'Melodico']]
      .map(([v, l]) => `<option value="${v}"${v === (p.playStyle ?? 'pad') ? ' selected' : ''}>${l}</option>`).join('')}
    </select>`;
  container.appendChild(playRow);

  // Volume
  const ctrl = document.createElement('div');
  ctrl.className = 'sm-panel-controls';
  container.appendChild(ctrl);
  createKnob(ctrl, {
    value: p.velocity ?? 0.65, label: 'Volume',
    min: 0, max: 1, size: 46,
    onChange: v => smSetParam(sectionId, 'ensemble', 'velocity', v),
  });
}

// ── Seed Inheritance & Utils ──────────────────────────────────────
/** Rigenera un solo strumento di una sezione e riporta i pattern dots aggiornati. */
function _smRegenInstrument(sectionId, instrument) {
  // Invalida solo la cache di QUESTO strumento (non l'intera sezione) —
  // gli altri strumenti restano invariati.
  smInvalidateCache(sectionId, instrument);
  smGenerateSection(sectionId).then(() => {
    const section = AppState.session.manager?.getSection(sectionId);
    if (!section) return;
    const flyPanel = document.getElementById('sm-flyout-panel');
    if (flyPanel && AppState.ui.flyoutOpen?.sectionId === sectionId) {
      flyPanel.innerHTML = ''; smBuildPanelContent(sectionId, section, flyPanel);
    }
    const panelEl = document.getElementById(`sm-panel-${sectionId}`);
    if (panelEl && AppState.ui.expanded.has(sectionId)) {
      panelEl.innerHTML = ''; smBuildPanelContent(sectionId, section, panelEl);
    }
  }).catch(() => { });
}

window.smMutateInstrumentSeed = (sectionId, instrument) => {
  if (AppState.session.manager) AppState.session.manager.mutateInstrumentSeed(sectionId, instrument);
  smRender();
  // Il seed è cambiato: la cache di questo strumento (usata dai pattern
  // dots) non era più invalidata automaticamente — restava il pattern del
  // seed precedente (o spariva senza più tornare). Rigenera e riporta i
  // pallini coerenti col nuovo seed.
  _smRegenInstrument(sectionId, instrument);
};

window.smCopySeed = (targetSectionId, targetInst, sourcePath) => {
  const [srcSecId, srcInst] = sourcePath.split(':');
  const srcSec = AppState.session.manager?.getSection(srcSecId);
  if (srcSec && AppState.session.manager) AppState.session.manager.mutateInstrumentSeed(targetSectionId, targetInst, srcSec.instruments[srcInst].seed);
  smRender();
  _smRegenInstrument(targetSectionId, targetInst);
};

function _getSeedOptionsHTML(skipSecId, skipInst) {
  if (!AppState.session.manager) return '';
  return AppState.session.manager.getSections().flatMap(sec =>
    ['drums', 'bass', 'guitar', 'piano', 'ensemble']
      .filter(inst => sec.instruments[inst].active && !(sec.id === skipSecId && inst === skipInst))
      .map(inst => `<option value="${sec.id}:${inst}">${sec.label} → ${inst}</option>`)
  ).join('');
}

// ── Session Engine ────────────────────────────────────────────────
// AppState.cache.sm, AppState.cache.bp → AppState.cache

// Salt per seed isolation per strumento
const SM_SALT = { drums: 0xDEAD, bass: 0xBEEF, guitar: 0xCAFE, piano: 0x7EA5, ensemble: 0xF00D };

// Adattamento stile quando resta un solo strumento attivo — condivisa da
// smGenerateSection() (solo per-sezione, dentro l'Arrangement) e da Solo
// Mode standalone più sotto.
const SOLO_STYLES = {
  guitar:   { intro: 'arpeggio', verse: 'arpeggio', chorus: 'strumming', bridge: 'fingerpicking', outro: 'arpeggio' },
  piano:    { intro: 'ballad',   verse: 'ballad',   chorus: 'ballad',    bridge: 'comping',       outro: 'ballad' },
  bass:     { intro: 'walking',  verse: 'walking',  chorus: 'walking',   bridge: 'walking',       outro: 'walking' },
  ensemble: { intro: 'pad',      verse: 'melodic',  chorus: 'melodic',   bridge: 'melodic',       outro: 'pad' },
};

/**
 * Genera tutti gli strumenti attivi per una sezione.
 * Rispetta la cache: se un strumento è locked + cached, lo riutilizza.
 * @param {string} sectionId
 * @param {number} humAmt  — 0..1
 * @returns {{ bp, voices }} — voices: array per SynthPreview
 */
async function smGenerateSection(sectionId, humAmt = 0.35) {
  if (!AppState.session.manager) return null;
  const state = AppState.session.manager.getState();
  const section = AppState.session.manager.getSection(sectionId);
  if (!section) return null;

  const bp = buildSectionBlueprint(
    { key: state.key, bpm: state.bpm, style: state.style },
    section
  );
  AppState.cache.bp[`${sectionId}:_bp`] = bp;  // usato da smExportChordChart e chord track
  // Aggiorna i chip chord track se la sezione non ha progressione custom
  if (!section.progression?.length) smRenderChordTrack();

  // Umanizzazione per-stile (bp.meta.humanize, es. jazz_ballad 0.5 "rubato",
  // punk 0.18 "stretto", chiptune 0.0 rigido) — prima ignorata, si usava
  // sempre il default fisso 0.35 indipendentemente dal genere.
  humAmt = bp.meta.humanize ?? humAmt;

  // ── Solo Mode per-sezione (sessione 9) ─────────────────────────────
  // Se in questa sezione resta un solo modulo attivo, adatta il suo stile
  // al tipo di sezione (tabella SOLO_STYLES, a livello di modulo — la
  // condivide anche Solo Mode standalone più sotto). Se l'utente ha scelto
  // esplicitamente uno stile per quel modulo (dal suo selettore
  // per-sezione), quella scelta vince e non viene sovrascritta.
  {
    const activeMods = ['drums', 'bass', 'guitar', 'piano', 'ensemble']
      .filter(m => section.instruments[m]?.active);
    if (activeMods.length === 1) {
      const soloMod = activeMods[0];
      const styleMap = SOLO_STYLES[soloMod];
      const mod      = bp.sections[0].modules[soloMod];
      // Trappola nota (PLAN36): a livello UI l'ensemble usa `params.playStyle`,
      // non `params.style` come gli altri — a livello di blueprint invece
      // tutti i moduli (ensemble incluso) usano `.style` uniformemente,
      // quindi qui non c'è ambiguità sul campo da scrivere su `mod`.
      const userStyle = soloMod === 'ensemble'
        ? section.instruments.ensemble?.params?.playStyle
        : section.instruments[soloMod]?.params?.style;
      if (mod && styleMap && userStyle == null) {
        mod.style = styleMap[section.type] ?? mod.style;
      }
    }
  }

  const voices = [];

  // ── Drums ──────────────────────────────────────────────────────
  if (section.instruments.drums.active) {
    const ckey = `${sectionId}:drums`;
    const inst = section.instruments.drums;
    if (!(inst.locked && AppState.cache.sm[ckey])) {
      const isDM = (inst.characterId ?? '').startsWith('dm_');
      let evts;
      if (isDM) {
        // Drum Machine: timing deterministico, swing gestito internamente
        const dmParams = {
          ...(inst.params ?? {}),
          dmPreset: inst.params?.dmPreset ?? (inst.characterId === 'dm_lo1' ? 'lo_fi'
            : inst.characterId === 'dm_e909' ? 'electro' : 'trap'),
        };
        evts = generateDrumMachine(bp, dmParams);
      } else {
        const seed = inst.seed ^ SM_SALT.drums;
        evts = generateDrums(bp, seed);
        humanize(evts, bp.meta.ppq, humAmt * 0.4, 9, seed + 1, bp.meta.barTicks);
        // Swing pieno come tutti gli altri strumenti — prima la batteria
        // swingava solo al 33% dello stesso bp.meta.swing usato da
        // basso/chitarra/piano/ensemble, uno sfasamento sistematico (non
        // casuale) su ogni ottavo "in levare" negli stili con swing.
        applySwing(evts, bp.meta.ppq, bp.meta.swing ?? 0);
      }
      AppState.cache.sm[ckey] = { events: evts };
    }
    if (AppState.cache.sm[ckey]?.events?.length)
      voices.push({ channel: 9, events: AppState.cache.sm[ckey].events });
  }

  // Drum context per gli altri strumenti
  const drumEvts = AppState.cache.sm[`${sectionId}:drums`]?.events ?? [];
  const smDrumCtx = buildDrumContext(drumEvts, bp.meta.ppq, bp.meta.barTicks);

  // ── Bass ───────────────────────────────────────────────────────
  if (section.instruments.bass.active) {
    const ckey = `${sectionId}:bass`;
    const inst = section.instruments.bass;
    if (!(inst.locked && AppState.cache.sm[ckey])) {
      const seed = inst.seed ^ SM_SALT.bass;
      const res = generateBass(bp, smDrumCtx, seed);
      humanize(res.events, bp.meta.ppq, humAmt * 0.6, 1, seed + 2, bp.meta.barTicks);
      applySwing(res.events, bp.meta.ppq, bp.meta.swing ?? 0);
      AppState.cache.sm[ckey] = { events: res.events, program: res.program };
    }
    if (AppState.cache.sm[ckey]?.events?.length)
      voices.push({ channel: 1, events: AppState.cache.sm[ckey].events, program: AppState.cache.sm[ckey].program });
  }

  // ── Guitar ─────────────────────────────────────────────────────
  if (section.instruments.guitar.active) {
    const ckey = `${sectionId}:guitar`;
    const inst = section.instruments.guitar;
    if (!(inst.locked && AppState.cache.sm[ckey])) {
      const seed = inst.seed ^ SM_SALT.guitar;
      const res = generateGuitar(bp, smDrumCtx, seed, AppState.session.crossMemory);
      humanize(res.events, bp.meta.ppq, humAmt * 0.7, 2, seed + 3, bp.meta.barTicks);
      applySwing(res.events, bp.meta.ppq, bp.meta.swing ?? 0);
      AppState.cache.sm[ckey] = { events: res.events, program: res.program };
    }
    if (AppState.cache.sm[ckey]?.events?.length)
      voices.push({ channel: 2, events: AppState.cache.sm[ckey].events, program: AppState.cache.sm[ckey].program });
  }

  // ── Piano ──────────────────────────────────────────────────────
  if (section.instruments.piano.active) {
    const ckey = `${sectionId}:piano`;
    const inst = section.instruments.piano;
    if (!(inst.locked && AppState.cache.sm[ckey])) {
      const seed = inst.seed ^ SM_SALT.piano;
      const res = generatePiano(bp, smDrumCtx, seed, AppState.session.crossMemory);
      const noteEvts = res.events.filter(e => e.cc == null);
      humanize(noteEvts, bp.meta.ppq, humAmt * 0.5, 3, seed + 4, bp.meta.barTicks);
      applySwing(noteEvts, bp.meta.ppq, bp.meta.swing ?? 0);
      AppState.cache.sm[ckey] = { events: noteEvts, program: inst.params?.program ?? res.program };
    }
    if (AppState.cache.sm[ckey]?.events?.length)
      voices.push({ channel: 3, events: AppState.cache.sm[ckey].events, program: AppState.cache.sm[ckey].program });
  }

  // ── GrooveLock (pocket engine) ───────────────────────────────────
  // Riancora basso / corde basse chitarra / mano sinistra piano al kick
  // (12-28ms dopo, come un ensemble reale). Prima girava solo una volta
  // all'export finale con seed non deterministico (Math.random()) — qui
  // gira ad ogni generazione di sezione con seed derivato da section.seed,
  // quindi anteprima ed export sono coerenti e riproducibili.
  {
    const glTrackEvts = {
      drums:  AppState.cache.sm[`${sectionId}:drums`]?.events  ?? null,
      bass:   AppState.cache.sm[`${sectionId}:bass`]?.events   ?? null,
      guitar: AppState.cache.sm[`${sectionId}:guitar`]?.events ?? null,
      piano:  AppState.cache.sm[`${sectionId}:piano`]?.events  ?? null,
    };
    const glRng = makeRng(section.seed ^ 0xC0FF);
    applyGrooveLock(glTrackEvts, bp.meta, glRng);
  }

  // ── Ensemble ───────────────────────────────────────────────────
  if (section.instruments.ensemble.active) {
    const ckey = `${sectionId}:ensemble`;
    const inst = section.instruments.ensemble;
    if (!(inst.locked && AppState.cache.sm[ckey])) {
      try {
        const seed = inst.seed ^ SM_SALT.ensemble;
        const res = generateEnsemble(bp, seed);
        const flatEvts = [];
        res.voiceEvents.forEach((evts, vi) => {
          humanize(evts, bp.meta.ppq, humAmt * 0.3, res.channels[vi], seed + 5 + vi, bp.meta.barTicks);
          applySwing(evts, bp.meta.ppq, bp.meta.swing ?? 0);
          flatEvts.push(...evts.map(e => ({ ...e, channel: res.channels[vi], program: res.programs[vi] ?? res.program })));
        });
        AppState.cache.sm[ckey] = { events: flatEvts, voiceEvents: res.voiceEvents, channels: res.channels, programs: res.programs };
      } catch (ensErr) {
        console.error('[SM] generateEnsemble error:', ensErr);
      }
    }
    const cached = AppState.cache.sm[ckey];
    if (cached?.voiceEvents) {
      cached.voiceEvents.forEach((evts, vi) => {
        // filtra solo eventi nota (esclude CC che SynthPreview ignora già)
        const noteEvts = evts.filter(e => e.cc == null);
        if (noteEvts.length)
          voices.push({ channel: cached.channels[vi], events: noteEvts, program: cached.programs?.[vi] });
      });
    }
  }

  return { bp, voices };
}

/** Invalida la cache di una sezione (o di tutti gli strumenti non locked). */
function smInvalidateCache(sectionId, instrument = null) {
  if (instrument) {
    delete AppState.cache.sm[`${sectionId}:${instrument}`];
  } else {
    const section = AppState.session.manager?.getSection(sectionId);
    if (!section) return;
    for (const inst of Object.keys(section.instruments)) {
      if (!section.instruments[inst].locked) delete AppState.cache.sm[`${sectionId}:${inst}`];
    }
  }
}

window.smRegenerateSection = sectionId => {
  smInvalidateCache(sectionId);
  AppState.session.manager?.mutateSeed(sectionId);
  // Bug fix: mutateSeed() cambia solo il seed di SEZIONE, usato per
  // rigenerare armonia/blueprint (buildSectionBlueprint) — ma batteria,
  // basso, chitarra, piano ed ensemble leggono ciascuno il proprio
  // section.instruments[inst].seed (fissato una volta alla creazione
  // della sezione), che mutateSeed() non toccava. Risultato: il tasto
  // "rigenera sezione" cambiava gli accordi ma lasciava quasi identica
  // l'esecuzione (stesso pattern ritmico/voicing) — da ascolto sembrava
  // non aver fatto nulla. Ora si muta anche il seed di ogni strumento
  // non locked, come promesso dal tooltip del bottone.
  const _secForSeed = AppState.session.manager?.getSection(sectionId);
  if (_secForSeed) {
    for (const inst of Object.keys(_secForSeed.instruments)) {
      if (!_secForSeed.instruments[inst].locked) AppState.session.manager.mutateInstrumentSeed(sectionId, inst);
    }
  }
  smRender();
  smToast('🔄 Sezione rigenerata: nuova armonia ed esecuzione per tutti gli strumenti sbloccati.');
  // Ricarica cache in background per aggiornare i pattern dots nel flyout/panel
  smGenerateSection(sectionId).then(() => {
    const section = AppState.session.manager?.getSection(sectionId);
    if (!section) return;
    // Aggiorna flyout se aperto su questa sezione
    const flyPanel = document.getElementById('sm-flyout-panel');
    if (flyPanel && AppState.ui.flyoutOpen?.sectionId === sectionId) {
      flyPanel.innerHTML = ''; smBuildPanelContent(sectionId, section, flyPanel);
    }
    // Aggiorna pannello fisso se espanso
    const panelEl = document.getElementById(`sm-panel-${sectionId}`);
    if (panelEl && AppState.ui.expanded.has(sectionId)) {
      panelEl.innerHTML = ''; smBuildPanelContent(sectionId, section, panelEl);
    }
    // Aggiorna chord track (harmonicMap aggiornata dalla rigenerazione)
    smRenderChordTrack();
  }).catch(() => { });
};

// Stato mixer — override programma MIDI per strumento (usato in export)
window._smMixerOverride = { drums: 'auto', bass: 'auto', guitar: 'auto', piano: 'auto', ensemble: 'auto' };

window.smMixerSetOverride = (inst, val) => {
  window._smMixerOverride[inst] = val;
};

// ── Chord Track editor state ──────────────────────────────────────
// { sectionId, chordIndex } | null — AppState.ui.chipEditing → AppState.ui.chipEditing

// Note names per il chip editor (root select)
const CHIP_ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
// Quality label → suffisso stringa accordo
const CHIP_QUALITIES = [
  { label: 'maj', val: '' },
  { label: 'min', val: 'm' },
  { label: '7', val: '7' },
  { label: 'maj7', val: 'maj7' },
  { label: 'min7', val: 'm7' },
  { label: 'dim', val: 'dim' },
  { label: 'aug', val: 'aug' },
  { label: 'sus2', val: 'sus2' },
  { label: 'sus4', val: 'sus4' },
  { label: 'dom9', val: '9' },
  { label: 'add9', val: 'add9' },
];

/**
 * Apre/chiude un pannello collassabile.
 * @param {string} bodyId   — ID del div contenuto
 * @param {string} arrowId  — ID dell'indicatore ▸/▾
 * @param {boolean} [force] — se true, forza sempre aperto
 */
window.smToggleCollapse = (bodyId, arrowId, force = null) => {
  const body = document.getElementById(bodyId);
  const arrow = document.getElementById(arrowId);
  if (!body) return;
  const open = force !== null ? force : body.style.display === 'none';
  body.style.display = open ? 'block' : 'none';
  if (arrow) arrow.textContent = open ? '▾' : '▸';
};

/**
 * Importa un SongBlueprint (da gen()) nel SessionManager.
 * Sostituisce le sezioni esistenti con quelle del blueprint.
 * Preserva key/bpm/style dalla composer-bar.
 */
export function smImportFromBlueprint(bp) {
  if (!bp?.sections?.length) return;
  // Sincronizza meta dalla composer-bar se non già aggiornata
  const key = bp.meta.key;
  const bpm = bp.meta.bpm;
  const style = bp.meta.style;
  // Aggiorna selects nella composer-bar
  const keyEl = document.getElementById('sm-key');
  const bpmEl = document.getElementById('sm-bpm');
  const bpmVEl = document.getElementById('sm-bpm-v');
  const styleEl = document.getElementById('sm-style');
  if (keyEl) { keyEl.value = key; }
  if (bpmEl) { bpmEl.value = bpm; if (bpmVEl) bpmVEl.textContent = bpm; }
  if (styleEl) {
    // Cerca opzione corrispondente (fallback: lascia invariato)
    for (const opt of styleEl.options) { if (opt.value === style) { styleEl.value = style; break; } }
  }

  if (!AppState.session.manager) {
    AppState.session.manager = new SessionManager({ key, bpm, style });
  } else {
    AppState.session.manager.setMeta({ key, bpm, style });
  }

  // Bug fix: prima questa rigenerazione smontava le sezioni una per una
  // con removeSection()/setSectionProgression() (ognuna salva il proprio
  // snapshot di undo) — un solo "Genera" poteva riempire la cronologia
  // undo con stati intermedi del rebuild. Cliccare "↩ Annulla" subito
  // dopo un Genera restituiva uno di questi stati a metà smontaggio
  // invece del brano precedente, sembrando cancellare sezioni senza
  // motivo. replaceAllSections() salva un solo snapshot per l'intera
  // rigenerazione: "↩ Annulla" ora torna correttamente al brano
  // precedente per intero.
  const sectionSpecs = bp.sections.map(sec => {
    // Progressione flat dedotta dall'harmonicMap (accordi unici per bar)
    const seen = [], barTicks = bp.meta.barTicks;
    for (const r of sec.harmonicMap) {
      if (r.start_tick % barTicks !== 0) continue;
      if (!seen.length || seen[seen.length - 1] !== r.chord) seen.push(r.chord);
    }
    return { type: sec.type, bars: sec.bars, seed: bp.meta.seed, progression: seen };
  });
  AppState.session.manager.replaceAllSections(sectionSpecs);

  AppState.ui.flyoutOpen = null;
  AppState.ui.expanded.clear();
  smRender();
}

// ── Toast di supporto (Ko-fi) ─────────────────────────────────────
// Notifica leggera e non bloccante, mostrata ogni 10 generazioni o
// ogni 5 download (MIDI, CRD o Markdown — contano tutti insieme).
// I contatori sono persistiti in localStorage: sopravvivono al
// refresh della pagina, così l'invito arriva anche a chi la usa
// per sessioni brevi e ripetute nel tempo.
const SM_SUPPORT_THRESHOLDS = { generate: 10, download: 5 };
const SM_SUPPORT_STORAGE_KEY = { generate: 'sumidi_generate_count', download: 'sumidi_download_count' };

export function smBumpSupportCounter(kind) {
  const storageKey = SM_SUPPORT_STORAGE_KEY[kind];
  const threshold = SM_SUPPORT_THRESHOLDS[kind];
  let count = 0;
  try {
    count = parseInt(localStorage.getItem(storageKey), 10) || 0;
  } catch { /* localStorage non disponibile (es. modalità privata): il contatore resta a 0, nessun toast */ }
  count += 1;
  try {
    localStorage.setItem(storageKey, String(count));
  } catch { /* vedi sopra */ }
  if (count % threshold === 0) {
    const label = kind === 'generate' ? 'brani generati' : 'file scaricati';
    smShowSupportToast(`Hai già creato ${count} ${label} con suMidi! Se ti è utile, offrimi un caffè su Ko-fi ☕`);
  }
}

function smShowSupportToast(message) {
  let wrap = document.getElementById('sm-toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'sm-toast-wrap';
    wrap.className = 'sm-toast-wrap';
    document.body.appendChild(wrap);
  }
  const toast = document.createElement('div');
  toast.className = 'sm-toast';
  toast.innerHTML = `
        <span class="sm-toast-icon">☕</span>
        <div class="sm-toast-body">
          <p>${message}</p>
          <a href="https://ko-fi.com/johnwhale" target="_blank" rel="noopener noreferrer">ko-fi.com/johnwhale</a>
        </div>
        <button class="sm-toast-close" title="Chiudi" aria-label="Chiudi">✕</button>`;
  wrap.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('sm-toast-in'));

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    toast.classList.remove('sm-toast-in');
    setTimeout(() => toast.remove(), 250);
  };
  toast.querySelector('.sm-toast-close').onclick = dismiss;
  setTimeout(dismiss, 8000);
}

/**
 * Toast leggera generica (senza link Ko-fi) per conferme rapide, es.
 * "sezione rigenerata". Riusa lo stesso stack/stile di smShowSupportToast
 * ma con corpo semplice e durata più breve (2.5s).
 */
function smToast(message, { icon = '✓', duration = 2500 } = {}) {
  let wrap = document.getElementById('sm-toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'sm-toast-wrap';
    wrap.className = 'sm-toast-wrap';
    document.body.appendChild(wrap);
  }
  const toast = document.createElement('div');
  toast.className = 'sm-toast sm-toast-simple';
  toast.innerHTML = `
        <span class="sm-toast-icon">${icon}</span>
        <div class="sm-toast-body"><p>${message}</p></div>
        <button class="sm-toast-close" title="Chiudi" aria-label="Chiudi">✕</button>`;
  wrap.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('sm-toast-in'));

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    toast.classList.remove('sm-toast-in');
    setTimeout(() => toast.remove(), 250);
  };
  toast.querySelector('.sm-toast-close').onclick = dismiss;
  setTimeout(dismiss, duration);
}

// Ogni stile ha una scala fissa (STYLES[style].defaultScale) usata SEMPRE
// per costruire progressione e pool di note, indipendentemente dal fatto
// che la Tonalità scelta sia elencata come "Minori" o "Maggiori" in UI —
// quel menu sceglie solo la tonica (root) e trasporrà su quella scala.
// Qui mostriamo la scala reale accanto al selettore Stile per chiarezza.
const SCALE_LABELS = {
  major:      'Maggiore',
  minor:      'Minore',
  dorian:     'Dorico',
  mixolydian: 'Misolidio',
  blues:      'Blues',
};

// Dal 2026-08-24 (A4, "Pool nel modo mancante") tutti e 13 gli stili hanno
// pool scritti sia a tonica maggiore che minore (MODE_AWARE_FAMILIES in
// SongArchitect.js) — la Tonalità scelta pilota davvero il modo per tutti,
// non solo per i 7 storici. Restano due eccezioni sulla SCALA (non sul
// pool, che segue comunque la tonalità per entrambe le liste):
//  - blues_rock: la scala resta sempre 'blues' in entrambi i modi (è già
//    strutturalmente "minore" e idiomatica su tonica sia maggiore che
//    minore — sostituirla toglierebbe la blue note).
//  - neo_soul/lo_fi: restano nel colore dorico per le richieste in
//    tonalità minore (caratteristico dello stile, non un bug); solo il
//    maggiore diventa 'major'.
// Trovato il 2026-08-28: l'etichetta qui sotto non era mai stata
// aggiornata dopo A4 — jazz_ballad/unplugged/cinematic mostravano sempre
// il loro STYLES[style].defaultScale statico (rispettivamente Maggiore/
// Minore/Minore) anche quando la tonalità scelta faceva usare l'altra
// scala al motore. Verificato su buildSong() prima di correggere.
const SCALE_FIXED_STYLES = new Set(['blues_rock']);
const DORIAN_ON_MINOR_STYLES = new Set(['neo_soul', 'lo_fi']);

function _smUpdateScaleHint() {
  const hintEl = document.getElementById('sm-scale-hint');
  if (!hintEl) return;
  const style = document.getElementById('sm-style').value;

  if (SCALE_FIXED_STYLES.has(style)) {
    const scale = STYLES[style]?.defaultScale;
    hintEl.textContent = scale ? `Scala: ${SCALE_LABELS[scale] ?? scale}` : '';
    return;
  }

  const isMinor = document.getElementById('sm-key').value.endsWith('m');
  const scaleKey = DORIAN_ON_MINOR_STYLES.has(style)
    ? (isMinor ? 'dorian' : 'major')
    : (isMinor ? 'minor' : 'major');
  hintEl.textContent = `Scala: ${SCALE_LABELS[scaleKey]} (segue la tonalità)`;
}

// ── Tonalità sempre libere ────────────────────────────────────────
// Fino al 2026-08-20 questa funzione restringeva le tonalità selezionabili
// per gli stili non mode-aware. Il vincolo era un limite auto-imposto dal
// motore, non di teoria musicale: serviva a nascondere il fatto che con la
// qualità "sbagliata" il brano usciva internamente incoerente.
//
// Due ragioni per rimuoverlo:
//  1. Decisione di prodotto: nessun genere deve vincolare la tonalità.
//  2. Non ha mai funzionato comunque. Leggeva `g.options` su elementi
//     <optgroup>, ma `.options` esiste solo su <select>: `Array.from(undefined)`
//     lanciava un TypeError ad ogni caricamento, interrompendo smInit() prima
//     di creare il SessionManager e lasciando smSyncMeta() inerte.
//
// L'incoerenza che il vincolo mascherava è stata corretta alla radice in
// SongArchitect.js (allineamento fra tonalità degli accordi e keyScaleNotes).
// La funzione resta come unico punto in cui garantire che nessun optgroup
// sia rimasto nascosto o disabilitato da stati precedenti.

function _smApplyKeyConstraint() {
  const keySel = document.getElementById('sm-key');
  if (!keySel) return;
  keySel.querySelectorAll('optgroup').forEach(g => { g.hidden = false; });
  keySel.querySelectorAll('option').forEach(o => { o.disabled = false; });
}

// ── B4 di PLAN37 — persistenza della sessione ─────────────────────
// Con B1 il brano *generato* torna da solo: bastano i quattro parametri
// dell'URL. Un arrangiamento costruito a mano no — sezioni aggiunte,
// personaggi scelti, progressioni custom sul chord track, strumenti mutati
// per lane vivevano solo finché la scheda restava aperta.
// Due livelli: autosave in localStorage (rete di sicurezza, uno slot solo,
// rispecchia ciò che è a schermo) e file .sumidi.json (il salvataggio vero,
// e il formato con cui si condivide un progetto o si allega un bug).
// La serializzazione e la validazione stanno in SessionStore.js, senza DOM.

let _smAutosaveTimer = null;

// Autosave sospeso: serve quando la pagina e' stata aperta da un link con un
// brano (B1). Quel brano e' gia' ricostruibile dai quattro parametri dell'URL,
// quindi non ha bisogno di essere salvato — e salvarlo cancellerebbe
// l'arrangiamento in corso di chi il link lo ha soltanto aperto, senza aver
// toccato niente. Riprende appena la generazione dal link e' finita: da li' in
// poi si sta lavorando davvero su quel brano, e le modifiche vanno protette.
let _smAutosaveSospeso = false;

/** Riattiva l'autosave dopo la generazione iniziale da un link. */
window.smRiattivaAutosave = () => { _smAutosaveSospeso = false; };

/** localStorage, o null dove il solo accedervi lancia (modalità privata, iframe). */
function _smStorage() {
  try { return window.localStorage; } catch { return null; }
}

/**
 * Salva l'arrangiamento corrente. Chiamata a ogni render: le scritture
 * ravvicinate (trascinare uno slider ne produce decine) vengono raggruppate,
 * e una sessione vuota non viene mai salvata — aprire la pagina non deve
 * cancellare il lavoro di ieri prima ancora che si tocchi qualcosa.
 */
function _smAutosave() {
  if (_smAutosaveSospeso) return;
  if (!AppState.session.manager?.getSections().length) return;
  clearTimeout(_smAutosaveTimer);
  _smAutosaveTimer = setTimeout(() => {
    const st = _smStorage();
    if (!st) return;
    salvaAutosave(st, costruisciSalvataggio(AppState.session.manager.toJSON(), AppState.session.solo));
  }, 400);
}

/**
 * Carica nell'app una sessione già validata e ridisegna tutto.
 * @param {object} sessione — stato del SessionManager
 * @param {object|null} solo — stato di Solo Mode, se presente
 */
function _smApplicaSessione(sessione, solo) {
  AppState.session.manager = SessionManager.fromJSON(sessione);
  AppState.session.crossMemory = new CrossSectionMemory();
  AppState.clearCache();
  AppState.ui.flyoutOpen = null;
  AppState.ui.expanded.clear();
  if (solo) {
    // Object.assign e non una riassegnazione: Session.js tiene un alias su
    // questo oggetto (v. O6 in AppState.js). `active` resta false perché la
    // visibilità di Solo Mode la decide smToggleSoloMode toccando il DOM, non
    // il render: ripristinarla a true lascerebbe pannello e lanes visibili
    // insieme. Si ritrova comunque strumento, personaggio, stile e seed.
    Object.assign(AppState.session.solo, solo, { active: false, playing: false });
  }

  // La composer bar deve dire la verità su ciò che è stato caricato.
  const keyEl = document.getElementById('sm-key');
  const bpmEl = document.getElementById('sm-bpm');
  const bpmVEl = document.getElementById('sm-bpm-v');
  const styleEl = document.getElementById('sm-style');
  if (keyEl && Array.from(keyEl.options).some(o => o.value === sessione.key)) keyEl.value = sessione.key;
  if (bpmEl) { bpmEl.value = String(sessione.bpm); if (bpmVEl) bpmVEl.textContent = String(sessione.bpm); }
  if (styleEl && Array.from(styleEl.options).some(o => o.value === sessione.style)) styleEl.value = sessione.style;
  window.smSyncForms?.();
  _smUpdateScaleHint();
  smRender();
}

/** Salva il progetto in un file .sumidi.json. */
window.smExportProject = () => {
  if (!AppState.session.manager?.getSections().length) {
    smToast('Non c’è ancora niente da salvare: genera un brano o aggiungi una sezione.', { icon: '⚠️' });
    return;
  }
  const dati = costruisciSalvataggio(AppState.session.manager.toJSON(), AppState.session.solo);
  const blob = new Blob([JSON.stringify(dati, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeFileProgetto(dati.sessione);
  a.click();
  URL.revokeObjectURL(url);
  smToast('Progetto salvato.', { icon: '💾' });
  smBumpSupportCounter('download');
};

/** Apre il selettore di file per l'import del progetto. */
window.smImportProject = () => document.getElementById('sm-project-file')?.click();

/** Legge il file scelto e, se è un progetto valido, lo carica. */
window.smImportProjectFile = async ev => {
  const file = ev.target.files?.[0];
  ev.target.value = '';   // così riscegliere lo stesso file fa scattare di nuovo change
  if (!file) return;
  let dati;
  try {
    dati = JSON.parse(await file.text());
  } catch {
    smToast('Il file non è un JSON leggibile.', { icon: '❌', duration: 4000 });
    return;
  }
  const esito = validaSalvataggio(dati);
  if (!esito.ok) {
    smToast(esito.errore, { icon: '❌', duration: 4000 });
    return;
  }
  _smApplicaSessione(esito.sessione, esito.solo);
  smToast('Progetto caricato.', { icon: '📂' });
};

/** Bootstrap di Session Mode — chiamato da main.js all'avvio della pagina. */
export function smInit({ ripristina = true } = {}) {
  AppState.ui.flyoutOpen = null;
  _smAutosaveSospeso = !ripristina;
  _smApplyKeyConstraint();

  // Un autosave valido viene ripristinato — a meno che l'URL non porti un
  // brano preciso (B1): un link condiviso deve far sentire quel brano, non
  // l'arrangiamento rimasto sul computer di chi lo apre.
  if (ripristina) {
    const st = _smStorage();
    const esito = st ? leggiAutosave(st) : null;
    if (esito?.ok) {
      _smApplicaSessione(esito.sessione, esito.solo);
      smToast('Ripresa la sessione precedente.', { icon: '↩' });
      return;
    }
  }

  AppState.session.manager = new SessionManager({
    key: document.getElementById('sm-key').value,
    bpm: parseInt(document.getElementById('sm-bpm').value),
    style: document.getElementById('sm-style').value,
  });
  window.smSyncForms?.();
  _smUpdateScaleHint();
  smRender();
}

window.smSyncMeta = () => {
  if (!AppState.session.manager) return;
  _smApplyKeyConstraint();
  window.smSyncForms?.();   // A2: le forme disponibili dipendono dallo stile
  AppState.session.manager.setMeta({
    key: document.getElementById('sm-key').value,
    bpm: parseInt(document.getElementById('sm-bpm').value),
    style: document.getElementById('sm-style').value,
  });
  _smUpdateScaleHint();
};

window.smAddSection = type => {
  if (!AppState.session.manager) smInit();
  AppState.session.manager.addSection(type);
  smRender();
};

window.smRemoveSection = id => {
  AppState.session.manager.removeSection(id);
  smRender();
};

window.smMutateSeed = id => {
  AppState.session.manager.mutateSeed(id);
  smRender();
};

window.smLockSeed = (id, locked) => {
  AppState.session.manager.lockSection(id, locked);
  smRender();
};

window.smSetProgression = (id, val) => {
  const prog = val.trim() ? val.trim().split(/\s+/) : null;
  if (AppState.session.manager) AppState.session.manager.setSectionProgression(id, prog);
  smInvalidateCache(id);
  smRender();
};

window.smMoveSection = (id, dir) => {
  AppState.session.manager.moveSection(id, dir);
  smRender();
};

// ── Chord Track ───────────────────────────────────────────────────

// F4: progressioni di fallback per sezioni aggiunte manualmente senza genera
const CHORD_DEFAULTS_BY_TYPE = {
  intro: ['C', 'G', 'Am', 'F'],
  verse: ['Am', 'F', 'C', 'G'],
  chorus: ['F', 'G', 'C', 'Am'],
  bridge: ['Dm', 'Am', 'G', 'C'],
  outro: ['C', 'G', 'Am', 'F'],
  pre_chorus: ['Em', 'F', 'G', 'G'],
};

/**
 * Deriva la progressione visibile di una sezione.
 * Se la sezione ha una progressione custom usa quella; altrimenti legge
 * la prima half-bar di ogni bar dall'harmonicMap cachata nel AppState.cache.bp.
 */
function _smGetSectionChords(sectionId) {
  const section = AppState.session.manager?.getSection(sectionId);
  if (!section) return [];
  if (section.progression?.length) return section.progression;
  // Ricava dall'harmonicMap cachata (un accordo per bar, deduplicato consecutivi)
  const bp = AppState.cache.bp[`${sectionId}:_bp`];
  if (!bp) return [];
  const seen = new Set();
  const chords = [];
  for (const r of bp.sections[0].harmonicMap) {
    if (r.start_tick % (bp.meta.barTicks ?? (bp.meta.ppq * 4)) !== 0) continue;
    if (!seen.has(r.chord)) { seen.add(r.chord); chords.push(r.chord); }
  }
  return chords;
}

/** Popola la riga chord-track in base alle sezioni correnti. */
// F1 fix: layout pixel-per-sezione salvato ad ogni render, riusato dal playhead
// (le sezioni corte hanno un floor di 40px che le allarga oltre la loro durata reale:
// il playhead deve muoversi secondo QUESTA larghezza, non una proporzione lineare del tempo).
let _smChordTrackLayout = []; // [{ startTick, endTick, pxStart, pxWidth }]

function smRenderChordTrack() {
  const trackEl = document.getElementById('sm-chord-track');
  if (!trackEl || !AppState.session.manager) return;
  const secs = AppState.session.manager.getSections();
  if (!secs.length) { trackEl.innerHTML = ''; _smChordTrackLayout = []; return; }

  const totalBars = secs.reduce((s, sec) => s + sec.bars, 0);
  const AVAIL = Math.max(400, Math.min(1100, window.innerWidth - 200));
  const PX_PER_BAR = Math.max(6, Math.min(22, AVAIL / totalBars));

  let html = `<div class="chord-track-spacer"></div><div class="chord-track-blocks">`;

  const barTicksLocal = 480 * 4; // ppq=480, 4/4 — invariante nel resto del codice
  let pxCursor = 0, tickCursor = 0;
  _smChordTrackLayout = [];

  secs.forEach(sec => {
    const w = Math.max(40, Math.round(sec.bars * PX_PER_BAR));
    const secTicks = sec.bars * barTicksLocal;
    _smChordTrackLayout.push({ startTick: tickCursor, endTick: tickCursor + secTicks, pxStart: pxCursor, pxWidth: w });
    pxCursor += w + 3; // 3px = gap di .chord-track-blocks
    tickCursor += secTicks;
    const chords = _smGetSectionChords(sec.id);
    const isCustom = !!(sec.progression?.length);
    let chips;

    if (chords.length === 0) {
      // F4: sezione senza progressione — placeholder per impostare accordi
      chips = `<button class="chord-chip chord-chip-empty"
                        onclick="smChipInitSection('${sec.id}')"
                        title="Imposta progressione iniziale">♩ accordi</button>`;
    } else {
      // F3: chip largo in proporzione a quanto dura l'accordo, non al loro
      // numero. Da A1/A4 una voce puo' durare mezza battuta o quattro: con la
      // larghezza uguale per tutti, un accordo di due battute sembrava lungo
      // come uno di mezza. La durata sta nella coppia [nome, battute]; la
      // stringa nuda vale una battuta.
      const durate = chords.map(voce => (Array.isArray(voce) ? (voce[1] ?? 1) : 1));
      const totale = durate.reduce((a, b) => a + b, 0) || 1;
      chips = chords.map((voce, ci) => {
        // nomeAccordo, non la voce: la coppia stampata come stringa dava
        // "Dm7,0.5" a video — la trappola descritta in ChordTheory.js.
        const chord  = nomeAccordo(voce);
        const chipW  = Math.max(22, Math.floor((w * durate[ci]) / totale) - 3);
        const isEdit = AppState.ui.chipEditing?.sectionId === sec.id && AppState.ui.chipEditing?.chordIndex === ci;
        const durata = durate[ci] === 1 ? '' : ` · ${durate[ci]} battute`;
        return `<div style="position:relative;display:inline-block">
          <button class="chord-chip${isCustom ? ' custom' : ''}${isEdit ? ' editing' : ''}"
                  style="width:${chipW}px;min-width:${chipW}px;"
                  title="${chord}${durata}"
                  onclick="smChipClick('${sec.id}',${ci})">${chord}</button>
          ${isEdit ? _buildChipEditor(sec.id, ci, chord, chords) : ''}
        </div>`;
      }).join('');

      // Bottone + sempre visibile (converte in custom se ancora auto)
      chips += `<button class="chord-chip chord-chip-add" title="Aggiungi accordo"
                        onclick="smChipAdd('${sec.id}')">+</button>`;

      // Reset solo su progressioni custom
      if (isCustom) {
        chips += `<button class="chord-chip chord-chip-add" title="Reset progressione automatica"
                          onclick="smChipReset('${sec.id}')" style="font-size:8px">🔄 Auto</button>`;
      }
    }

    html += `<div class="chord-sec-block" style="width:${w}px;flex-wrap:wrap;gap:3px;padding-bottom:2px">
      ${chips}
    </div>`;
  });

  html += `</div>`;
  trackEl.innerHTML = html;
}

/** Costruisce l'HTML del micro-editor per un chip (S21: slash chord support). */
function _buildChipEditor(sectionId, chordIndex, currentChord, allChords) {
  const parsed = parseChord(currentChord) ?? { root: 'C', qualityStr: '' };
  // Supporto slash chord: parseChord ritorna { bassNote } se c'è /
  const bassNote = parsed.bassNote ?? null;
  const rootSel = CHIP_ROOTS.map(r =>
    `<option${r === parsed.root ? ' selected' : ''}>${r}</option>`
  ).join('');
  const qualSel = CHIP_QUALITIES.map(q =>
    `<option value="${q.val}"${q.val === parsed.qualityStr ? ' selected' : ''}>${q.label}</option>`
  ).join('');
  // Select per nota bassa (slash chord)
  const bassSel = `<select id="ce-bass-${sectionId}-${chordIndex}" style="flex:1">
    <option value="">—</option>
    ${CHIP_ROOTS.map(r => `<option${r === bassNote ? ' selected' : ''}>${r}</option>`).join('')}
  </select>`;

  return `<div class="chip-editor" onclick="event.stopPropagation()">
    <div class="chip-editor-row">
      <label>Nota</label>
      <select id="ce-root-${sectionId}-${chordIndex}">${rootSel}</select>
    </div>
    <div class="chip-editor-row">
      <label>Qualità</label>
      <select id="ce-qual-${sectionId}-${chordIndex}">${qualSel}</select>
    </div>
    <div class="chip-editor-row slash-row">
      <span class="chip-editor-slash">/</span>
      ${bassSel}
      <label style="width:auto;font-size:8px;color:var(--muted)">Bassa</label>
    </div>
    <div class="chip-editor-actions">
      <button class="apply" onclick="smChipApply('${sectionId}',${chordIndex})">✓ Applica</button>
      <button class="del"   onclick="smChipDelete('${sectionId}',${chordIndex})" ${allChords.length <= 1 ? 'disabled' : ''}>✕</button>
      <button class="reset" onclick="smChipClose()">Annulla</button>
    </div>
  </div>`;
}

/**
 * Tiene il popup .chip-editor dentro i confini dello schermo. È
 * position:absolute/left:0 rispetto al blocco della sezione (non del
 * singolo chip), largo almeno 180px: su mobile, aprendolo su un accordo
 * verso il bordo destro dello schermo, sfora fuori dal viewport e si
 * sovrappone/taglia con il resto della UI (segnalato come bottoni che
 * si accavallano). Nessun clamp esisteva prima — qui si misura dopo il
 * render e, se sfora a destra, si ancora invece al bordo destro del suo
 * contenitore (si apre verso sinistra invece che verso destra).
 */
function _smClampChipEditor() {
  const el = document.querySelector('.chip-editor');
  if (!el) return;
  el.style.left = '';
  el.style.right = '';
  if (el.getBoundingClientRect().right > window.innerWidth) {
    el.style.left = 'auto';
    el.style.right = '0';
  }
  // Su schermi molto stretti, anche ancorato a destra potrebbe sforare a
  // sinistra (popup più largo del contenitore): in quel caso si tiene
  // semplicemente incollato al bordo sinistro dello schermo.
  if (el.getBoundingClientRect().left < 0) {
    const shift = el.getBoundingClientRect().left;
    el.style.left = 'auto';
    el.style.right = `${parseFloat(el.style.right || '0') + shift}px`;
  }
}

// Apre/chiude il micro-editor per un chip
window.smChipClick = (sectionId, chordIndex) => {
  const isClosing = AppState.ui.chipEditing?.sectionId === sectionId && AppState.ui.chipEditing?.chordIndex === chordIndex;
  AppState.ui.chipEditing = isClosing ? null : { sectionId, chordIndex };
  smRenderChordTrack();
  if (!isClosing) requestAnimationFrame(_smClampChipEditor);
};

window.smChipClose = () => { AppState.ui.chipEditing = null; smRenderChordTrack(); };

// Applica la modifica dell'editor al chip
window.smChipApply = (sectionId, chordIndex) => {
  const section = AppState.session.manager?.getSection(sectionId);
  if (!section) return;
  const root = document.getElementById(`ce-root-${sectionId}-${chordIndex}`)?.value ?? 'C';
  const qual = document.getElementById(`ce-qual-${sectionId}-${chordIndex}`)?.value ?? '';
  const bass = document.getElementById(`ce-bass-${sectionId}-${chordIndex}`)?.value;
  const newChord = root + qual + (bass ? '/' + bass : '');

  // Clona la progressione (o costruiscila dall'auto se era la prima modifica custom)
  const baseChords = section.progression?.length
    ? [...section.progression]
    : _smGetSectionChords(sectionId);
  // Cambiare l'accordo non deve accorciarlo: se durava due battute (o mezza),
  // continua a durarle. Prima il nome nuovo sostituiva la coppia intera e la
  // sezione si sfasava.
  const precedente = baseChords[chordIndex];
  baseChords[chordIndex] = Array.isArray(precedente)
    ? [newChord, precedente[1]]
    : newChord;

  AppState.session.manager.setSectionProgression(sectionId, baseChords);
  smInvalidateCache(sectionId);
  AppState.ui.chipEditing = null;
  smRenderChordTrack();
};

// Aggiunge un accordo alla fine della progressione custom
window.smChipAdd = sectionId => {
  const section = AppState.session.manager?.getSection(sectionId);
  if (!section) return;
  const base = section.progression?.length
    ? [...section.progression]
    : _smGetSectionChords(sectionId);
  base.push('C');
  AppState.session.manager.setSectionProgression(sectionId, base);
  smInvalidateCache(sectionId);
  smRenderChordTrack();
};

// F4: imposta progressione di default per sezione aggiunta senza genera
window.smChipInitSection = sectionId => {
  const section = AppState.session.manager?.getSection(sectionId);
  if (!section) return;
  const def = CHORD_DEFAULTS_BY_TYPE[section.type] ?? ['C', 'G', 'Am', 'F'];
  AppState.session.manager.setSectionProgression(sectionId, [...def]);
  smRenderChordTrack();
};

// Elimina un chip dalla progressione custom
window.smChipDelete = (sectionId, chordIndex) => {
  const section = AppState.session.manager?.getSection(sectionId);
  if (!section) return;
  const base = section.progression?.length
    ? [...section.progression]
    : _smGetSectionChords(sectionId);
  if (base.length <= 1) return;
  base.splice(chordIndex, 1);
  AppState.session.manager.setSectionProgression(sectionId, base);
  smInvalidateCache(sectionId);
  AppState.ui.chipEditing = null;
  smRenderChordTrack();
};

// Reset alla progressione automatica
window.smChipReset = sectionId => {
  AppState.session.manager?.setSectionProgression(sectionId, null);
  smInvalidateCache(sectionId);
  AppState.ui.chipEditing = null;
  smRenderChordTrack();
};

// Stato flyout lanes: { sectionId, inst } | null — AppState.ui.flyoutOpen → AppState.ui.flyoutOpen

const LANE_INSTS = ['drums', 'bass', 'guitar', 'piano', 'ensemble'];
const LANE_ICONS = {
  drums: '<img src="img/icons_instruments/player_drums.png"   alt="Drums"   class="inst-icon">',
  bass: '<img src="img/icons_instruments/player_bass.png"    alt="Bass"    class="inst-icon">',
  guitar: '<img src="img/icons_instruments/player_guitar_acoustic.png" alt="Guitar" class="inst-icon">',
  piano: '<img src="img/icons_instruments/player_piano_classical.png" alt="Piano"  class="inst-icon">',
  ensemble: '<img src="img/icons_instruments/player_strings_small.png"   alt="Ens"    class="inst-icon">'
};
const LANE_LABELS = { drums: 'Drums', bass: 'Bass', guitar: 'Guitar', piano: 'Piano', ensemble: 'Ens' };

function smRender() {
  if (!AppState.session.manager) return;
  _smAutosave();
  const secs = AppState.session.manager.getSections();
  const n = secs.length;

  // "sezionei" era il plurale che usciva da `sezione${n !== 1 ? 'i' : ''}`.
  document.getElementById('sm-count').textContent = n === 1 ? '1 sezione' : `${n} sezioni`;

  if (_smSolo.active) {
    // Solo Mode sostituisce la vista Arrangement (lanes/flyout restano
    // nascosti): qui basta rinfrescare il suo pannello, la progressione
    // può essere cambiata (nuova generazione, sezione aggiunta/rimossa).
    _smRenderSoloPanel();
    return;
  }

  const emptyEl = document.getElementById('sm-empty');
  const wrapEl = document.getElementById('sm-lanes-wrap');
  emptyEl.style.display = n ? 'none' : 'block';
  wrapEl.style.display = n ? 'block' : 'none';

  if (n === 0) return;

  // ── Calcolo larghezze proporzionali (min 50px, max 200px per bar) ─
  const totalBars = secs.reduce((s, sec) => s + sec.bars, 0);
  const AVAIL = Math.max(400, Math.min(1100, window.innerWidth - 200));
  const PX_PER_BAR = Math.max(6, Math.min(22, AVAIL / totalBars));

  // ── Header etichette sezione ────────────────────────────────────
  const headerEl = document.getElementById('sm-lanes-header');
  headerEl.innerHTML =
    `<div class="lanes-header-spacer"></div>` +
    secs.map(sec => {
      const w = Math.max(40, Math.round(sec.bars * PX_PER_BAR));
      const isSecFly = AppState.ui.flyoutOpen?.sectionId === sec.id && AppState.ui.flyoutOpen?.inst === null;
      const isPlayingThis = _smPlayback.active && _smPlayback.sectionId === sec.id;
      return `<div class="lanes-sec-label${isSecFly ? ' sm-cfg-open' : ''}${isPlayingThis ? ' sm-playing' : ''}"
           data-sec-id="${sec.id}" style="width:${w}px;cursor:pointer"
           title="${sec.label} · ${sec.bars} bars — clic per rigenerare o rimuovere l'intera sezione"
           onclick="smSectionFlyout('${sec.id}')">
        <button class="sm-sec-play-btn" onclick="smPlaySection('${sec.id}', event)"
          title="Ascolta questa sezione">${isPlayingThis ? '■' : '▶'}</button>
        ${sec.label}
      </div>`;
    }).join('');

  // ── Griglia lanes (5 strumenti) ─────────────────────────────────
  const gridEl = document.getElementById('sm-lanes-grid');
  gridEl.style.gridTemplateRows = `repeat(${LANE_INSTS.length}, 36px)`;
  gridEl.innerHTML = LANE_INSTS.map(inst => {
    const blocks = secs.map(sec => {
      const active = sec.instruments[inst]?.active ?? true;
      const w = Math.max(40, Math.round(sec.bars * PX_PER_BAR));
      const isFly = AppState.ui.flyoutOpen?.sectionId === sec.id && AppState.ui.flyoutOpen?.inst === inst;
      return `<div class="lane-block${active ? '' : ' inactive'}${isFly ? ' sm-cfg-open' : ''}"
               data-sectype="${sec.type}" data-inst="${inst}"
               style="width:${w}px"
               title="${sec.label} · ${LANE_LABELS[inst]}${active ? '' : ' (inattivo)'}"
               onclick="smLaneFlyout('${sec.id}','${inst}')">
               <button class="lane-mute-btn" title="${active ? 'Disattiva' : 'Riattiva'} ${LANE_LABELS[inst]} in questa sezione"
                 onclick="event.stopPropagation(); smToggleInstrumentActive('${sec.id}','${inst}')">${active ? '🔊' : '🔇'}</button>
               ${isFly ? '⚙' : ''}
             </div>`;
    }).join('');

    return `<div class="lane-row">
      <div class="lane-label">
        <span class="lane-label-icon">${LANE_ICONS[inst]}</span>
        <span>${LANE_LABELS[inst]}</span>
      </div>
      ${blocks}
    </div>`;
  }).join('');

  // ── Flyout ──────────────────────────────────────────────────────
  const flyoutEl = document.getElementById('sm-flyout');
  if (!AppState.ui.flyoutOpen || !AppState.session.manager.getSection(AppState.ui.flyoutOpen.sectionId)) {
    flyoutEl.style.display = 'none';
    AppState.ui.flyoutOpen = null;
  } else {
    const { sectionId, inst } = AppState.ui.flyoutOpen;
    const section = AppState.session.manager.getSection(sectionId);
    flyoutEl.style.display = 'block';
    if (inst === null) {
      // Flyout a livello di SEZIONE (aperto dall'header sopra le lanes):
      // qui vivono le azioni che riguardano l'intera sezione, non un singolo strumento.
      flyoutEl.innerHTML = `<div class="lane-flyout" data-inst="section">
      <div class="lane-flyout-header">
        <span class="lane-flyout-title">📁 ${section.label} — intera sezione (${section.bars} bars)</span>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="sm-icon-btn" title="Rigenera tutti gli strumenti non bloccati di questa sezione"
                  onclick="smRegenerateSection('${sectionId}')"${section.lockedSeed ? ' disabled' : ''}>🔄</button>
          <button class="sm-icon-btn" title="Rimuovi questa sezione dalla canzone"
                  onclick="smRemoveSection('${sectionId}')" style="color:var(--err)">×</button>
          <button class="lane-flyout-close" onclick="smCloseFlyout()">✕</button>
        </div>
      </div>
      <div style="padding:10px 12px;font-size:11px;color:var(--muted);line-height:1.5">
        🔄 rigenera batteria, basso, chitarra, piano ed ensemble insieme (nuovo seed per l'intera sezione).<br>
        × rimuove "${section.label}" dalla canzone.<br>
        Per modificare o rigenerare un solo strumento, clicca la sua lane qui sotto.
      </div>
    </div>`;
    } else {
      // Flyout a livello di STRUMENTO (aperto cliccando una lane): solo i controlli
      // di quel singolo strumento — le azioni sull'intera sezione vivono nell'header sopra.
      flyoutEl.innerHTML = `<div class="lane-flyout" data-inst="${inst}">
      <div class="lane-flyout-header">
        <span class="lane-flyout-title">${LANE_ICONS[inst]} ${LANE_LABELS[inst]} — ${section.label}</span>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="lane-flyout-close" onclick="smCloseFlyout()">✕</button>
        </div>
      </div>
      <div id="sm-flyout-panel"></div>
    </div>`;
      // Inietta il pannello strumento nell'area flyout (tab sull'inst cliccato)
      if (!AppState.ui.activeInst.has(sectionId)) AppState.ui.activeInst.set(sectionId, inst);
      else AppState.ui.activeInst.set(sectionId, inst);
      const panelEl = document.getElementById('sm-flyout-panel');
      smBuildPanelContent(sectionId, section, panelEl);
    }
  }

  // Nota: pannelli fissi (sm-panels-area) rimossi in S18 punto 8
  // Solo il flyout è attivo ora

  // Aggiorna il chord track e lo stato del bottone undo
  smRenderChordTrack();
  smUpdateUndoBtn();
}

/** Aggiorna lo stato disabled del bottone ↩ in base a canUndo(). */
function smUpdateUndoBtn() {
  const btn = document.getElementById('sm-undo-btn');
  if (btn) btn.disabled = !AppState.session.manager?.canUndo();
}

/** SC2: annulla ultima operazione distruttiva. */
window.smUndo = () => {
  if (!AppState.session.manager?.canUndo()) return;
  AppState.session.manager.undo();
  // Svuota cache in-memory (blueprint e audio) — verranno ricalcolate al prossimo generate
  AppState.clearCache();
  AppState.session.crossMemory = new CrossSectionMemory();  // Q2: reset memoria inter-sezione
  AppState.ui.chipEditing = null;
  smRender();
};

// ── Sessione 9: mute/riattiva uno strumento per una sezione ──────────
// Icona 🔊/🔇 su ogni lane-block. Invalida l'intera sezione (non solo lo
// strumento toccato): se resta un solo strumento attivo, smGenerateSection
// applica lo stile-da-solista (SOLO_STYLES) — un cache stantia di un altro
// strumento andrebbe rigenerata comunque per riflettere il nuovo stato.
window.smToggleInstrumentActive = (sectionId, inst) => {
  if (!AppState.session.manager) return;
  const section = AppState.session.manager.getSection(sectionId);
  if (!section) return;
  const wasActive = section.instruments[inst]?.active ?? true;
  AppState.session.manager.setInstrumentActive(sectionId, inst, !wasActive);
  smInvalidateCache(sectionId);
  smRender();
  smGenerateSection(sectionId).then(() => {
    if (AppState.ui.flyoutOpen?.sectionId !== sectionId) return;
    const sec2     = AppState.session.manager?.getSection(sectionId);
    const flyPanel = document.getElementById('sm-flyout-panel');
    if (sec2 && flyPanel) { flyPanel.innerHTML = ''; smBuildPanelContent(sectionId, sec2, flyPanel); }
  }).catch(() => { });
};

window.smLaneFlyout = (sectionId, inst) => {
  // Toggle: click sullo stesso blocco chiude
  if (AppState.ui.flyoutOpen?.sectionId === sectionId && AppState.ui.flyoutOpen?.inst === inst) {
    AppState.ui.flyoutOpen = null;
    AppState.ui.expanded.delete(sectionId);
    smRender();
    return;
  }
  // Chiude qualsiasi pannello precedentemente aperto (1 attivo alla volta)
  AppState.ui.expanded.clear();
  AppState.ui.flyoutOpen = { sectionId, inst };
  AppState.ui.expanded.add(sectionId);
  AppState.ui.activeInst.set(sectionId, inst);
  smRender();

  // Genera (o rinfresca dalla cache) i dati della sezione così i pattern
  // dots mostrano il pattern reale invece di restare vuoti — prima questo
  // avveniva solo cliccando "▶ Play" (rimosso insieme all'audio preview),
  // che di fatto era anche l'unico trigger che popolava questa cache.
  // Bug fix: controllava se un QUALSIASI strumento della sezione avesse
  // cache invece dello strumento specifico che si sta aprendo — se drums
  // era già in cache, aprire guitar/bass/piano restava vuoto per sempre.
  const hasCache = !!AppState.cache.sm[`${sectionId}:${inst}`];
  if (!hasCache) {
    smGenerateSection(sectionId).then(() => {
      // Aggiorna SOLO il contenuto del pannello aperto, non l'intera pagina —
      // uno smRender() globale qui ricreava da zero anche i pallini editabili
      // della batteria, interrompendo un click/drag se capitava nel mezzo.
      if (AppState.ui.flyoutOpen?.sectionId !== sectionId) return;
      const section  = AppState.session.manager?.getSection(sectionId);
      const flyPanel = document.getElementById('sm-flyout-panel');
      if (section && flyPanel) { flyPanel.innerHTML = ''; smBuildPanelContent(sectionId, section, flyPanel); }
    }).catch(() => { });
  }
};

window.smCloseFlyout = () => {
  if (AppState.ui.flyoutOpen) AppState.ui.expanded.delete(AppState.ui.flyoutOpen.sectionId);
  AppState.ui.flyoutOpen = null;
  smRender();
};

// ── Playback (WebAudioFont) ──────────────────────────────────────
// Nessuna barra di scorrimento/playhead sincronizzato — solo play/stop
// per sezione o per brano intero, con un indicatore statico (bordo)
// sulla sezione in riproduzione. Vedi Playback.js per il motivo del
// design (il vecchio SynthPreview a oscillatori è stato rimosso perché
// "inutile e fastidioso" e mai sincronizzato col visual).
let _smPlayback = { active: false, sectionId: null }; // sectionId=null → sta suonando l'intero brano

function _smSetPlayUI() {
  const globalBtn = document.getElementById('sm-play-btn');
  if (globalBtn) {
    const playingSong = _smPlayback.active && _smPlayback.sectionId === null;
    globalBtn.textContent = playingSong ? '■ Stop' : '▶ Ascolta';
    globalBtn.classList.toggle('btn-playing', playingSong);
  }
  document.querySelectorAll('.lanes-sec-label').forEach(el => {
    const isPlaying = _smPlayback.active && el.dataset.secId === _smPlayback.sectionId;
    el.classList.toggle('sm-playing', isPlaying);
  });
}

window.smStopPlayback = () => {
  stopPlayback();
  _smPlayback = { active: false, sectionId: null };
  _smSetPlayUI();
};

// Canale MIDI → nome strumento, per applicare l'override del mixer
// (finora usato SOLO in export, mai in anteprima — vedi smMixerSetOverride)
// anche alla riproduzione dal vivo. La batteria (ch 9) è volutamente
// esclusa: WebAudioFont qui carica un campione per NOTA, non per "kit",
// quindi non c'è un program GM da sostituire per farla suonare diversa.
const SM_CHANNEL_TO_INST = { 1: 'bass', 2: 'guitar', 3: 'piano' };
function _smApplyMixerOverride(tracks) {
  return (tracks ?? []).map(t => {
    if (t.channel === 9) return t; // batteria: nessun override possibile in anteprima
    const inst = SM_CHANNEL_TO_INST[t.channel] ?? 'ensemble';
    const override = window._smMixerOverride?.[inst];
    if (!override || override === 'auto') return t;
    return { ...t, program: parseInt(override, 10) };
  });
}

window.smPlaySection = async (sectionId, evt) => {
  evt?.stopPropagation?.(); // non deve anche aprire/chiudere il flyout della sezione
  if (!AppState.session.manager) return;
  if (_smPlayback.active && _smPlayback.sectionId === sectionId) { window.smStopPlayback(); return; }
  stopPlayback();
  _smPlayback = { active: true, sectionId };
  _smSetPlayUI();
  try {
    const { bp, voices } = await smGenerateSection(sectionId);
    if (!voices?.length) { window.smStopPlayback(); return; }
    const state = AppState.session.manager.getState();
    const { durationSec } = await playTracks(_smApplyMixerOverride(voices), { ppq: bp.meta.ppq, bpm: state.bpm });
    setTimeout(() => {
      if (_smPlayback.sectionId === sectionId) window.smStopPlayback();
    }, Math.round(durationSec * 1000) + 150);
  } catch (err) {
    console.error('[Playback] errore riproduzione sezione:', err);
    window.smStopPlayback();
  }
};

window.smPlaySong = async () => {
  if (!AppState.session.manager) return;
  if (_smPlayback.active && _smPlayback.sectionId === null) { window.smStopPlayback(); return; }
  stopPlayback();
  _smPlayback = { active: true, sectionId: null };
  _smSetPlayUI();
  try {
    const state = AppState.session.manager.getState();
    const secs = AppState.session.manager.getSections();
    if (!secs.length) { window.smStopPlayback(); return; }

    // Assicura che ogni sezione attiva sia generata (stesso pre-step di smExportSession)
    for (const sec of secs) {
      let needsGen = false;
      for (const inst of ['drums', 'bass', 'guitar', 'piano', 'ensemble']) {
        if (sec.instruments[inst].active && !AppState.cache.sm[`${sec.id}:${inst}`]) { needsGen = true; break; }
      }
      if (needsGen) await smGenerateSection(sec.id);
    }

    // Assembla le tracce dell'intero brano offsettando i tick sezione per sezione
    // (stesso principio di SessionManager.assembleSessionEvents, ma nel formato
    // { channel, events, program } atteso da Playback.playTracks).
    const buckets = new Map(); // key: channel|program -> { channel, program, events:[] }
    let ppq = 480, globalTick = 0;
    const bump = (channel, program, events) => {
      if (!events?.length) return;
      const key = `${channel}:${program ?? ''}`;
      if (!buckets.has(key)) buckets.set(key, { channel, program, events: [] });
      buckets.get(key).events.push(...events);
    };

    for (const sec of secs) {
      const bp = AppState.cache.bp[`${sec.id}:_bp`];
      const barTicks = bp?.meta?.barTicks ?? (ppq * 4);
      if (bp?.meta?.ppq) ppq = bp.meta.ppq;

      for (const inst of ['drums', 'bass', 'guitar', 'piano']) {
        if (!sec.instruments[inst].active) continue;
        const cached = AppState.cache.sm[`${sec.id}:${inst}`];
        if (!cached?.events?.length) continue;
        const channel = { drums: 9, bass: 1, guitar: 2, piano: 3 }[inst];
        const shifted = cached.events.map(e => ({ ...e, tick: e.tick + globalTick }));
        bump(channel, cached.program, shifted);
      }
      if (sec.instruments.ensemble.active) {
        const cached = AppState.cache.sm[`${sec.id}:ensemble`];
        if (cached?.voiceEvents) {
          cached.voiceEvents.forEach((evts, vi) => {
            const noteEvts = evts.filter(e => e.cc == null);
            if (!noteEvts.length) return;
            const channel = cached.channels?.[vi] ?? (5 + vi);
            const program = cached.programs?.[vi];
            const shifted = noteEvts.map(e => ({ ...e, tick: e.tick + globalTick }));
            bump(channel, program, shifted);
          });
        }
      }
      globalTick += sec.bars * barTicks;
    }

    const tracks = [...buckets.values()];
    if (!tracks.length) { window.smStopPlayback(); return; }
    const { durationSec } = await playTracks(_smApplyMixerOverride(tracks), { ppq, bpm: state.bpm });
    setTimeout(() => {
      if (_smPlayback.sectionId === null) window.smStopPlayback();
    }, Math.round(durationSec * 1000) + 150);
  } catch (err) {
    console.error('[Playback] errore riproduzione brano:', err);
    window.smStopPlayback();
  }
};

/** Apre/chiude il flyout a livello di SEZIONE (🔄 rigenera tutta la sezione, × rimuovi),
 *  cliccando l'etichetta della sezione nell'header sopra le lanes. `inst: null` lo
 *  distingue dal flyout per singolo strumento aperto da smLaneFlyout. */
window.smSectionFlyout = sectionId => {
  if (AppState.ui.flyoutOpen?.sectionId === sectionId && AppState.ui.flyoutOpen?.inst === null) {
    AppState.ui.flyoutOpen = null;
    AppState.ui.expanded.delete(sectionId);
    smRender();
    return;
  }
  AppState.ui.expanded.clear();
  AppState.ui.flyoutOpen = { sectionId, inst: null };
  AppState.ui.expanded.add(sectionId);
  smRender();
};

// ── Session Export Assembler ─────────────────────────────────────
window.smExportSession = async () => {
  if (!AppState.session.manager) return;
  const state = AppState.session.manager.getState();
  const ppq = 480;
  const btn = document.getElementById('sm-export-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Esportazione...'; }

  try {
    // 1. Genera sezioni che non hanno ancora la cache
    for (const sec of state.sections) {
      let needsGen = false;
      for (const inst of ['drums', 'bass', 'guitar', 'piano', 'ensemble']) {
        if (sec.instruments[inst].active && !AppState.cache.sm[`${sec.id}:${inst}`]) { needsGen = true; break; }
      }
      if (needsGen) await smGenerateSection(sec.id);
      // Sincronizza AppState.cache.sm → SessionManager.cachedEvents per assembleSessionEvents
      for (const inst of ['drums', 'bass', 'guitar', 'piano', 'ensemble']) {
        if (sec.instruments[inst].active && AppState.cache.sm[`${sec.id}:${inst}`]) {
          AppState.session.manager.setCachedEvents(sec.id, inst, AppState.cache.sm[`${sec.id}:${inst}`]);
        }
      }
    }

    // 2. Assembla timeline (ensemble → e0/e1/e2, altri → array piatti)
    const trackBuffers = AppState.session.manager.assembleSessionEvents(ppq);
    const barTicks = ppq * 4;

    // 3. GrooveLock sui buffer lineari (drums/bass/guitar/piano)
    const glBuffers = {
      drums: trackBuffers.drums,
      bass: trackBuffers.bass,
      guitar: trackBuffers.guitar,
      piano: trackBuffers.piano,
    };
    if (glBuffers.drums?.length) {
      // Passata di sicurezza sull'intero brano assemblato: smGenerateSection
      // applica già GrooveLock per-sezione (con seed deterministico), ma
      // sezioni cachate PRIMA di questo fix (o ricaricate da una sessione
      // salvata) potrebbero non averlo mai ricevuto. Seed deterministico
      // derivato dai seed di sezione — prima usava Math.random(), quindi
      // ogni export dava un pocket-feel diverso anche a parità di sessione.
      const seedSum = state.sections.reduce((acc, s) => acc ^ (s.seed ?? 0), 0);
      const glRng = makeRng(seedSum ^ 0xC0FF);
      applyGrooveLock(glBuffers, { ppq, bpm: state.bpm, barTicks }, glRng);
    }

    // 4. MIDI Writer — la costruzione vive in SessionExport.js, senza DOM,
    // per poter essere collaudata dalla suite (T1). Qui resta solo la lettura
    // dell'interfaccia: gli override del mixer.
    const writer = buildSessionMidi(state, trackBuffers, {
      ppq,
      mixerOverride: window._smMixerOverride ?? {},
    });

    // 5. Download
    const blob = writer.toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sumidi_session_${state.style}_${state.bpm}bpm.mid`;
    a.click();
    URL.revokeObjectURL(url);
    smBumpSupportCounter('download');
  } catch (e) {
    console.error('[smExportSession]', e);
    alert('Errore Export: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⬇ Export MIDI completo'; }
  }
};

// ── Export CRD (Chord Chart) ─────────────────────────────────────
window.smExportChordChart = () => {
  if (!AppState.session.manager) {
    alert('Nessuna sessione. Clicca ⚡ Genera prima.');
    return;
  }
  const secs = AppState.session.manager.getSections();
  if (!secs.length) {
    alert('Nessuna sezione. Aggiungi sezioni o clicca ⚡ Genera.');
    return;
  }

  // Costruisci CRD come stringa markdown
  const state = AppState.session.manager.getState();
  const lines = [
    `# suMidi — Chord Chart`,
    ``,
    `**Stile:** ${state.style}`,
    `**Tonalità:** ${state.key}`,
    `**BPM:** ${state.bpm}`,
    ``,
    `## Struttura`,
    ``,
  ];

  let barOffset = 1;
  for (const sec of secs) {
    const chords = _smGetSectionChords(sec.id);
    const chordStr = chords.length ? chords.join(' | ') : '(vuota)';
    lines.push(`### ${sec.label} (bar ${barOffset}-${barOffset + sec.bars - 1})`);
    lines.push(`${chordStr}`);
    lines.push('');
    barOffset += sec.bars;
  }

  // Crea e scarica file
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sumidi_crd_${state.style}_${state.key}_${state.bpm}bpm.md`;
  a.click();
  URL.revokeObjectURL(url);
  smBumpSupportCounter('download');
};

// ── Sessione 9: export avanzato — popup con tab per strumento ────────
// Riusa buildGuitarTab/buildBassTab/renderChordChart (TabRenderer.js),
// già complete e verificate in lab.html (sessione 3) — qui serve solo
// l'adattatore fra il modello dati di Session Mode (sezioni per id,
// eventi per strumento) e la forma che quelle funzioni si aspettano
// (array di sezioni con {type,bars,startBar,index,progression}, stessa
// forma di bp.sections in Classic Mode).
let _smAdvExport = null;           // { trackBuffers, sections, totalBars, ppq }
let _smAdvExportActiveTab = 'guitar';

/** Costruisce l'array "sections" per TabRenderer dalle sezioni di Session Mode. */
function _smBuildTabSections() {
  const secs = AppState.session.manager.getSections();
  const perTypeCount = {};
  let startBar = 0;
  const sections = secs.map(sec => {
    const index = perTypeCount[sec.type] ?? 0;
    perTypeCount[sec.type] = index + 1;

    // Progressione custom (chord track): già nella forma [accordo,durata]/stringa
    // attesa da accordiPerBattuta, si usa così com'è.
    let progression = sec.progression?.length ? sec.progression : null;
    if (!progression) {
      // Nessuna progressione custom: NON si riusa _smGetSectionChords (quella
      // dedup consecutiva è pensata per l'etichetta del chord-track — ciclarla
      // con accordiPerBattuta darebbe battute sbagliate se le durate reali non
      // sono uniformi). Si ricostruisce invece un run-length encoding esatto
      // [accordo, battute] dall'harmonicMap reale.
      // A1 di PLAN37: si legge di mezza battuta in mezza battuta, che è la
      // granularità delle regioni armoniche. Su una progressione a battute
      // intere le due metà sono uguali e si fondono, quindi esce lo stesso
      // [accordo, 1] di prima; se invece la battuta contiene due accordi,
      // escono due voci da 0,5 e tab e chord chart li mostrano entrambi.
      const bp = AppState.cache.bp[`${sec.id}:_bp`];
      const barTicks = bp?.meta?.barTicks ?? 1920;
      const map = bp?.sections?.[0]?.harmonicMap ?? [];
      progression = [];
      const PASSO = 0.5;
      for (let q = 0; q < Math.round(sec.bars / PASSO); q++) {
        const tick = q * barTicks * PASSO;
        const region = map.find(r => r.start_tick <= tick && r.end_tick > tick);
        const chord = region?.chord ?? progression[progression.length - 1]?.[0] ?? '?';
        const last = progression[progression.length - 1];
        if (last && last[0] === chord) last[1] += PASSO;
        else progression.push([chord, PASSO]);
      }
    }

    const entry = { type: sec.type, bars: sec.bars, startBar, index, progression };
    startBar += sec.bars;
    return entry;
  });
  return { sections, totalBars: startBar };
}

window.smOpenAdvancedExport = async () => {
  if (!AppState.session.manager) { alert('Nessuna sessione. Clicca ⚡ Genera prima.'); return; }
  const state = AppState.session.manager.getState();
  if (!state.sections.length) { alert('Nessuna sezione. Aggiungi sezioni o clicca ⚡ Genera.'); return; }

  const btn = document.getElementById('sm-adv-export-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Preparazione...'; }
  try {
    // Stesso pre-step di smExportSession: genera le sezioni mancanti e
    // sincronizza la cache dentro il SessionManager per assembleSessionEvents.
    for (const sec of state.sections) {
      let needsGen = false;
      for (const inst of ['drums', 'bass', 'guitar', 'piano', 'ensemble']) {
        if (sec.instruments[inst].active && !AppState.cache.sm[`${sec.id}:${inst}`]) { needsGen = true; break; }
      }
      if (needsGen) await smGenerateSection(sec.id);
      for (const inst of ['drums', 'bass', 'guitar', 'piano', 'ensemble']) {
        if (sec.instruments[inst].active && AppState.cache.sm[`${sec.id}:${inst}`]) {
          AppState.session.manager.setCachedEvents(sec.id, inst, AppState.cache.sm[`${sec.id}:${inst}`]);
        }
      }
    }

    const ppq = 480;
    const trackBuffers = AppState.session.manager.assembleSessionEvents(ppq);
    const barTicks = ppq * 4;

    // Stessa passata di sicurezza GrooveLock di smExportSession, per coerenza
    // fra quello che il popup mostra e quello che l'export MIDI produce.
    if (trackBuffers.drums?.length) {
      const seedSum = state.sections.reduce((acc, s) => acc ^ (s.seed ?? 0), 0);
      const glRng = makeRng(seedSum ^ 0xC0FF);
      applyGrooveLock({
        drums: trackBuffers.drums, bass: trackBuffers.bass,
        guitar: trackBuffers.guitar, piano: trackBuffers.piano,
      }, { ppq, bpm: state.bpm, barTicks }, glRng);
    }

    const { sections, totalBars } = _smBuildTabSections();
    _smAdvExport = { trackBuffers, sections, totalBars, ppq };
    _smAdvExportRenderModal();
  } catch (e) {
    console.error('[smOpenAdvancedExport]', e);
    alert('Errore preparazione export avanzato: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📑 Tab & Accordi'; }
  }
};

function _smAdvExportRenderModal() {
  let modal = document.getElementById('sm-adv-export-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'sm-adv-export-modal';
    modal.className = 'sm-adv-modal-overlay';
    modal.onclick = e => { if (e.target === modal) window.smCloseAdvancedExport(); };
    document.body.appendChild(modal);
  }
  const { sections, totalBars, trackBuffers, ppq } = _smAdvExport;
  // Solo eventi nota reali: assembleSessionEvents intercala marker di
  // program-change ({type:'pc', ...}) nello stesso array piatto.
  const guitarEvts = (trackBuffers.guitar ?? []).filter(e => e.note != null);
  const bassEvts   = (trackBuffers.bass ?? []).filter(e => e.note != null);
  const hasGuitar  = guitarEvts.length > 0;
  const hasBass    = bassEvts.length > 0;

  if (_smAdvExportActiveTab === 'guitar' && !hasGuitar) _smAdvExportActiveTab = hasBass ? 'bass' : 'chords';
  if (_smAdvExportActiveTab === 'bass' && !hasBass) _smAdvExportActiveTab = 'chords';

  const tabs = [
    hasGuitar ? { id: 'guitar', label: '🎸 Chitarra' } : null,
    hasBass   ? { id: 'bass',   label: '🎻 Basso' }    : null,
    { id: 'chords', label: '🎼 Accordi' },
  ].filter(Boolean);

  let bodyHtml;
  if (_smAdvExportActiveTab === 'guitar')      bodyHtml = buildGuitarTab(guitarEvts, sections, ppq);
  else if (_smAdvExportActiveTab === 'bass')   bodyHtml = buildBassTab(bassEvts, sections, ppq);
  else                                         bodyHtml = renderChordChart(sections, totalBars);

  modal.innerHTML = `
        <div class="sm-adv-modal">
          <div class="sm-adv-modal-header">
            <div class="sm-adv-modal-tabs">
              ${tabs.map(t => `<button class="sm-adv-tab-btn${t.id === _smAdvExportActiveTab ? ' active' : ''}"
                onclick="smAdvExportSetTab('${t.id}')">${t.label}</button>`).join('')}
            </div>
            <button class="sm-adv-modal-close" onclick="smCloseAdvancedExport()" title="Chiudi">✕</button>
          </div>
          <div class="sm-adv-modal-body">${bodyHtml}</div>
        </div>`;
  modal.style.display = 'flex';
}

window.smAdvExportSetTab = tabId => {
  _smAdvExportActiveTab = tabId;
  _smAdvExportRenderModal();
};

window.smCloseAdvancedExport = () => {
  const modal = document.getElementById('sm-adv-export-modal');
  if (modal) modal.style.display = 'none';
};

// ── Griglia di accordi incollata (A4 di PLAN37) ───────────────────
// Il secondo caso d'uso del programma: non "generami una canzone" ma
// "accompagnami sui MIEI accordi". Il parser vive in ChordGrid.js, senza DOM e
// collaudato dalla suite; qui restano la finestra, l'anteprima mentre si
// scrive e l'innesto sulla sezione.

let _smGrigliaTesto = '';
let _smGrigliaDest  = 'nuova';

/** Anteprima o errore, aggiornati a ogni tasto senza ridisegnare la textarea. */
function _smGrigliaAnteprima() {
  const box = document.getElementById('sm-grid-preview');
  const btn = document.getElementById('sm-grid-apply');
  if (!box) return;
  if (!_smGrigliaTesto.trim()) {
    box.innerHTML = '<span style="color:var(--muted)">Qui compare l’anteprima, mentre scrivi.</span>';
    if (btn) btn.disabled = true;
    return;
  }
  const esito = analizzaGriglia(_smGrigliaTesto);
  if (!esito.ok) {
    box.innerHTML = `<span style="color:var(--red,#e06c75)">⚠ ${esito.errore}</span>`;
    if (btn) btn.disabled = true;
    return;
  }
  const chip = esito.anteprima.map((b, i) =>
    `<span style="display:inline-block;border:1px solid var(--border);border-radius:4px;padding:2px 6px;margin:2px;font-family:monospace;font-size:11px">
       <span style="color:var(--muted);font-size:9px">${i + 1}</span> ${b}</span>`).join('');
  box.innerHTML = `<div style="color:var(--teal);margin-bottom:4px">${esito.battute} battute</div>${chip}`;
  if (btn) btn.disabled = false;
}

window.smChordGridInput = val => { _smGrigliaTesto = val; _smGrigliaAnteprima(); };
window.smChordGridDest  = val => { _smGrigliaDest = val; };

window.smCloseChordGrid = () => {
  const modal = document.getElementById('sm-grid-modal');
  if (modal) modal.style.display = 'none';
};

window.smOpenChordGrid = () => {
  if (!AppState.session.manager) { alert('Nessuna sessione. Clicca ⚡ Genera prima.'); return; }
  const secs = AppState.session.manager.getSections();
  let modal = document.getElementById('sm-grid-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'sm-grid-modal';
    modal.className = 'sm-adv-modal-overlay';
    modal.onclick = e => { if (e.target === modal) window.smCloseChordGrid(); };
    document.body.appendChild(modal);
  }
  if (!secs.some(sec => sec.id === _smGrigliaDest)) _smGrigliaDest = 'nuova';

  modal.innerHTML = `
    <div class="sm-adv-modal" style="width:min(720px,100%)">
      <div class="sm-adv-modal-header">
        <div style="font-size:13px;font-weight:700">📋 Incolla i tuoi accordi</div>
        <button class="sm-adv-modal-close" onclick="smCloseChordGrid()" title="Chiudi">✕</button>
      </div>
      <div class="sm-adv-modal-body">
        <div style="font-size:11px;color:var(--muted);line-height:1.7;margin-bottom:8px">
          Una battuta per cella, separate da <code>|</code>. Due accordi nella stessa battuta si scrivono
          con uno spazio (<code>| Dm7 G7 |</code>) e prendono mezza battuta ciascuno.
          <code>%</code> ripete la battuta precedente. Slash chord ed estensioni vanno bene:
          <code>C/E</code>, <code>F#m7b5</code>, <code>Bb7</code>. Stile, tonalità e BPM restano quelli
          della composer bar.
        </div>
        <textarea id="sm-grid-text" rows="6" spellcheck="false" autocomplete="off"
          oninput="smChordGridInput(this.value)"
          placeholder="| Am7 | D7 | Gmaj7 | Cmaj7 |"
          style="width:100%;box-sizing:border-box;font-family:monospace;font-size:13px;background:var(--s2);
                 color:var(--text);border:1px solid var(--border);border-radius:6px;padding:8px;resize:vertical">${_smGrigliaTesto}</textarea>
        <div id="sm-grid-preview" style="font-size:12px;min-height:42px;margin:8px 0"></div>
        <div class="sm-ctrl-row">
          <span class="sm-ctrl-label">Dove</span>
          <select class="sm-style-sel" onchange="smChordGridDest(this.value)">
            <option value="nuova"${_smGrigliaDest === 'nuova' ? ' selected' : ''}>Nuova sezione in fondo</option>
            ${secs.map(sec => `<option value="${sec.id}"${sec.id === _smGrigliaDest ? ' selected' : ''}>Sostituisci ${sec.label}</option>`).join('')}
          </select>
        </div>
        <div class="btn-row" style="margin-top:12px">
          <button id="sm-grid-apply" class="btn btn-p" onclick="smApplyChordGrid()" disabled>Applica</button>
          <button class="btn btn-s" onclick="smCloseChordGrid()">Annulla</button>
        </div>
      </div>
    </div>`;
  modal.style.display = 'flex';
  _smGrigliaAnteprima();
  document.getElementById('sm-grid-text')?.focus();
};

window.smApplyChordGrid = () => {
  const mgr = AppState.session.manager;
  if (!mgr) return;
  const esito = analizzaGriglia(_smGrigliaTesto);
  if (!esito.ok) return;

  let id = _smGrigliaDest;
  if (id === 'nuova') {
    id = mgr.addSection('custom', { bars: esito.battute }).id;
  } else if (mgr.getSection(id)) {
    mgr.setSectionBars(id, esito.battute);
  } else {
    return;
  }
  mgr.setSectionProgression(id, esito.progressione);
  smInvalidateCache(id);
  window.smCloseChordGrid();
  smRender();
  smToast(`Griglia applicata: ${esito.battute} battute.`, { icon: '📋' });
  // Genera in sottofondo, come fa "rigenera sezione": senza, la sezione resta
  // muta finche' non si preme Ascolta o Export.
  smGenerateSection(id).then(() => smRender()).catch(() => {});
};

// ── Solo Mode standalone ──────────────────────────────────────────
// Non è un mute per sezione: sceglie UN solo strumento (Piano/Chitarra/
// Basso/Ensemble) e lo suona per intero sulla progressione di accordi già
// costruita in Session Mode (stessa tonalità/BPM/forma/sezioni), senza
// leggere o toccare lo stato attivo/muto dell'Arrangement.
//
// Lo stile: "Auto" varia per tipo di sezione (tabella SOLO_STYLES, la stessa di
// smGenerateSection) ed è il default; un valore scelto a mano vale per tutto il
// brano. O5 di PLAN37 aggiunge il terzo livello, che qui mancava e
// nell'Arrangement c'era già: l'eccezione **per singola sezione**. Ordine di
// precedenza, dal più specifico: sezione → globale → personaggio → tabella per
// tipo di sezione → default del modulo.
const SOLO_INSTS = ['piano', 'guitar', 'bass', 'ensemble'];
const SOLO_INST_LABELS = { piano: 'Piano', guitar: 'Chitarra', bass: 'Basso', ensemble: 'Ensemble' };
const SOLO_INST_CHANNEL = { piano: 3, guitar: 2, bass: 1 }; // ensemble: canali propri da generateEnsemble
const SOLO_STYLE_LISTS = {
  piano: char => (char?.id ?? '').startsWith('kb_')
    ? ['comping', 'hip_hop_keys', 'broken_chords', 'freely', 'ballad', 'new_age_flow']
    : ['ballad', 'new_age_flow', 'comping', 'alberti_bass', 'freely'],
  guitar: char => (char?.id ?? '').startsWith('elgtr_')
    ? ['powerchord', 'riff', 'strumming', 'arpeggio']
    : ['fingerpicking', 'arpeggio', 'strumming', 'classical', 'powerchord', 'riff'],
  bass: () => ['walking', 'fingerstyle', 'slap', 'fretless', 'acoustic_bass'],
  ensemble: () => ['pad', 'melodic'],
};

// O6 di PLAN37: lo stato di Solo Mode vive in AppState.session.solo, non più
// in un `let` di modulo. Qui resta solo un alias sullo stesso oggetto, così il
// codice sotto non cambia; tutte le scritture sono su proprietà, mai sull'alias.
const _smSolo = AppState.session.solo;

/**
 * La mappa sezione → stile, sempre in una forma usabile. Un `.sumidi.json` può
 * arrivare da chiunque e da qualunque versione: se al posto della mappa c'è
 * altro, si riparte da vuota invece di rompere il pannello.
 */
function _smSoloMappaStili() {
  const m = _smSolo.stylePerSection;
  if (!m || typeof m !== 'object' || Array.isArray(m)) _smSolo.stylePerSection = {};
  return _smSolo.stylePerSection;
}

/** Lo stile scelto a mano per una sezione: prima l'eccezione, poi il globale. */
function _smSoloStileDi(sectionId) {
  const scelto = _smSoloMappaStili()[sectionId];
  return typeof scelto === 'string' && scelto ? scelto : _smSolo.style;
}

/** Attiva/disattiva Solo Mode — sostituisce la vista Arrangement. */
window.smToggleSoloMode = () => {
  _smSolo.active = !_smSolo.active;
  const addToolbar = document.getElementById('sm-add-toolbar');
  const lanesWrap  = document.getElementById('sm-lanes-wrap');
  const flyout     = document.getElementById('sm-flyout');
  const soloPanel  = document.getElementById('sm-solo-panel');
  const toggleBtn  = document.getElementById('sm-solo-toggle-btn');
  if (_smSolo.active) {
    AppState.ui.flyoutOpen = null;
    if (addToolbar) addToolbar.style.display = 'none';
    // smRender() con _smSolo.active esce prima di ridecidere questi display:
    // vanno nascosti qui, altrimenti restano al valore dell'ultimo render normale.
    if (lanesWrap) lanesWrap.style.display = 'none';
    if (flyout) flyout.style.display = 'none';
    if (toggleBtn) toggleBtn.classList.add('active');
    if (soloPanel) soloPanel.style.display = 'block';
    smRender();
  } else {
    if (_smSolo.playing) { stopPlayback(); _smSolo.playing = false; }
    if (addToolbar) addToolbar.style.display = '';
    if (soloPanel) soloPanel.style.display = 'none';
    if (toggleBtn) toggleBtn.classList.remove('active');
    smRender();
  }
};

window.smSoloSetInstrument = inst => {
  _smSolo.inst = inst;
  _smSolo.characterId = null;
  _smSolo.style = '';
  // Gli stili sono per strumento (SOLO_STYLE_LISTS): tenere le eccezioni
  // significherebbe chiedere al piano di suonare 'powerchord'.
  _smSolo.stylePerSection = {};
  _smRenderSoloPanel();
};

window.smSoloSetStyle = val => { _smSolo.style = val; };

/** O5: stile della singola sezione. Valore vuoto = torna a seguire il globale. */
window.smSoloSetSectionStyle = (sectionId, val) => {
  const mappa = _smSoloMappaStili();
  if (val) mappa[sectionId] = val;
  else delete mappa[sectionId];
  _smRenderSoloPanel();
  _smAutosave();
};

/** O5: toglie tutte le eccezioni per sezione in un colpo solo. */
window.smSoloResetSectionStyles = () => {
  _smSolo.stylePerSection = {};
  _smRenderSoloPanel();
  _smAutosave();
};

window.smSoloCycleCharacter = dir => {
  const roster = CHARACTER_ROSTER[_smSolo.inst] ?? [];
  if (!roster.length) return;
  let idx = roster.findIndex(c => c.id === _smSolo.characterId);
  if (idx < 0) idx = 0;
  idx = (idx + dir + roster.length) % roster.length;
  _smSolo.characterId = roster[idx].id;
  _smRenderSoloPanel();
};

window.smSoloMutateSeed = () => {
  _smSolo.seed = Math.floor(Math.random() * 99999) + 1;
  _smRenderSoloPanel();
};

function _smRenderSoloPanel() {
  const panel = document.getElementById('sm-solo-panel');
  if (!panel) return;
  const secs = AppState.session.manager?.getSections() ?? [];
  if (!secs.length) {
    panel.innerHTML = `<div class="sm-empty">Nessuna sezione: genera un brano o aggiungi sezioni prima di usare Solo Mode.</div>`;
    return;
  }

  const roster = CHARACTER_ROSTER[_smSolo.inst] ?? [];
  let idx = roster.findIndex(c => c.id === _smSolo.characterId);
  if (idx < 0) idx = 0;
  const char = roster[idx] ?? null;
  const styleOptions = SOLO_STYLE_LISTS[_smSolo.inst](char);

  // O5: le eccezioni per sezione. Le sezioni cambiano (una rigenerazione
  // completa ne crea di nuove con altri id): le voci rimaste orfane si
  // buttano qui, cosi' la mappa non cresce con roba che non esiste piu'.
  const mappaStili = _smSoloMappaStili();
  for (const id of Object.keys(mappaStili)) {
    if (!secs.some(sec => sec.id === id)) delete mappaStili[id];
  }
  const conEccezioni = Object.keys(mappaStili).length;
  const etichettaGlobale = _smSolo.style || 'Auto';

  panel.innerHTML = `
    <div style="display:flex;gap:6px;margin-bottom:14px">
      ${SOLO_INSTS.map(inst => `<button class="sm-adv-tab-btn${inst === _smSolo.inst ? ' active' : ''}"
        onclick="smSoloSetInstrument('${inst}')">${SOLO_INST_LABELS[inst]}</button>`).join('')}
    </div>
    ${char ? `
    <div class="sm-char-selector">
      <button class="sm-char-nav-btn" onclick="smSoloCycleCharacter(-1)">◀</button>
      <img class="sm-char-img" src="${char.img}" alt="${char.name}" onerror="this.style.display='none'">
      <div class="sm-char-info"><div class="sm-char-name">${char.name}</div><div class="sm-char-bio">${char.bio}</div></div>
      <button class="sm-char-nav-btn" onclick="smSoloCycleCharacter(1)">▶</button>
    </div>` : ''}
    <div class="sm-ctrl-row" style="margin-top:10px">
      <span class="sm-ctrl-label">Stile</span>
      <select class="sm-style-sel" onchange="smSoloSetStyle(this.value)">
        <option value=""${_smSolo.style === '' ? ' selected' : ''}>Auto (varia per tipo di sezione)</option>
        ${styleOptions.map(s => `<option value="${s}"${s === _smSolo.style ? ' selected' : ''}>${s}</option>`).join('')}
      </select>
    </div>
    <div class="sm-solo-sezioni" style="margin-top:10px;border-top:1px solid var(--border, #33335a);padding-top:8px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span class="sm-ctrl-label">Per sezione</span>
        <span style="font-size:10px;color:var(--muted)">l'eccezione vince sullo stile qui sopra (${etichettaGlobale})</span>
        ${conEccezioni ? `<button class="sm-icon-btn" style="margin-left:auto"
          onclick="smSoloResetSectionStyles()" title="Togli tutte le eccezioni">↺</button>` : ''}
      </div>
      ${secs.map(sec => `
        <div class="sm-ctrl-row">
          <span class="sm-ctrl-label" style="min-width:96px">${sec.label}</span>
          <select class="sm-style-sel" onchange="smSoloSetSectionStyle('${sec.id}', this.value)">
            <option value=""${!mappaStili[sec.id] ? ' selected' : ''}>— come sopra —</option>
            ${styleOptions.map(st => `<option value="${st}"${st === mappaStili[sec.id] ? ' selected' : ''}>${st}</option>`).join('')}
          </select>
        </div>`).join('')}
    </div>
    <div class="sm-ctrl-row">
      <span class="sm-ctrl-label">Seed</span>
      <span style="font-family:monospace;font-size:11px;color:var(--text);width:44px;display:inline-block">#${_smSolo.seed}</span>
      <button class="sm-icon-btn" onclick="smSoloMutateSeed()" title="Nuovo seed casuale">🎲</button>
    </div>
    <div class="btn-row" style="margin-top:12px">
      <button id="sm-solo-play-btn" class="btn btn-p" onclick="smSoloPlay()">${_smSolo.playing ? '■ Stop' : '▶ Ascolta'}</button>
      <button id="sm-solo-export-btn" class="btn btn-d" onclick="smSoloExportMidi()">⬇ Export MIDI</button>
      <span id="sm-solo-status" style="font-size:11px;color:var(--muted)"></span>
    </div>
  `;
}

/**
 * Genera un solo strumento su una sezione, bypassando active/muto
 * dell'Arrangement.
 * @param {object} memoria — CrossSectionMemory dell'assemblaggio in corso (B9)
 */
async function _smSoloGenerateSection(sec, state, memoria) {
  const bp = buildSectionBlueprint({ key: state.key, bpm: state.bpm, style: state.style }, sec);
  const inst = _smSolo.inst;
  const mod = bp.sections[0].modules[inst];
  const voices = [];
  if (!mod) return { bp, voices };

  const roster = CHARACTER_ROSTER[inst] ?? [];
  const char = roster.find(c => c.id === _smSolo.characterId) ?? null;

  // O1 di PLAN37 — nel blueprint del solo restano attivi SOLO lo strumento
  // scelto. L'adattamento a "sono rimasto solo" è già scritto nei generatori e
  // non si accendeva mai: PianoGenerator abbassa il floor della mano sinistra
  // da C3 (48) a C2 (36) quando il modulo bass non è attivo nella sezione
  // (anti-mud verso il basso, che qui non c'è), e GuitarGenerator toglie lo
  // stagger dei transienti pensato per lasciargli spazio. Il blueprint però
  // arrivava qui così com'era, con tutti i moduli attivi: il piano solo teneva
  // la sinistra alta come se un basso stesse suonando, la chitarra sola
  // sfalsava i transienti per un basso che nessuno avrebbe generato.
  for (const [nome, m] of Object.entries(bp.sections[0].modules)) {
    if (m && nome !== inst) m.active = false;
  }
  mod.active = true;
  if (inst === 'ensemble') {
    // Il personaggio ensemble sceglie la FAMIGLIA di strumento (archi/ottoni/…),
    // asse indipendente dallo stile pad/melodic — stessa distinzione di
    // smSelectCharacter (ensStyle vs style) sul pannello per-sezione.
    if (char?.style) bp.meta.ensemble = { ...(bp.meta.ensemble ?? {}), type: char.style };
    mod.style = _smSoloStileDi(sec.id) || (SOLO_STYLES.ensemble[sec.type] ?? mod.style);
  } else {
    mod.style = _smSoloStileDi(sec.id) || char?.style || (SOLO_STYLES[inst]?.[sec.type] ?? mod.style);
  }

  const seed = _smSolo.seed ^ SM_SALT[inst];
  const humAmt = bp.meta.humanize ?? 0.35;

  if (inst === 'piano') {
    const res = generatePiano(bp, null, seed, memoria);
    const evts = res.events.filter(e => e.cc == null);
    humanize(evts, bp.meta.ppq, humAmt * 0.5, 3, seed + 4, bp.meta.barTicks);
    applySwing(evts, bp.meta.ppq, bp.meta.swing ?? 0);
    voices.push({ channel: SOLO_INST_CHANNEL.piano, program: res.program, events: evts });
  } else if (inst === 'guitar') {
    const res = generateGuitar(bp, null, seed, memoria);
    humanize(res.events, bp.meta.ppq, humAmt * 0.7, 2, seed + 3, bp.meta.barTicks);
    applySwing(res.events, bp.meta.ppq, bp.meta.swing ?? 0);
    voices.push({ channel: SOLO_INST_CHANNEL.guitar, program: res.program, events: res.events });
  } else if (inst === 'bass') {
    const res = generateBass(bp, null, seed);
    humanize(res.events, bp.meta.ppq, humAmt * 0.6, 1, seed + 2, bp.meta.barTicks);
    applySwing(res.events, bp.meta.ppq, bp.meta.swing ?? 0);
    voices.push({ channel: SOLO_INST_CHANNEL.bass, program: res.program, events: res.events });
  } else if (inst === 'ensemble') {
    const res = generateEnsemble(bp, seed);
    res.voiceEvents.forEach((evts, vi) => {
      humanize(evts, bp.meta.ppq, humAmt * 0.3, res.channels[vi], seed + 5 + vi, bp.meta.barTicks);
      applySwing(evts, bp.meta.ppq, bp.meta.swing ?? 0);
      const noteEvts = evts.filter(e => e.cc == null);
      if (noteEvts.length) voices.push({ channel: res.channels[vi], program: res.programs[vi] ?? res.program, events: noteEvts });
    });
  }
  return { bp, voices };
}

/**
 * Assembla l'intero brano per lo strumento scelto, sezione per sezione (stesso
 * schema di smPlaySong).
 *
 * B9 di PLAN37, trovato facendo O5 e corretto qui. La `CrossSectionMemory` in
 * `AppState.session.crossMemory` sopravvive fra una generazione e l'altra:
 * finche' non veniva azzerata, il primo export dopo il caricamento partiva da
 * una memoria vuota e tutti quelli dopo dalle note lasciate dal giro
 * precedente. Misurato sullo stesso link (jazz_ballad, Dm, 84, seed 31337,
 * piano): export in Auto → passaggio ad alberti_bass → ritorno ad Auto dava un
 * file **diverso** dal primo, e da li' in poi stabile. Cioe' il file dipendeva
 * da cosa si era esportato prima, non solo dal seed — la stessa famiglia di B7.
 *
 * Ogni assemblaggio ricostruisce il brano dall'inizio, quindi parte da una
 * memoria sua: la continuita' fra le sezioni resta (e' li' che serve), sparisce
 * solo la continuita' fra due export diversi, che non era voluta da nessuno.
 */
async function _smSoloAssembleSong() {
  const state = AppState.session.manager.getState();
  const secs = AppState.session.manager.getSections();
  const memoria = new CrossSectionMemory();   // B9: una per assemblaggio
  const buckets = new Map(); // "channel:program" -> { channel, program, events }
  let ppq = 480, globalTick = 0;
  const bump = (channel, program, events) => {
    if (!events?.length) return;
    const key = `${channel}:${program ?? ''}`;
    if (!buckets.has(key)) buckets.set(key, { channel, program, events: [] });
    buckets.get(key).events.push(...events);
  };
  for (const sec of secs) {
    const { bp, voices } = await _smSoloGenerateSection(sec, state, memoria);
    ppq = bp.meta.ppq;
    for (const v of voices) {
      bump(v.channel, v.program, v.events.map(e => ({ ...e, tick: e.tick + globalTick })));
    }
    globalTick += sec.bars * bp.meta.barTicks;
  }
  return { tracks: [...buckets.values()], ppq, bpm: state.bpm };
}

window.smSoloPlay = async () => {
  if (_smSolo.playing) {
    stopPlayback();
    _smSolo.playing = false;
    _smRenderSoloPanel();
    return;
  }
  const statusEl = document.getElementById('sm-solo-status');
  const playBtn = document.getElementById('sm-solo-play-btn');
  if (playBtn) playBtn.disabled = true;
  if (statusEl) statusEl.textContent = '⏳ Generazione…';
  try {
    const { tracks, ppq, bpm } = await _smSoloAssembleSong();
    if (!tracks.length) {
      if (statusEl) statusEl.textContent = '⚠️ Nessun evento generato per questo strumento.';
      return;
    }
    _smSolo.playing = true;
    if (statusEl) statusEl.textContent = '';
    if (playBtn) playBtn.textContent = '■ Stop';
    const { durationSec } = await playTracks(tracks, { ppq, bpm });
    setTimeout(() => {
      if (_smSolo.playing) { _smSolo.playing = false; _smRenderSoloPanel(); }
    }, Math.round(durationSec * 1000) + 150);
  } catch (err) {
    console.error('[SoloMode] errore playback:', err);
    if (statusEl) statusEl.textContent = '❌ ' + err.message;
    _smSolo.playing = false;
  } finally {
    if (playBtn) playBtn.disabled = false;
  }
};

window.smSoloExportMidi = async () => {
  const statusEl = document.getElementById('sm-solo-status');
  const btn = document.getElementById('sm-solo-export-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Esportazione...'; }
  try {
    const state = AppState.session.manager.getState();
    const { tracks, ppq } = await _smSoloAssembleSong();
    if (!tracks.length) {
      if (statusEl) statusEl.textContent = '⚠️ Nessun evento generato per questo strumento.';
      return;
    }
    const writer = buildSoloMidi(
      state,
      AppState.session.manager.getSections(),
      tracks,
      { ppq, etichetta: SOLO_INST_LABELS[_smSolo.inst] },
    );
    const blob = writer.toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sumidi_solo_${_smSolo.inst}_${state.style}_${state.bpm}bpm.mid`;
    a.click();
    URL.revokeObjectURL(url);
    smBumpSupportCounter('download');
  } catch (err) {
    console.error('[SoloMode] errore export:', err);
    if (statusEl) statusEl.textContent = '❌ ' + err.message;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⬇ Export MIDI'; }
  }
};
