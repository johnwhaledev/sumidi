/**
 * SongEngine.js — gen() e la composer bar
 * ─────────────────────────────────────────────────────────
 * Estratto da main.js: il motore di generazione a blueprint intero (gen()),
 * lo stato del brano nell'URL (B1), la scelta della forma (A2) e il ponte
 * verso Session Mode (smAutoGenerate).
 *
 * gen() non legge il DOM per i suoi parametri (Fase 1): li riceve espliciti
 * da chi lo chiama. I call site sono due qui — smAutoGenerate e smRandomAll —
 * e due in SongEngineLab.js, che li costruisce dal pannello Classic.
 *
 * D3(c) di PLAN37: il pannello Classic e la vetrina di lab.html vivevano qui
 * dentro e venivano scaricati da chiunque aprisse il sito, pur leggendo solo
 * elementi che esistono in lab.html. Ora stanno in SongEngineLab.js, che
 * carica solo quella pagina. Di condiviso restano `gen` e `disabled`, esportati
 * qui sotto.
 */
import { AppState } from './AppState.js';
import { buildSectionBlueprint } from './SessionManager.js';
import { buildSong, makeRng, keySignatureSf } from './SongArchitect.js';
import { MidiWriter } from './MidiWriter.js';
import { generateDrums } from './Percussionist.js';
import { generateBass } from './BassGenerator.js';
import { generateGuitar } from './GuitarGenerator.js';
import { generateEnsemble } from './EnsembleGenerator.js';
import { generatePiano } from './PianoGenerator.js';
import { generateChords } from './ChordGenerator.js';
import { humanize, applySwing } from './Humanizer.js';
import { buildDrumContext, CrossSectionMemory } from './FlowCore.js';
import { applyGrooveLock } from './GrooveLock.js';
import { STYLES } from './Styles.js';
import { smImportFromBlueprint, smBumpSupportCounter } from './Session.js';

// ── State ─────────────────────────────────────────────────────
// Esportato: i bottoni del pannello Classic (SongEngineLab.js) accendono e
// spengono i moduli in QUESTO insieme, che è lo stesso che legge gen() qui
// sotto. Duplicarlo vorrebbe dire che spegnere la batteria nel lab non la
// spegne davvero.
export const disabled = new Set();
// T4/B3: seed dell'ultima generazione di smAutoGenerate — prima viveva nel
// campo nascosto p-seed del pannello Classic (riletto da lì a seed
// bloccato); 42 replica lo stesso default HTML del campo, per chi blocca
// il seed prima ancora di generare una prima volta. Usato solo qui: non
// serve centralizzarlo in AppState.session (a differenza di _smgr/
// crossMemory, condivisi anche con Session.js).
let _smLastSeed = 42;
// AppState.preview.lastURL, AppState.preview.lastBP, AppState.preview.voices, AppState.preview.ppqBpm, AppState.preview.tracks, AppState.preview.guitarEvts, AppState.preview.bassEvts → AppState



// Guardia su elemento assente: dopo T4/B3 index.html non ha più il pannello
// Classic (Fase 2) ma gen() resta lo stesso, chiamato da Session Mode.
const st = (t, m) => { const e = document.getElementById('status'); if (e) { e.className = t; e.textContent = m; } };
const prg = p => {
  const bar = document.getElementById('prog'); if (bar) bar.className = 'prog on';
  const fill = document.getElementById('pbar'); if (fill) fill.style.width = p + '%';
};
const w = (ms = 8) => new Promise(r => setTimeout(r, ms));

// ── CC Automation: volume (CC7) + expression (CC11) per sezione ──
// Inietta step di automazione in base all'energia di ogni sezione.
// Factor: 0.595 (energy=1) → 1.0 (energy=10)
function _addCCArc(events, sections, cc7Base, cc11Base = null) {
  for (const s of sections) {
    const f = 0.55 + 0.045 * s.energy;
    events.push({ tick: s.startTick, cc: 7, value: Math.min(120, Math.round(cc7Base * f)) });
    if (cc11Base !== null)
      events.push({ tick: s.startTick, cc: 11, value: Math.min(120, Math.round(cc11Base * f)) });
  }
}


