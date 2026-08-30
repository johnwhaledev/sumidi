/**
 * SongEngine.js — T4/B3: gen() + ponte Classic/lab.html
 * ─────────────────────────────────────────────────────────
 * Estratto da main.js: il motore di generazione a blueprint intero (gen()),
 * i controlli del pannello Classic (visibile solo in lab.html, nascosto
 * fino a T4/B3 in index.html — rimosso in Fase 2), e le funzioni di
 * export/confronto usate solo da lab.html.
 *
 * gen() non legge più il DOM per i suoi parametri (Fase 1): li riceve
 * espliciti da chi lo chiama. I 3 call site (bottone classic, Session Mode
 * via smAutoGenerate, A/B flat di lab.html) restano tutti in questo file.
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
import { buildGuitarTab, buildBassTab, renderChordChart } from './TabRenderer.js';
import { exportMarkdown, downloadMarkdown } from './MarkdownExporter.js';
import { applyGrooveLock } from './GrooveLock.js';
import { STYLES } from './Styles.js';
import { smImportFromBlueprint, smBumpSupportCounter } from './Session.js';

// ── State ─────────────────────────────────────────────────────
const disabled = new Set();
// T4/B3: seed dell'ultima generazione di smAutoGenerate — prima viveva nel
// campo nascosto p-seed del pannello Classic (riletto da lì a seed
// bloccato); 42 replica lo stesso default HTML del campo, per chi blocca
// il seed prima ancora di generare una prima volta. Usato solo qui: non
// serve centralizzarlo in AppState.session (a differenza di _smgr/
// crossMemory, condivisi anche con Session.js).
let _smLastSeed = 42;
// AppState.preview.lastURL, AppState.preview.lastBP, AppState.preview.voices, AppState.preview.ppqBpm, AppState.preview.tracks, AppState.preview.guitarEvts, AppState.preview.bassEvts → AppState

// ── UI helpers ────────────────────────────────────────────────
window.rnd = () => { document.getElementById('p-seed').value = Math.floor(Math.random() * 99998) + 1; };
window.tog = el => { el.classList.toggle('on'); const m = el.dataset.m; el.classList.contains('on') ? disabled.delete(m) : disabled.add(m); };
window.onStyleChange = () => {
  const style = document.getElementById('p-style').value;
  const formMap = {
    unplugged: 'unplugged_ballad',
    folk: 'folk_standard',
    jazz_ballad: 'jazz_standard',
    neo_soul: 'neo_soul_standard',
    classical: 'classical_standard',
    pop_rock: 'pop_rock_standard',
    blues_rock: 'blues_rock_standard',
    singer_songwriter: 'singer_songwriter_standard',
    cinematic: 'cinematic_standard',
    lo_fi: 'lo_fi_standard',
    punk: 'punk_standard',
    garage_rock: 'garage_rock_standard',
    chiptune: 'chiptune_standard',
  };
  const bpmMap = {
    unplugged: 72,
    folk: 95,
    jazz_ballad: 65,
    neo_soul: 78,
    classical: 80,
    pop_rock: 112,
    blues_rock: 100,
    singer_songwriter: 76,
    cinematic: 72,
    lo_fi: 80,
    punk: 175,
    garage_rock: 132,
    chiptune: 152,
  };
  // Umanizzazione di default per stile (da Styles.js) — prima lo slider
  // restava sempre a 35% indipendentemente dal genere, quindi jazz_ballad
  // (dovrebbe essere più "rubato") e stili tirati come punk/chiptune
  // (dovrebbero restare stretti/rigidi) suonavano con la stessa quantità
  // di umanizzazione. Resta comunque modificabile manualmente dall'utente.
  const humMap = {
    unplugged: 35,
    folk: 40,
    jazz_ballad: 50,
    neo_soul: 45,
    classical: 30,
    pop_rock: 30,
    blues_rock: 40,
    singer_songwriter: 38,
    cinematic: 30,
    lo_fi: 55,
    punk: 18,
    garage_rock: 32,
    chiptune: 0,
  };
  document.getElementById('p-form').value = formMap[style] ?? 'unplugged_ballad';
  const bpm = bpmMap[style] ?? 72;
  document.getElementById('p-bpm').value = bpm;
  document.getElementById('bpm-v').textContent = bpm;
  const hum = humMap[style] ?? 35;
  document.getElementById('p-hum').value = hum;
  document.getElementById('hum-v').textContent = hum + '%';
};

window.randomAll = () => {
  const STYLES = ['unplugged', 'folk', 'jazz_ballad', 'neo_soul', 'classical', 'pop_rock', 'blues_rock', 'singer_songwriter',
    'cinematic', 'lo_fi', 'punk', 'garage_rock', 'chiptune'];
  const KEYS = ['Am', 'Em', 'Dm', 'Bm', 'F#m', 'Cm', 'Gm', 'Fm', 'C#m',
    'C', 'G', 'F', 'D', 'A', 'E', 'B', 'Bb', 'Eb', 'Ab'];
  const FORMS = {
    unplugged: ['unplugged_ballad', 'unplugged_short', 'unplugged_no_bridge', 'unplugged_extended'],
    folk: ['folk_standard', 'folk_short'],
    jazz_ballad: ['jazz_standard', 'jazz_aaba'],
    neo_soul: ['neo_soul_standard'],
    classical: ['classical_standard'],
    pop_rock: ['pop_rock_standard', 'pop_rock_short'],
    blues_rock: ['blues_rock_standard'],
    singer_songwriter: ['singer_songwriter_standard'],
    cinematic: ['cinematic_standard'],
    lo_fi: ['lo_fi_standard'],
    punk: ['punk_standard', 'punk_short'],
    garage_rock: ['garage_rock_standard'],
    chiptune: ['chiptune_standard'],
  };
  const BPM_RANGES = {
    unplugged: [60, 85], folk: [80, 110], jazz_ballad: [55, 90], neo_soul: [70, 100], classical: [60, 80], pop_rock: [100, 130],
    blues_rock: [85, 115], singer_songwriter: [65, 90],
    cinematic: [55, 90], lo_fi: [70, 90], punk: [160, 190], garage_rock: [120, 150], chiptune: [140, 165],
  };
  const ENS = ['strings', 'woodwinds', 'brass', 'chamber'];
  const r = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo;
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  const style = pick(STYLES);
  const [blo, bhi] = BPM_RANGES[style];
  const bpm = r(blo, bhi);

  document.getElementById('p-style').value = style;
  document.getElementById('p-key').value = pick(KEYS);
  document.getElementById('p-bpm').value = bpm;
  document.getElementById('bpm-v').textContent = bpm;
  document.getElementById('p-form').value = pick(FORMS[style]);
  document.getElementById('p-ens').value = pick(ENS);
  document.getElementById('p-seed').value = r(1, 99998);
  document.getElementById('gen-btn').click();
};

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

// Legge i controlli del pannello Classic (p-*) e costruisce l'input di
// gen(). Se il seed non è bloccato, ne pesca uno nuovo e lo scrive nel
// campo p-seed (comportamento invariato: prima viveva dentro gen()).
function _readClassicParams() {
  const seedLocked = !!window._seedLocked;
  if (!seedLocked) {
    const newSeed = Math.floor(Math.random() * 99999) + 1;
    document.getElementById('p-seed').value = newSeed;
  }
  const params = {
    style: document.getElementById('p-style').value,
    key: document.getElementById('p-key').value,
    bpm: parseInt(document.getElementById('p-bpm').value),
    // `|| undefined` come per guitarStyle/drumLine sotto: se il select
    // resta vuoto (valore non presente fra le sue option), buildSong deve
    // ricadere sul default dello stile. Passare '' non lo fa: produce una
    // struttura da ballad qualunque sia lo stile.
    form: document.getElementById('p-form').value || undefined,
    ensemble: document.getElementById('p-ens').value || undefined,
    guitarStyle: document.getElementById('p-guitar').value || undefined,
    drumLine: document.getElementById('p-drumline').value || undefined,
    seed: parseInt(document.getElementById('p-seed').value),
  };
  const humAmt = parseInt(document.getElementById('p-hum').value) / 100;
  const isFlat = document.getElementById('p-flat').checked;
  return { params, humAmt, isFlat };
}

// ── Generator ─────────────────────────────────────────────────
// T4/B3: parametri espliciti invece di leggerli dal DOM — gen() deve
// restare utilizzabile anche quando il pannello Classic non esiste nel
// documento (index.html dopo la Fase 2). I 3 call site (bottone classic/
// lab.html, smAutoGenerate, labCompareFlat) costruiscono l'oggetto con
// _readClassicParams() e lo passano.
const gen = async (params, humAmt, disabledSet, isFlat) => {
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
    let guitarEvents = [], bassEvents = [];
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
      bassEvents = bassRes.events;
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
      guitarEvents = guitarRes.events;
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

    // ── Build tabs (rimossi in S18 punto 9) ────────────────────
    // st('info','🎼 Rendering tabs…'); await w();
    // if (guitarEvents.length) { ... }
    // if (bassEvents.length) { ... }
    // document.getElementById('chord-scroll').innerHTML = ...
    // renderChordEditor(bp);

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

document.getElementById('gen-btn')?.addEventListener('click', () => {
  const { params, humAmt, isFlat } = _readClassicParams();
  gen(params, humAmt, disabled, isFlat);
});

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
  if (!window._seedLocked) _smLastSeed = Math.floor(Math.random() * 99999) + 1;
  const params = {
    style, key, bpm,
    form: def.defaultForm,
    ensemble: def.ensemble?.type,
    seed: _smLastSeed,
  };
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
window.smToggleSeedLock = () => {
  window._seedLocked = !window._seedLocked;
  const btn = document.getElementById('sm-seed-lock-btn');
  if (btn) {
    btn.textContent = window._seedLocked ? '🔒' : '🔓';
    btn.title = window._seedLocked
      ? 'Seed bloccato: rigenerando riproduci sempre lo stesso brano — clic per sbloccare'
      : 'Blocca il seed: rigenerando riproduci sempre lo stesso brano';
  }
};

// V2: BPM di default per stile (min/max presi da SongArchitect.js STYLES.defaultBpm)
const SM_STYLE_BPM_RANGES = {
  unplugged: [60, 85], folk: [80, 110], jazz_ballad: [55, 90], neo_soul: [70, 100],
  classical: [60, 100], pop_rock: [100, 130], blues_rock: [85, 115],
  singer_songwriter: [65, 90], cinematic: [55, 90],
  lo_fi: [70, 90], punk: [160, 190], garage_rock: [120, 150], chiptune: [140, 165],
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
  const [bLo, bHi] = SM_STYLE_BPM_RANGES[style] ?? [70, 130];
  const bpm = Math.floor(Math.random() * (bHi - bLo + 1)) + bLo;

  styleSel.value = style;
  keySel.value = pick(keyValues);
  bpmInput.value = bpm;
  if (bpmV) bpmV.textContent = bpm;

  smSyncMeta();
  smAutoGenerate();
};

// ── Export Markdown ──────────────────────────────────────────────
// Gli eventi sono salvati durante la generazione nelle variabili AppState.preview.guitarEvts e AppState.preview.bassEvts
window.exportMarkdown = () => {
  if (!AppState.preview.lastBP) {
    alert('Genera prima una canzone!');
    return;
  }
  const md = exportMarkdown(AppState.preview.lastBP, AppState.preview.guitarEvts, AppState.preview.bassEvts);
  const fname = `sumidi_${AppState.preview.lastBP.meta.style}_${AppState.preview.lastBP.meta.key}_${AppState.preview.lastBP.meta.bpm}bpm_s${AppState.preview.lastBP.meta.seed}.md`;
  downloadMarkdown(fname, md);
  smBumpSupportCounter('download');
};

// ── Sessione 3 (lab.html) — vetrina per le 8 feature ereditate ────
// Wiring nuovo su codice esistente: buildGuitarTab/buildBassTab/renderChordChart
// sono già importate e già pronte, mancava solo chi le chiamasse.
// Nulla di questo blocco è raggiungibile da index.html: nessun bottone in
// quella pagina punta a queste funzioni.
function _labDownloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

window.labDownloadMidi = () => {
  if (!AppState.preview.lastBlob) { alert('Genera prima una canzone!'); return; }
  _labDownloadBlob(AppState.preview.lastBlob, AppState.preview.lastFilename);
};

window.labRenderGuitarTab = () => {
  const bp = AppState.preview.lastBP;
  if (!bp) { alert('Genera prima una canzone!'); return; }
  document.getElementById('lab-output').innerHTML =
    buildGuitarTab(AppState.preview.guitarEvts ?? [], bp.sections, bp.meta.ppq, bp.meta.barTicks);
};

window.labRenderBassTab = () => {
  const bp = AppState.preview.lastBP;
  if (!bp) { alert('Genera prima una canzone!'); return; }
  document.getElementById('lab-output').innerHTML =
    buildBassTab(AppState.preview.bassEvts ?? [], bp.sections, bp.meta.ppq, bp.meta.barTicks);
};

window.labRenderChordChart = () => {
  const bp = AppState.preview.lastBP;
  if (!bp) { alert('Genera prima una canzone!'); return; }
  document.getElementById('lab-output').innerHTML =
    renderChordChart(bp.sections, bp.meta.totalBars);
};

// Confronto A/B a parità di seed: la feature più prioritaria da giudicare
// (MIDI Flat, tabella priorità PLAN.md) è anche l'unica con un flag binario
// netto — le altre 7 si confrontano già a mano col pannello ora esposto
// (seed fisso, si cambia un parametro alla volta e si rigenera).
window.labCompareFlat = async () => {
  const seedEl = document.getElementById('p-seed');
  const flatEl = document.getElementById('p-flat');
  const btn = document.getElementById('lab-ab-btn');
  const prevLocked = window._seedLocked;
  const prevFlat = flatEl.checked;
  const fixedSeed = seedEl.value;
  btn.disabled = true;
  window._seedLocked = true; // gen() non deve rigenerare il seed fra le due chiamate
  try {
    seedEl.value = fixedSeed;
    flatEl.checked = true; // A = flat ON, nessuna dinamica CC
    { const { params, humAmt, isFlat } = _readClassicParams(); await gen(params, humAmt, disabled, isFlat); }
    _labDownloadBlob(AppState.preview.lastBlob, AppState.preview.lastFilename.replace('.mid', '_flatON.mid'));

    seedEl.value = fixedSeed;
    flatEl.checked = false; // B = flat OFF, dinamica CC7/CC11 scritta
    { const { params, humAmt, isFlat } = _readClassicParams(); await gen(params, humAmt, disabled, isFlat); }
    _labDownloadBlob(AppState.preview.lastBlob, AppState.preview.lastFilename.replace('.mid', '_flatOFF.mid'));
  } finally {
    flatEl.checked = prevFlat;
    window._seedLocked = prevLocked;
    btn.disabled = false;
  }
};

// p-seed-lock non era mai letto da nessuno (dead UI, verificato via grep):
// gen() guarda solo window._seedLocked, impostato altrove dal tasto lucchetto
// di Session Mode. Ricollegato qui perché nel pannello esposto in lab.html
// una checkbox "Lock seed" che non fa nulla confonderebbe chi la usa.
document.getElementById('p-seed-lock')?.addEventListener('change', e => {
  window._seedLocked = e.target.checked;
});