// ── Generator ─────────────────────────────────────────────────
// T4/B3: parametri espliciti invece di leggerli dal DOM — gen() deve
// restare utilizzabile anche quando il pannello Classic non esiste nel
// documento (index.html dopo la Fase 2). I 3 call site (bottone classic/
// lab.html, smAutoGenerate, labCompareFlat) costruiscono l'oggetto con
// _readClassicParams() e lo passano.
export const gen = async (params, humAmt, disabledSet, isFlat) => {
  const btn = document.getElementById('gen-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="sp"></span>Generating…'; }
  if (AppState.preview.lastURL) { URL.revokeObjectURL(AppState.preview.lastURL); AppState.preview.lastURL = null; }
  prg(4); st('info', '🎼 Blueprint…'); await w();

  try {
    const t0 = performance.now();
    const bp = buildSong(params);
    AppState.preview.lastBP = bp;

    // Disable masked modules
    for (const m of disabledSet)
      for (const sec of bp.sections)
        if (sec.modules[m]) sec.modules[m].active = false;

    // Solo instrument: se un solo modulo è attivo, copre tutte le sezioni
    // adattando lo stile al tipo di sezione (intro/verse/chorus/bridge/outro).
    // Eccezione: se l'utente ha selezionato esplicitamente uno stile chitarra,
    // quel stile viene usato su tutta la canzone (es. "riff" rimane riff).
    const activeModules = ['drums', 'bass', 'guitar', 'piano', 'ensemble'].filter(m => !disabledSet.has(m));
    if (activeModules.length === 1) {
      const soloMod = activeModules[0];
      const SOLO_STYLES = {
        guitar: { intro: 'arpeggio', verse: 'arpeggio', chorus: 'strumming', bridge: 'fingerpicking', outro: 'arpeggio' },
        piano: { intro: 'ballad', verse: 'ballad', chorus: 'ballad', bridge: 'comping', outro: 'ballad' },
        bass: { intro: 'walking', verse: 'walking', chorus: 'walking', bridge: 'walking', outro: 'walking' },
        ensemble: { intro: 'pad', verse: 'melodic', chorus: 'melodic', bridge: 'melodic', outro: 'pad' },
      };
      for (const sec of bp.sections) {
        const mod = sec.modules[soloMod];
        if (!mod) continue;
        mod.active = true;
        // Chitarra con stile esplicito: rispetta la scelta senza override automatico
        if (soloMod === 'guitar' && params.guitarStyle) {
          mod.style = params.guitarStyle;
        } else {
          const styleMap = SOLO_STYLES[soloMod];
          if (styleMap) mod.style = styleMap[sec.type] ?? mod.style;
        }
      }
    }

    const writer = new MidiWriter(bp.meta.ppq);
    writer.setTempo(bp.meta.bpm);
    writer.setTimeSignature(bp.meta.beatsPerBar ?? 4, 4);
    // Key signature (FF 59) — tabella in SongArchitect.keySignatureSf, unica
    writer.setKeySignature(keySignatureSf(bp.meta.keyInfo.rootPc, bp.meta.keyInfo.isMinor), bp.meta.keyInfo.isMinor);
    // Marker di sezione (FF 06): Intro, Verse 1, Verse 2, Chorus … visibili in DAW
    {
      const LBL = { intro: 'Intro', verse: 'Verse', chorus: 'Chorus', bridge: 'Bridge', outro: 'Outro' };
      const tot = bp.sections.reduce((a, s) => ({ ...a, [s.type]: (a[s.type] || 0) + 1 }), {});
      const cnt = {}; for (const s of bp.sections) {
        cnt[s.type] = (cnt[s.type] || 0) + 1;
        const l = LBL[s.type] || s.type; writer.addMarker(s.startTick, tot[s.type] > 1 ? `${l} ${cnt[s.type]}` : l);
      }
    }

    let totalEv = 0, totalTr = 0;
    // Raccolta eventi per TonePreview e Chord Editor
    const previewVoices = [];
    AppState.preview.tracks = [];

    // Sessione B (PLAN28) — Velocity Pocket per canale (mix bilanciato)
    const CH_POCKET = {
      9: { intro: 0.85, verse: 0.92, chorus: 1.00, bridge: 0.88, outro: 0.80 }, // drums
      1: { intro: 0.80, verse: 0.88, chorus: 0.96, bridge: 0.84, outro: 0.75 }, // bass
      2: { intro: 0.75, verse: 0.85, chorus: 0.94, bridge: 0.82, outro: 0.72 }, // guitar
      3: { intro: 0.72, verse: 0.82, chorus: 0.90, bridge: 0.80, outro: 0.70 }, // piano
      4: { intro: 0.14, verse: 0.14, chorus: 0.14, bridge: 0.14, outro: 0.14 }, // chord ref
      5: { intro: 0.70, verse: 0.80, chorus: 0.88, bridge: 0.76, outro: 0.68 }, // ensemble 1
      6: { intro: 0.68, verse: 0.78, chorus: 0.86, bridge: 0.74, outro: 0.66 }, // ensemble 2
      7: { intro: 0.65, verse: 0.75, chorus: 0.84, bridge: 0.72, outro: 0.64 }, // ensemble 3
    };

    const addT = (name, evts, ch, prog = null) => {
      if (!evts?.length) return;

      // Scaling dinamico per canale e sezione (Sessione B)
      const pocketMap = CH_POCKET[ch] ?? CH_POCKET[3]; // fallback su piano (mid range)
      evts.forEach(e => {
        if (e.cc == null && e.velocity != null) {
          const sec = bp.sections.find(s => e.tick >= s.startTick && e.tick < s.endTick) || bp.sections[bp.sections.length - 1];
          const scale = pocketMap[sec?.type ?? 'verse'] ?? 0.85;
          e.velocity = Math.max(1, Math.min(127, Math.round(e.velocity * scale)));
        }
      });

      const t = writer.addTrack(name);
      if (prog != null) t.programChange(0, prog, ch);
      evts.forEach(e => {
        if (e.cc != null) t.controlChange(e.tick, e.cc, e.value, ch);
        else { t.noteOn(e.tick, e.note, e.velocity, ch); t.noteOff(e.tick + e.duration, e.note, ch); }
      });
      totalEv += evts.length; totalTr++;
      AppState.preview.tracks.push({ name, channel: ch, events: evts, program: prog });
    };

    // Q2: memoria inter-sezione locale per il path gen() (full blueprint)
    const genCrossMemory = new CrossSectionMemory();

    // ── Raccolta eventi per GrooveLock (pre-addT) ────────────────
    // Tutti i generatori riempiono allTrackEvts prima di scrivere il MIDI.
    // GrooveLock poi allinea i pocket offset inter-strumentali.
    const allTrackEvts = { drums: null, bass: null, guitar: null, piano: null };

    // ── DRUMS (ch 9) ─────────────────────────────────────────
    let drumEvts = [];
    if (!disabledSet.has('drums')) {
      st('info', '🥁 Drums…'); await w();
      drumEvts = generateDrums(bp);
      humanize(drumEvts, bp.meta.ppq, humAmt * 0.4, 9, params.seed + 1, bp.meta.barTicks);
      // Swing pieno come tutti gli altri strumenti — prima la batteria
      // swingava solo al 33% dello stesso bp.meta.swing usato da
      // basso/chitarra/piano/ensemble, uno sfasamento sistematico (non
      // casuale) su ogni ottavo "in levare" negli stili con swing.
      applySwing(drumEvts, bp.meta.ppq, bp.meta.swing ?? 0);
      if (!isFlat) _addCCArc(drumEvts, bp.sections, 105);
      allTrackEvts.drums = drumEvts;
      prg(18);
    }

    // ── S5-A: DrumContext (buildDrumContext definita a livello modulo) ─
    const drumContext = buildDrumContext(drumEvts, bp.meta.ppq, bp.meta.barTicks);

    // ── BASS (ch 1) ───────────────────────────────────────────
    let bassRes = null;
    if (!disabledSet.has('bass')) {
      st('info', '🎸 Bass…'); await w();
      bassRes = generateBass(bp, drumContext);  // S5-A
      humanize(bassRes.events, bp.meta.ppq, humAmt * 0.6, 1, params.seed + 2, bp.meta.barTicks);
      applySwing(bassRes.events, bp.meta.ppq, bp.meta.swing ?? 0);
      AppState.preview.bassEvts = bassRes.events;
      if (!isFlat) _addCCArc(bassRes.events, bp.sections, 100, 95);
      allTrackEvts.bass = bassRes.events;
      prg(32);
    }

    // ── GUITAR (ch 2) ─────────────────────────────────────────
    let guitarRes = null;
    if (!disabledSet.has('guitar')) {
      st('info', '🎵 Guitar…'); await w();
      guitarRes = generateGuitar(bp, drumContext, null, genCrossMemory);  // Q2: crossMemory
      humanize(guitarRes.events, bp.meta.ppq, humAmt * 0.7, 2, params.seed + 3, bp.meta.barTicks);
      applySwing(guitarRes.events, bp.meta.ppq, bp.meta.swing ?? 0);
      AppState.preview.guitarEvts = guitarRes.events;
      if (!isFlat) _addCCArc(guitarRes.events, bp.sections, 90, 85);
      allTrackEvts.guitar = guitarRes.events;
      prg(48);
    }

    // ── PIANO (ch 3) ──────────────────────────────────────────
    let pianoRes = null, pianoNoteEvts = [], pianoCcEvts = [];
    if (!disabledSet.has('piano')) {
      st('info', '🎹 Piano…'); await w();
      pianoRes = generatePiano(bp, drumContext, null, genCrossMemory);  // Q2: crossMemory
      pianoNoteEvts = pianoRes.events.filter(e => e.cc == null);
      pianoCcEvts = pianoRes.events.filter(e => e.cc != null);
      humanize(pianoNoteEvts, bp.meta.ppq, humAmt * 0.5, 3, params.seed + 4, bp.meta.barTicks);
      applySwing(pianoNoteEvts, bp.meta.ppq, bp.meta.swing ?? 0);
      if (!isFlat) _addCCArc(pianoNoteEvts, bp.sections, 85, 90);
      allTrackEvts.piano = pianoNoteEvts;
      prg(65);
    }

    // ── GrooveLock: pocket offset inter-strumentale ───────────
    // Applicato dopo humanize/swing, prima di addT.
    // Backward-compatible: se drums disattivi, nessun effetto.
    if (allTrackEvts.drums?.length) {
      st('info', '🔒 GrooveLock…'); await w();
      const glRng = makeRng(params.seed ^ 0xC0FF);
      applyGrooveLock(allTrackEvts, bp.meta, glRng);
    }

    // ── addT: scrittura MIDI ──────────────────────────────────
    if (drumEvts.length) { addT('Drums', drumEvts, 9); previewVoices.push({ channel: 9, events: drumEvts }); }
    if (bassRes) { addT('Bass', bassRes.events, 1, bassRes.program); previewVoices.push({ channel: 1, events: bassRes.events, program: bassRes.program }); }
    if (guitarRes) { addT('Guitar', guitarRes.events, 2, guitarRes.program); previewVoices.push({ channel: 2, events: guitarRes.events, program: guitarRes.program }); }
    if (pianoRes) { addT('Piano', [...pianoNoteEvts, ...pianoCcEvts], 3, pianoRes.program); previewVoices.push({ channel: 3, events: pianoNoteEvts, program: pianoRes.program }); }

    // ── ENSEMBLE (ch 5,6,7) ───────────────────────────────────
    if (!disabledSet.has('ensemble')) {
      st('info', '🎻 Ensemble…'); await w();
      const res = generateEnsemble(bp);
      ['Ensemble V1', 'Ensemble V2', 'Ensemble V3'].forEach((name, vi) => {
        const evts = res.voiceEvents[vi];
        humanize(evts, bp.meta.ppq, humAmt * 0.3, res.channels[vi], params.seed + 5 + vi, bp.meta.barTicks);
        applySwing(evts, bp.meta.ppq, bp.meta.swing ?? 0);
        if (!isFlat) _addCCArc(evts, bp.sections, 90);
        addT(name, evts, res.channels[vi], res.programs[vi] ?? res.program);
        previewVoices.push({ channel: res.channels[vi], events: evts, program: res.programs[vi] ?? res.program });
      });
      prg(82);
    }

    // ── CHORDS (ch 4) — sempre generata ──────────────────────
    {
      st('info', '🎼 Chords…'); await w();
      const res = generateChords(bp);
      if (!isFlat) _addCCArc(res.events, bp.sections, 65);
      addT('Chords', res.events, 4, res.program);
      previewVoices.push({ channel: 4, events: res.events, program: res.program });
    }

    // ── Write MIDI ────────────────────────────────────────────
    st('info', '💾 Writing…'); await w();
    const blob = writer.toBlob();
    AppState.preview.lastURL = URL.createObjectURL(blob);
    const fname = `sumidi_${params.style}_${params.key}_${params.bpm}bpm_s${params.seed}.mid`;
    const ms = (performance.now() - t0).toFixed(0);
    // Lab (Sessione 3): nessuna UI di download era rimasta collegata a
    // gen() dopo S18 — blob e nome restano qui per un bottone di export.
    AppState.preview.lastBlob = blob;
    AppState.preview.lastFilename = fname;

    // ── Render UI ─────────────────────────────────────────────
    // Nota: UI Song Structure, Output MIDI, Notazione, Tabs rimosse in S18 punto 9
    // renderOverview(bp);
    // renderDownload(AppState.preview.lastURL, fname, blob.size, totalTr, totalEv, ms, bp);
    // smToggleCollapse('sm-notation-body','sm-notation-arrow', true);

    // Aggiorna stato preview (dati usati dall'export MIDI)
    AppState.preview.voices = previewVoices;
    AppState.preview.ppqBpm = { ppq: bp.meta.ppq, bpm: bp.meta.bpm };
    // Nota: preview-bar rimosso in S18
    // document.getElementById('preview-bar').style.display = 'flex';

    // ── Popola SessionManager dalle sezioni del blueprint ────────
    smImportFromBlueprint(bp);

    // Popola la cache dei blueprint per ogni sezione (per chord track)
    for (const sec of bp.sections) {
      const secBp = buildSectionBlueprint(
        { key: bp.meta.key, bpm: bp.meta.bpm, style: bp.meta.style },
        {
          id: sec.id, type: sec.type, bars: sec.bars, seed: bp.meta.seed,
          instruments: { drums: { active: true }, bass: { active: true }, guitar: { active: true }, piano: { active: true }, ensemble: { active: true } }
        }
      );
      AppState.cache.bp[`${sec.id}:_bp`] = secBp;
    }

    prg(100);
    setTimeout(() => { const p = document.getElementById('prog'); if (p) p.className = 'prog'; }, 700);
    st('ok', `✅ ${ms}ms · ${totalTr} tracce · ${totalEv} eventi · ${(blob.size / 1024).toFixed(1)} KB`);

  } catch (err) {
    console.error(err);
    st('err', '❌ ' + err.message);
    const p = document.getElementById('prog'); if (p) p.className = 'prog';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '▶ Generate'; }
  }
};


/** Chiama gen() usando i parametri della composer-bar, poi importa il risultato. */
window.smAutoGenerate = async () => {
  // Q2: reset memoria inter-sezione ad ogni full rebuild
  AppState.session.crossMemory = new CrossSectionMemory();
  // Sincronizza parametri gen() dalla composer-bar
  const key = document.getElementById('sm-key')?.value ?? 'Am';
  const bpm = parseInt(document.getElementById('sm-bpm')?.value ?? '90');
  const style = document.getElementById('sm-style')?.value ?? 'unplugged';

  // Session Mode espone solo tonalità, BPM e stile: forma, ensemble e
  // umanizzazione vanno derivati dallo stile (Styles.js, fonte di verità),
  // non lasciati a un default fisso. Senza questa derivazione ogni brano
  // usciva con forma 'unplugged_ballad', ensemble ad archi e umanizzazione
  // al 35% qualunque fosse lo stile scelto (jazz_ballad: 60 battute invece
  // di 40; punk e chiptune umanizzati come una ballad).
  //
  // T4/B3: prima questi valori venivano scritti nei campi nascosti del
  // pannello Classic e riletti da lì da gen() (il "ponte DOM") — smontato,
  // perché index.html non ha più quel pannello dopo la Fase 2. MIDI Flat
  // e i moduli attivi/disattivi non sono mai stati esposti in Session
  // Mode (decisione Sessione 4): restano rispettivamente sempre ON e
  // tutti attivi, come il default che il pannello Classic aveva sempre
  // avuto per questi due controlli.
  const def = STYLES[style] ?? {};
  // B1: a seed bloccato comanda il campo della composer bar — e' cosi' che un
  // seed incollato (a mano o arrivato da un link) riproduce il brano esatto.
  // A seed sbloccato se ne pesca uno nuovo, come sempre.
  const seedDalCampo = _smReadSeedField();
  if (window._seedLocked) {
    if (seedDalCampo !== null) _smLastSeed = seedDalCampo;
  } else {
    _smLastSeed = Math.floor(Math.random() * 99999) + 1;
  }
  const form = _smReadForm(style, def);
  const params = {
    style, key, bpm, form,
    ensemble: def.ensemble?.type,
    seed: _smLastSeed,
  };
  // Il seed usato diventa subito visibile e finisce nell'URL: da qui in poi il
  // brano e' recuperabile anche dopo aver chiuso la scheda. La forma ci va
  // insieme, altrimenti un link con una forma non di default non riprodurrebbe
  // il brano che chi lo manda sta ascoltando.
  _smPublishState(_smLastSeed, style, key, bpm, form);
  const humAmt = def.humanize ?? 0.35;

  const genBtn = document.getElementById('sm-gen-btn');
  if (genBtn) { genBtn.disabled = true; genBtn.textContent = '⏳'; }
  try {
    await gen(params, humAmt, disabled, true);
    smBumpSupportCounter('generate');
  } finally {
    if (genBtn) { genBtn.disabled = false; genBtn.textContent = '⚡ Genera'; }
  }
};

/** V1: blocca/sblocca il seed — a seed bloccato, rigenerare riproduce lo stesso brano. */
window._seedLocked = false;

/** Allinea l'icona del lucchetto allo stato reale: lo cambia anche il campo seed. */
function _smSyncSeedLockBtn() {
  const btn = document.getElementById('sm-seed-lock-btn');
  if (!btn) return;
  btn.textContent = window._seedLocked ? '🔒' : '🔓';
  btn.title = window._seedLocked
    ? 'Seed bloccato: rigenerando riproduci sempre lo stesso brano — clic per sbloccare'
    : 'Blocca il seed: rigenerando riproduci sempre lo stesso brano';
}

window.smToggleSeedLock = () => {
  window._seedLocked = !window._seedLocked;
  _smSyncSeedLockBtn();
};

// ── B1 di PLAN37 — seed recuperabile e stato del brano nell'URL ───────────
// Il README prometteva "stesso seed, stesso stile/tonalita'/BPM => stesso brano
// identico, sempre", ma nel percorso pubblicato il seed nasceva da Math.random(),
// non era mostrato da nessuna parte e non esisteva un campo per reinserirlo: il
// lucchetto lo congelava solo finche' la scheda restava aperta. Chiusa la scheda,
// il brano era perduto — e non c'era modo di darlo a qualcun altro.

// ── A2 di PLAN37 — scelta della forma ─────────────────
// SONG_FORMS definisce 21 forme e Session Mode ne usava una sola per stile
// (`def.defaultForm`): le altre erano raggiungibili solo dal pannello Classic di
// lab.html. Sono 6 forme già scritte e collaudate — fra cui jazz_aaba — che
// aspettavano solo un <select>. Il select compare soltanto per i 4 stili che
// hanno più di una forma: per gli altri 9 mostrerebbe una scelta sola, e la
// composer bar è già densa.

/**
 * Riempie il select delle forme con quelle dello stile corrente e lo mostra
 * solo se c'è davvero da scegliere. Preserva la forma già selezionata se
 * appartiene anche al nuovo stile.
 * @param {string} [formaDaSelezionare] — forza una forma (usata dall'URL)
 */
window.smSyncForms = (formaDaSelezionare = null) => {
  const sel = document.getElementById('sm-form');
  const wrap = document.getElementById('sm-form-wrap');
  if (!sel || !wrap) return;
  const style = document.getElementById('sm-style')?.value ?? 'unplugged';
  const def = STYLES[style] ?? STYLES['unplugged'];
  const forme = def.availableForms?.length ? def.availableForms : [def.defaultForm];

  const precedente = formaDaSelezionare ?? sel.value;
  sel.innerHTML = forme.map(f => `<option value="${f}">${f.replace(/_/g, ' ')}</option>`).join('');
  sel.value = forme.includes(precedente) ? precedente : def.defaultForm;
  // B10: si nasconde, non si toglie. Lo slot resta largo uguale, cosi' la fila
  // dei comandi non si ricompone a ogni cambio di stile.
  wrap.style.visibility = forme.length > 1 ? '' : 'hidden';
};

/** Forma scelta nella composer bar, se è una di quelle dello stile corrente. */
function _smReadForm(style, def) {
  const scelta = document.getElementById('sm-form')?.value;
  const forme = def.availableForms ?? [];
  return scelta && forme.includes(scelta) ? scelta : def.defaultForm;
}

/** Legge il campo seed della composer bar. Ritorna null se vuoto o non valido. */
function _smReadSeedField() {
  const el = document.getElementById('sm-seed');
  if (!el) return null;
  const n = parseInt(el.value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Mostra il seed appena usato e riscrive l'URL con lo stato completo del brano
 * (?style=&key=&bpm=&seed=). Da qui vengono sia il recupero dopo un ricaricamento
 * sia la condivisione: il link nella barra degli indirizzi e' il brano.
 */
function _smPublishState(seed, style, key, bpm, form = null) {
  const el = document.getElementById('sm-seed');
  if (el) el.value = String(seed);
  try {
    const url = new URL(window.location.href);
    const p = { style, key, bpm: String(bpm), seed: String(seed) };
    // La forma finisce nell'URL solo se non è quella di default: un link non
    // deve portarsi dietro un parametro che non dice niente.
    if (form && form !== (STYLES[style] ?? {}).defaultForm) p.form = form;
    url.search = new URLSearchParams(p).toString();
    window.history.replaceState(null, '', url);
  } catch {
    // Pagina aperta da file:// — replaceState non e' permesso. Il campo seed
    // resta comunque compilato, che e' meta' del recupero.
  }
}

/** L'utente ha scritto o incollato un seed: da qui in poi comanda il campo. */
window.smSeedFieldInput = () => {
  const el = document.getElementById('sm-seed');
  if (!el) return;
  const pulito = el.value.replace(/\D/g, '').slice(0, 5);
  if (pulito !== el.value) el.value = pulito;
  // Incollare un seed e poi vederlo ignorato dal Genera sarebbe la stessa
  // promessa non mantenuta di prima: il campo compilato blocca il seed da solo.
  if (pulito && !window._seedLocked) { window._seedLocked = true; _smSyncSeedLockBtn(); }
};

/** Copia negli appunti il link del brano corrente. */
window.smCopyShareLink = async () => {
  const btn = document.getElementById('sm-share-btn');
  const testoOriginale = btn?.textContent ?? '🔗';
  try {
    await navigator.clipboard.writeText(window.location.href);
    if (btn) btn.textContent = '✅';
  } catch {
    if (btn) btn.textContent = '❌';
  } finally {
    if (btn) setTimeout(() => { btn.textContent = testoOriginale; }, 1400);
  }
};

/**
 * Applica alla composer bar lo stato presente nell'URL. Va chiamata PRIMA di
 * smInit(), che legge i controlli per costruire il SessionManager.
 * @returns {boolean} true se l'URL conteneva un seed valido, cioe' se punta a
 *                    un brano preciso da rigenerare all'avvio.
 */
window.smApplyUrlState = () => {
  const p = new URLSearchParams(window.location.search);

  // Stile e tonalita' solo se il valore esiste davvero fra le option: un
  // parametro inventato non deve lasciare la select su un valore impossibile.
  for (const [id, val] of [['sm-style', p.get('style')], ['sm-key', p.get('key')]]) {
    const el = document.getElementById(id);
    if (el && val && Array.from(el.options).some(o => o.value === val)) el.value = val;
  }

  const bpmEl = document.getElementById('sm-bpm');
  const bpm = parseInt(p.get('bpm'), 10);
  if (bpmEl && Number.isFinite(bpm) && bpm >= Number(bpmEl.min) && bpm <= Number(bpmEl.max)) {
    bpmEl.value = String(bpm);
    const v = document.getElementById('sm-bpm-v');
    if (v) v.textContent = String(bpm);
  }

  // Il select delle forme dipende dallo stile appena impostato, quindi va
  // ricostruito prima di provare a selezionare la forma che arriva dal link.
  const formaUrl = p.get('form');
  const formeValide = (STYLES[document.getElementById('sm-style')?.value] ?? {}).availableForms ?? [];
  window.smSyncForms(formaUrl && formeValide.includes(formaUrl) ? formaUrl : null);

  const seed = parseInt(p.get('seed'), 10);
  if (!Number.isFinite(seed) || seed <= 0) return false;
  const seedEl = document.getElementById('sm-seed');
  if (seedEl) seedEl.value = String(seed);
  _smLastSeed = seed;
  window._seedLocked = true;
  _smSyncSeedLockBtn();
  return true;
};

/** V2: randomizza stile/tonalità/BPM nella composer bar visibile e rigenera. */
window.smRandomAll = () => {
  const styleSel = document.getElementById('sm-style');
  const keySel = document.getElementById('sm-key');
  const bpmInput = document.getElementById('sm-bpm');
  const bpmV = document.getElementById('sm-bpm-v');
  if (!styleSel || !keySel || !bpmInput) return;

  // Pesca sempre dalle option realmente presenti nella select — mai da liste
  // duplicate hardcoded, per evitare che tornino a disallinearsi in futuro.
  const styleValues = Array.from(styleSel.options).map(o => o.value);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  const style = pick(styleValues);
  // Tonalità pescata da TUTTE le option: nessuno stile vincola la tonalità
  // (decisione 2026-08-20). Prima il Random restringeva al gruppo Minori o
  // Maggiori secondo defaultScale dello stile.
  const keyValues = Array.from(keySel.options).map(o => o.value);
  // B3: il range viene da Styles.js, non da una copia locale. La copia diceva
  // 60-85 per unplugged, 55-90 per jazz_ballad e 70-100 per neo_soul contro i
  // 60-80, 50-80 e 65-90 dichiarati dagli stili: il dado poteva pescare BPM
  // che lo stile non prevede.
  const { min: bLo, max: bHi } = (STYLES[style] ?? STYLES['unplugged']).defaultBpm;
  const bpm = Math.floor(Math.random() * (bHi - bLo + 1)) + bLo;

  styleSel.value = style;
  keySel.value = pick(keyValues);
  bpmInput.value = bpm;
  if (bpmV) bpmV.textContent = bpm;

  smSyncMeta();
  smAutoGenerate();
};


