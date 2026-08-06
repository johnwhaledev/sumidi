    import { AppState } from './AppState.js';       // R1: stato globale
    import { SessionManager, buildSectionBlueprint } from './SessionManager.js';
    import { CHARACTER_ROSTER } from './CharacterRoster.js';
    import {
      createKnob, createSlider,
      createPatternDots, createToggle
    } from '../design/DesignSystem.js';
    import {
      buildSong, makeRng, parseChord, transposeChord,
      CHORD_INTERVALS, PITCH_CLASS,
      buildChordTonePool
    } from './SongArchitect.js';
    import { MidiWriter } from './MidiWriter.js';
    import { generateDrums } from './Percussionist.js';
    import { generateDrumMachine, DM_PRESETS, DM_CHANNELS } from './DrumMachineGenerator.js';
    import { generateBass } from './BassGenerator.js';
    import { generateGuitar } from './GuitarGenerator.js';
    import { generateEnsemble } from './EnsembleGenerator.js';
    import { generatePiano } from './PianoGenerator.js';
    import { generateChords } from './ChordGenerator.js';
    import { humanize, applySwing } from './Humanizer.js';
    import { buildDrumContext, CrossSectionMemory } from './FlowCore.js';
    import {
      buildGuitarTab, buildBassTab,
      renderChordChart
    } from './TabRenderer.js';
    import { exportMarkdown, downloadMarkdown } from './MarkdownExporter.js';
    import { applyGrooveLock } from './GrooveLock.js';

    // ── State ─────────────────────────────────────────────────────
    const disabled = new Set();
    // AppState.preview.lastURL, AppState.preview.lastBP, AppState.preview.voices, AppState.preview.ppqBpm, AppState.preview.tracks, AppState.preview.guitarEvts, AppState.preview.bassEvts → AppState

    // Nomi note (per chord editor)
    const _NOTE_S = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const _NOTE_F = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    // Range strumento per clamping trasposizione
    const _INST_RANGE = {
      1: [28, 55], 2: [40, 76], 3: [36, 84],
      4: [52, 76], 5: [48, 84], 6: [48, 84], 7: [48, 84],
    };

    // ── UI helpers ────────────────────────────────────────────────
    window.rnd = () => { document.getElementById('p-seed').value = Math.floor(Math.random() * 99998) + 1; };
    window.tog = el => { el.classList.toggle('on'); const m = el.dataset.m; el.classList.contains('on') ? disabled.delete(m) : disabled.add(m); };
    window.showTab = (id, btn) => {
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.getElementById(id).classList.add('active');
      btn.classList.add('active');
    };
    window.onStyleChange = () => {
      const style = document.getElementById('p-style').value;
      const formMap = {
        unplugged: 'unplugged_ballad',
        folk: 'folk_standard',
        jazz_ballad: 'jazz_standard',
        neo_soul: 'neo_soul_standard',
        classical: 'classical_standard',
        pop_rock: 'pop_rock_standard',
        bossa_nova: 'bossa_nova_standard',
        blues_rock: 'blues_rock_standard',
        singer_songwriter: 'singer_songwriter_standard',
        latin: 'latin_standard',
        cinematic: 'cinematic_standard',
        reggae: 'reggae_standard',
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
        bossa_nova: 130,
        blues_rock: 100,
        singer_songwriter: 76,
        latin: 120,
        cinematic: 72,
        reggae: 84,
        lo_fi: 80,
        punk: 175,
        garage_rock: 132,
        chiptune: 152,
      };
      document.getElementById('p-form').value = formMap[style] ?? 'unplugged_ballad';
      const bpm = bpmMap[style] ?? 72;
      document.getElementById('p-bpm').value = bpm;
      document.getElementById('bpm-v').textContent = bpm;
    };

    window.randomAll = () => {
      const STYLES = ['unplugged', 'folk', 'jazz_ballad', 'neo_soul', 'classical', 'pop_rock', 'bossa_nova', 'blues_rock', 'singer_songwriter',
        'latin', 'cinematic', 'reggae', 'lo_fi', 'punk', 'garage_rock', 'chiptune'];
      const KEYS = ['Am', 'Em', 'Dm', 'Bm', 'F#m', 'Cm', 'Gm', 'Fm', 'C#m',
        'C', 'G', 'F', 'D', 'A', 'E', 'B', 'Bb', 'Eb', 'Ab'];
      const FORMS = {
        unplugged: ['unplugged_ballad', 'unplugged_short', 'unplugged_no_bridge', 'unplugged_extended'],
        folk: ['folk_standard', 'folk_short'],
        jazz_ballad: ['jazz_standard', 'jazz_aaba'],
        neo_soul: ['neo_soul_standard'],
        classical: ['classical_standard'],
        pop_rock: ['pop_rock_standard', 'pop_rock_short'],
        bossa_nova: ['bossa_nova_standard', 'bossa_nova_aaba'],
        blues_rock: ['blues_rock_standard'],
        singer_songwriter: ['singer_songwriter_standard'],
        latin: ['latin_standard'],
        cinematic: ['cinematic_standard'],
        reggae: ['reggae_standard'],
        lo_fi: ['lo_fi_standard'],
        punk: ['punk_standard', 'punk_short'],
        garage_rock: ['garage_rock_standard'],
        chiptune: ['chiptune_standard'],
      };
      const BPM_RANGES = {
        unplugged: [60, 85], folk: [80, 110], jazz_ballad: [55, 90], neo_soul: [70, 100], classical: [60, 80], pop_rock: [100, 130],
        bossa_nova: [110, 145], blues_rock: [85, 115], singer_songwriter: [65, 90],
        latin: [100, 140], cinematic: [55, 90], reggae: [70, 100], lo_fi: [70, 90], punk: [160, 190], garage_rock: [120, 150], chiptune: [140, 165],
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

    const st = (t, m) => { const e = document.getElementById('status'); e.className = t; e.textContent = m; };
    const prg = p => { document.getElementById('prog').className = 'prog on'; document.getElementById('pbar').style.width = p + '%'; };
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
    const gen = async () => {
      const btn = document.getElementById('gen-btn');
      btn.disabled = true; btn.innerHTML = '<span class="sp"></span>Generating…';
      if (AppState.preview.lastURL) { URL.revokeObjectURL(AppState.preview.lastURL); AppState.preview.lastURL = null; }
      prg(4); st('info', '🎼 Blueprint…'); await w();

      try {
        const seedLocked = !!window._seedLocked;
        if (!seedLocked) {
          const newSeed = Math.floor(Math.random() * 99999) + 1;
          document.getElementById('p-seed').value = newSeed;
        }
        const params = {
          style: document.getElementById('p-style').value,
          key: document.getElementById('p-key').value,
          bpm: parseInt(document.getElementById('p-bpm').value),
          form: document.getElementById('p-form').value,
          ensemble: document.getElementById('p-ens').value,
          guitarStyle: document.getElementById('p-guitar').value || undefined,
          drumLine: document.getElementById('p-drumline').value || undefined,
          seed: parseInt(document.getElementById('p-seed').value),
        };
        const humAmt = parseInt(document.getElementById('p-hum').value) / 100;

        const t0 = performance.now();
        const bp = buildSong(params);
        AppState.preview.lastBP = bp;

        // Disable masked modules
        for (const m of disabled)
          for (const sec of bp.sections)
            if (sec.modules[m]) sec.modules[m].active = false;

        // Solo instrument: se un solo modulo è attivo, copre tutte le sezioni
        // adattando lo stile al tipo di sezione (intro/verse/chorus/bridge/outro).
        // Eccezione: se l'utente ha selezionato esplicitamente uno stile chitarra,
        // quel stile viene usato su tutta la canzone (es. "riff" rimane riff).
        const activeModules = ['drums', 'bass', 'guitar', 'piano', 'ensemble'].filter(m => !disabled.has(m));
        if (activeModules.length === 1) {
          const soloMod = activeModules[0];
          const userGuitarStyle = document.getElementById('p-guitar').value; // '' = Auto
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
            if (soloMod === 'guitar' && userGuitarStyle) {
              mod.style = userGuitarStyle;
            } else {
              const styleMap = SOLO_STYLES[soloMod];
              if (styleMap) mod.style = styleMap[sec.type] ?? mod.style;
            }
          }
        }

        const writer = new MidiWriter(bp.meta.ppq);
        writer.setTempo(bp.meta.bpm);
        writer.setTimeSignature(bp.meta.beatsPerBar ?? 4, 4);
        // Key signature (FF 59): rootPc → sharps(+)/flats(-) per tonalità maggiori
        {
          const SF = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5], pc = bp.meta.keyInfo.rootPc;
          writer.setKeySignature(bp.meta.keyInfo.isMinor ? SF[(pc + 3) % 12] : SF[pc], bp.meta.keyInfo.isMinor);
        }
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

        // Check MIDI Flat mode (no CC7/CC11 automation)
        const isFlat = document.getElementById('p-flat').checked;

        // Q2: memoria inter-sezione locale per il path gen() (full blueprint)
        const genCrossMemory = new CrossSectionMemory();

        // ── Raccolta eventi per GrooveLock (pre-addT) ────────────────
        // Tutti i generatori riempiono allTrackEvts prima di scrivere il MIDI.
        // GrooveLock poi allinea i pocket offset inter-strumentali.
        const allTrackEvts = { drums: null, bass: null, guitar: null, piano: null };

        // ── DRUMS (ch 9) ─────────────────────────────────────────
        let drumEvts = [];
        if (!disabled.has('drums')) {
          st('info', '🥁 Drums…'); await w();
          drumEvts = generateDrums(bp);
          humanize(drumEvts, bp.meta.ppq, humAmt * 0.4, 9, params.seed + 1, bp.meta.barTicks);
          const drumSwing = (bp.meta.swing ?? 0) * 0.33;
          applySwing(drumEvts, bp.meta.ppq, drumSwing);
          if (!isFlat) _addCCArc(drumEvts, bp.sections, 105);
          allTrackEvts.drums = drumEvts;
          prg(18);
        }

        // ── S5-A: DrumContext (buildDrumContext definita a livello modulo) ─
        const drumContext = buildDrumContext(drumEvts, bp.meta.ppq, bp.meta.barTicks);

        // ── BASS (ch 1) ───────────────────────────────────────────
        let bassRes = null;
        if (!disabled.has('bass')) {
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
        if (!disabled.has('guitar')) {
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
        if (!disabled.has('piano')) {
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
        if (!disabled.has('ensemble')) {
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
        setTimeout(() => document.getElementById('prog').className = 'prog', 700);
        st('ok', `✅ ${ms}ms · ${totalTr} tracce · ${totalEv} eventi · ${(blob.size / 1024).toFixed(1)} KB`);

      } catch (err) {
        console.error(err);
        st('err', '❌ ' + err.message);
        document.getElementById('prog').className = 'prog';
      } finally {
        btn.disabled = false; btn.textContent = '▶ Generate';
      }
    };

    document.getElementById('gen-btn').addEventListener('click', gen);
    window.gen = gen;  // esposto per il bottone ⚡ Rigenera nel chord editor

    // ── Chord Editor ──────────────────────────────────────────────
    const _QUALITIES = Object.keys(CHORD_INTERVALS);
    const _PC_NAMES = Object.fromEntries(Object.entries(PITCH_CLASS).map(([k, v]) => [v, k]));

    function renderChordEditor(bp) {
      const useFlats = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm']);
      const noteNames = useFlats.has(bp.meta.key) ? _NOTE_F : _NOTE_S;

      let html = '';
      bp.sections.forEach((sec, si) => {
        if (!sec.harmonicMap?.length) return;
        html += `<div class="ce-section">
      <div class="ce-section-title">${sec.type} · ${sec.bars} bar</div>
      <div class="ce-grid">`;

        sec.harmonicMap.forEach((region, ri) => {
          const parsed = parseChord(region.chord) ?? { rootPc: region.rootPc, quality: 'maj' };
          const bars = Math.round((region.end_tick - region.start_tick) / (bp.meta.ppq * 4));

          const rootOpts = _NOTE_S.map((_, i) =>
            `<option value="${i}"${i === parsed.rootPc ? ' selected' : ''}>${noteNames[i]}</option>`
          ).join('');
          const qualOpts = _QUALITIES.map(q =>
            `<option value="${q}"${q === parsed.quality ? ' selected' : ''}>${q}</option>`
          ).join('');

          html += `<div class="chord-cell"
                    data-si="${si}" data-ri="${ri}"
                    data-orig-root="${parsed.rootPc}" data-orig-qual="${parsed.quality}">
        <div class="ce-orig">${region.chord} · ${bars}b</div>
        <select class="chord-root-sel" onchange="markChordChanged(this)">${rootOpts}</select>
        <select class="chord-qual-sel" onchange="markChordChanged(this)">${qualOpts}</select>
      </div>`;
        });

        html += `</div></div>`;
      });

      document.getElementById('chord-edit-body').innerHTML = html;
      document.getElementById('ce-status').textContent = '';
    }

    window.markChordChanged = sel => {
      const cell = sel.closest('.chord-cell');
      const newRoot = +cell.querySelector('.chord-root-sel').value;
      const newQual = cell.querySelector('.chord-qual-sel').value;
      const origRoot = +cell.dataset.origRoot;
      const origQual = cell.dataset.origQual;
      cell.classList.toggle('changed', newRoot !== origRoot || newQual !== origQual);
    };

    window.applyChordEdits = () => {
      const changed = [...document.querySelectorAll('.chord-cell.changed')];
      if (!changed.length) {
        document.getElementById('ce-status').textContent = 'Nessuna modifica';
        return;
      }

      changed.forEach(cell => {
        const si = +cell.dataset.si;
        const ri = +cell.dataset.ri;
        const region = AppState.preview.lastBP.sections[si].harmonicMap[ri];

        const newRootPc = +cell.querySelector('.chord-root-sel').value;
        const newQual = cell.querySelector('.chord-qual-sel').value;

        // Percorso più corto (±6 semitoni)
        let delta = (newRootPc - region.rootPc + 12) % 12;
        if (delta > 6) delta -= 12;

        if (delta !== 0) {
          for (const track of AppState.preview.tracks) {
            if (track.channel === 9) continue;
            const [lo, hi] = _INST_RANGE[track.channel] ?? [36, 84];
            for (const evt of track.events) {
              if (evt.cc != null) continue;
              if (evt.tick >= region.start_tick && evt.tick < region.end_tick) {
                evt.note = Math.max(lo, Math.min(hi, evt.note + delta));
              }
            }
          }
        }

        // Aggiorna region nel blueprint
        const newIntervals = CHORD_INTERVALS[newQual] ?? [0, 4, 7];
        const newChordStr = _NOTE_S[newRootPc] + (newQual === 'maj' ? '' : newQual);
        region.rootPc = newRootPc;
        region.chord = newChordStr;
        region.chord_degrees = newIntervals;
        region.chord_tones = buildChordTonePool({ rootPc: newRootPc, intervals: newIntervals }, 48, 84);

        // Salva nuovo stato come baseline
        cell.dataset.origRoot = newRootPc;
        cell.dataset.origQual = newQual;
        cell.classList.remove('changed');
        cell.querySelector('.ce-orig').textContent =
          `${newChordStr} · ${cell.querySelector('.ce-orig').textContent.split('·')[1]?.trim()}`;
      });

      _rebuildMidi();
    };

    function _rebuildMidi() {
      const writer = new MidiWriter(AppState.preview.lastBP.meta.ppq);
      writer.setTempo(AppState.preview.lastBP.meta.bpm);
      writer.setTimeSignature(AppState.preview.lastBP.meta.beatsPerBar ?? 4, 4);
      {
        const SF = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5], pc = AppState.preview.lastBP.meta.keyInfo.rootPc;
        writer.setKeySignature(AppState.preview.lastBP.meta.keyInfo.isMinor ? SF[(pc + 3) % 12] : SF[pc], AppState.preview.lastBP.meta.keyInfo.isMinor);
      }
      {
        const LBL = { intro: 'Intro', verse: 'Verse', chorus: 'Chorus', bridge: 'Bridge', outro: 'Outro' };
        const tot = AppState.preview.lastBP.sections.reduce((a, s) => ({ ...a, [s.type]: (a[s.type] || 0) + 1 }), {});
        const cnt = {}; for (const s of AppState.preview.lastBP.sections) {
          cnt[s.type] = (cnt[s.type] || 0) + 1;
          const l = LBL[s.type] || s.type; writer.addMarker(s.startTick, tot[s.type] > 1 ? `${l} ${cnt[s.type]}` : l);
        }
      }

      for (const track of AppState.preview.tracks) {
        const t = writer.addTrack(track.name);
        if (track.program != null) t.programChange(0, track.program, track.channel);
        for (const e of track.events) {
          if (e.cc != null) t.controlChange(e.tick, e.cc, e.value, track.channel);
          else {
            t.noteOn(e.tick, e.note, e.velocity, track.channel);
            t.noteOff(e.tick + e.duration, e.note, track.channel);
          }
        }
      }

      if (AppState.preview.lastURL) URL.revokeObjectURL(AppState.preview.lastURL);
      const blob = writer.toBlob();
      AppState.preview.lastURL = URL.createObjectURL(blob);

      // Aggiorna link download
      const dlLink = document.querySelector('#dl-list a');
      if (dlLink) dlLink.href = AppState.preview.lastURL;

      // Aggiorna preview voices
      AppState.preview.voices = AppState.preview.tracks.map(t => ({ channel: t.channel, events: t.events, program: t.program }));

      document.getElementById('ce-status').textContent =
        `✅ ${document.querySelectorAll('.chord-cell.changed').length === 0 ? 'Applicato' : ''} · MIDI aggiornato`;
      setTimeout(() => {
        const el = document.getElementById('ce-status');
        if (el) el.textContent = '';
      }, 3000);
    }

    // ── Render overview ───────────────────────────────────────────
    function renderOverview(bp) {
      const { meta, sections } = bp;
      const beatsPerBar = meta.beatsPerBar ?? 4;
      const dur = (s => (
        `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
      ))((meta.totalBars * beatsPerBar / meta.bpm) * 60);
      const timeSig = `${beatsPerBar}/4`;

      document.getElementById('stats-row').innerHTML =
        [[meta.totalBars, 'Bar'], [sections.length, 'Sezioni'], [dur, 'Durata'],
        [meta.bpm, 'BPM'], [timeSig, 'Metro'], [meta.key, 'Key'], [meta.ensemble.type, 'Ensemble']]
          .map(([v, l]) => `<div class="stat"><span class="v">${v}</span><span class="l">${l}</span></div>`)
          .join('');

      const ICONS = ['🥁', '🎸', '🎵', '🎹', '🎻'];
      const MKEYS = ['drums', 'bass', 'guitar', 'piano', 'ensemble'];
      const BADGE = { intro: 'bi', verse: 'bv', chorus: 'bc', bridge: 'bbr', outro: 'bo' };

      document.getElementById('struct-body').innerHTML = sections.map(s => {
        const pips = Array.from({ length: 10 }, (_, i) =>
          `<span class="ep ${i < s.energy ? (s.energy >= 8 ? 'hi' : 'on') : ''}"></span>`).join('');
        const mods = MKEYS.map((k, i) =>
          `<span class="mm ${s.modules[k]?.active ? 'on' : 'off'}" title="${k}">${ICONS[i]}</span>`).join('');
        const prog = s.progression.slice(0, 4).join(' ') + (s.progression.length > 4 ? ` …` : '');
        return `<div class="srow">
      <div><span class="badge ${BADGE[s.type] ?? 'bo'}">${s.type}</span>${s.index > 0 ? ` <span style="color:var(--muted);font-size:9px">×${s.index + 1}</span>` : ''}</div>
      <div style="color:var(--muted)">${s.bars}b</div>
      <div><span class="estrip">${pips}</span></div>
      <div style="color:var(--teal2)">${prog}</div>
      <div class="mmini">${mods}</div>
    </div>`;
      }).join('');

      document.getElementById('ov-card').style.display = 'block';
      document.getElementById('sm-ov-body').style.display = 'block';
    }

    // Nota: renderDownload() (pannello download con solo-traccia) era codice morto,
    // mai chiamato dopo la rimozione UI in S18 — eliminato insieme al preview audio.

    // ── Session Panels — S5 ───────────────────────────────────────────
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
      const section = _smgr?.getSection(sectionId);
      const panelEl = document.getElementById(`sm-panel-${sectionId}`);
      if (section && panelEl) { panelEl.innerHTML = ''; smBuildPanelContent(sectionId, section, panelEl); }
    };

    // Salva un singolo param e invalida la cache dell'strumento
    window.smSetParam = (sectionId, instrument, key, value) => {
      _smgr?.setInstrumentParams(sectionId, instrument, { [key]: value });
      smInvalidateCache(sectionId, instrument);
    };

    // Seleziona un personaggio: imposta style e feel di default del personaggio
    window.smSelectCharacter = (sectionId, instrument, character) => {
      _smgr?.setCharacter(sectionId, instrument, character.id);
      // Applica style/feel come param strumento (non sovrascrive ensStyle)
      const paramUpdate = { feel: character.feel };
      if (instrument === 'ensemble') {
        paramUpdate.ensStyle = character.style;  // tipo strumento (strings/brass/…)
      } else {
        paramUpdate.style = character.style;
      }
      _smgr?.setInstrumentParams(sectionId, instrument, paramUpdate);
      smInvalidateCache(sectionId, instrument);
      smRender();
      // Ricarica cache in background per aggiornare i pattern dots
      smGenerateSection(sectionId).then(() => {
        const panelEl = document.getElementById(`sm-panel-${sectionId}`);
        if (panelEl && AppState.ui.expanded.has(sectionId)) {
          const section = _smgr?.getSection(sectionId);
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
      const drumStyles = ['brushes', 'rock', 'cajon', 'jazz', 'blues_shuffle', 'bossa', 'pop', 'waltz_8th'];
      const percStyles = ['bossa', 'reggae', 'cajon', 'latin', 'folk'];
      const styleList = isPerc ? percStyles : drumStyles;
      const defaultStyle = isPerc ? 'bossa' : 'rock';

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
        const dotsComp = createPatternDots(row, {
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
      const section = _smgr?.getSection(sectionId);
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
      _smgr?.setInstrumentParams(sectionId, 'drums', { dmPreset: presetName, dmPattern: null });
      _smgr?.invalidateCache(sectionId, 'drums');
      smRender();
    };

    // Handler per pattern dots modificati (kick/snare/hh)
    // Modifica direttamente gli eventi cached (kick=35/36, snare=38/40, hh=42/44/46)
    window.smDmPatternChanged = function (sectionId, patternType, newPattern) {
      const section = _smgr?.getSection(sectionId);
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
      _smgr?.setInstrumentParams(sectionId, 'drums', { customPattern: current });

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
        const section = _smgr?.getSection(sectionId);
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
      if (_smgr) _smgr.mutateInstrumentSeed(sectionId, instrument);
      smRender();
      // Il seed è cambiato: la cache di questo strumento (usata dai pattern
      // dots) non era più invalidata automaticamente — restava il pattern del
      // seed precedente (o spariva senza più tornare). Rigenera e riporta i
      // pallini coerenti col nuovo seed.
      _smRegenInstrument(sectionId, instrument);
    };

    window.smCopySeed = (targetSectionId, targetInst, sourcePath) => {
      const [srcSecId, srcInst] = sourcePath.split(':');
      const srcSec = _smgr?.getSection(srcSecId);
      if (srcSec && _smgr) _smgr.mutateInstrumentSeed(targetSectionId, targetInst, srcSec.instruments[srcInst].seed);
      smRender();
      _smRegenInstrument(targetSectionId, targetInst);
    };

    function _getSeedOptionsHTML(skipSecId, skipInst) {
      if (!_smgr) return '';
      return _smgr.getSections().flatMap(sec =>
        ['drums', 'bass', 'guitar', 'piano', 'ensemble']
          .filter(inst => sec.instruments[inst].active && !(sec.id === skipSecId && inst === skipInst))
          .map(inst => `<option value="${sec.id}:${inst}">${sec.label} → ${inst}</option>`)
      ).join('');
    }

    // ── Session Engine ────────────────────────────────────────────────
    // AppState.cache.sm, AppState.cache.bp → AppState.cache

    // Salt per seed isolation per strumento
    const SM_SALT = { drums: 0xDEAD, bass: 0xBEEF, guitar: 0xCAFE, piano: 0x7EA5, ensemble: 0xF00D };

    /**
     * Genera tutti gli strumenti attivi per una sezione.
     * Rispetta la cache: se un strumento è locked + cached, lo riutilizza.
     * @param {string} sectionId
     * @param {number} humAmt  — 0..1
     * @returns {{ bp, voices }} — voices: array per SynthPreview
     */
    async function smGenerateSection(sectionId, humAmt = 0.35) {
      if (!_smgr) return null;
      const state = _smgr.getState();
      const section = _smgr.getSection(sectionId);
      if (!section) return null;

      const bp = buildSectionBlueprint(
        { key: state.key, bpm: state.bpm, style: state.style },
        section
      );
      AppState.cache.bp[`${sectionId}:_bp`] = bp;  // usato da smExportChordChart e chord track
      // Aggiorna i chip chord track se la sezione non ha progressione custom
      if (!section.progression?.length) smRenderChordTrack();

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
            applySwing(evts, bp.meta.ppq, (bp.meta.swing ?? 0) * 0.33);
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
          const res = generateGuitar(bp, smDrumCtx, seed, _smCrossMemory);
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
          const res = generatePiano(bp, smDrumCtx, seed, _smCrossMemory);
          const noteEvts = res.events.filter(e => e.cc == null);
          humanize(noteEvts, bp.meta.ppq, humAmt * 0.5, 3, seed + 4, bp.meta.barTicks);
          applySwing(noteEvts, bp.meta.ppq, bp.meta.swing ?? 0);
          AppState.cache.sm[ckey] = { events: noteEvts, program: inst.params?.program ?? res.program };
        }
        if (AppState.cache.sm[ckey]?.events?.length)
          voices.push({ channel: 3, events: AppState.cache.sm[ckey].events, program: AppState.cache.sm[ckey].program });
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
        const section = _smgr?.getSection(sectionId);
        if (!section) return;
        for (const inst of Object.keys(section.instruments)) {
          if (!section.instruments[inst].locked) delete AppState.cache.sm[`${sectionId}:${inst}`];
        }
      }
    }

    window.smRegenerateSection = sectionId => {
      smInvalidateCache(sectionId);
      _smgr?.mutateSeed(sectionId);
      smRender();
      // Ricarica cache in background per aggiornare i pattern dots nel flyout/panel
      smGenerateSection(sectionId).then(() => {
        const section = _smgr?.getSection(sectionId);
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

    // ── Session Mode — stato e rendering ─────────────────────────────
    let _smgr = null;
    // Q2: memoria melodica inter-sezione — persiste tra chiamate a smGenerateSection
    let _smCrossMemory = new CrossSectionMemory();

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

    const SM_BADGE = { intro: 'bi', verse: 'bv', chorus: 'bc', bridge: 'bbr', outro: 'bo' };
    const SM_ICONS = { drums: '🥁', bass: '🎸', guitar: '🎵', piano: '🎹', ensemble: '🎻' };

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
    function smImportFromBlueprint(bp) {
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

      if (!_smgr) {
        _smgr = new SessionManager({ key, bpm, style });
      } else {
        _smgr.setMeta({ key, bpm, style });
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
      _smgr.replaceAllSections(sectionSpecs);

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

    function smBumpSupportCounter(kind) {
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

    /** Chiama gen() usando i parametri della composer-bar, poi importa il risultato. */
    window.smAutoGenerate = async () => {
      // Q2: reset memoria inter-sezione ad ogni full rebuild
      _smCrossMemory = new CrossSectionMemory();
      // Sincronizza parametri gen() dalla composer-bar
      const key = document.getElementById('sm-key')?.value ?? 'Am';
      const bpm = document.getElementById('sm-bpm')?.value ?? '90';
      const style = document.getElementById('sm-style')?.value ?? 'unplugged';

      // Scrivi nei controlli del classic panel (usati da gen())
      const pKey = document.getElementById('p-key');
      const pBpm = document.getElementById('p-bpm');
      const pStyle = document.getElementById('p-style');
      const bpmV = document.getElementById('bpm-v');
      if (pKey) pKey.value = key;
      if (pBpm) { pBpm.value = bpm; if (bpmV) bpmV.textContent = bpm; }
      if (pStyle) pStyle.value = style;

      const genBtn = document.getElementById('sm-gen-btn');
      if (genBtn) { genBtn.disabled = true; genBtn.textContent = '⏳'; }
      try {
        await gen();
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
      classical: [60, 100], pop_rock: [100, 130], bossa_nova: [110, 145], blues_rock: [85, 115],
      singer_songwriter: [65, 90], latin: [100, 140], cinematic: [55, 90], reggae: [70, 100],
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
      const keyValues = Array.from(keySel.options).map(o => o.value);
      const pick = arr => arr[Math.floor(Math.random() * arr.length)];

      const style = pick(styleValues);
      const [bLo, bHi] = SM_STYLE_BPM_RANGES[style] ?? [70, 130];
      const bpm = Math.floor(Math.random() * (bHi - bLo + 1)) + bLo;

      styleSel.value = style;
      keySel.value = pick(keyValues);
      bpmInput.value = bpm;
      if (bpmV) bpmV.textContent = bpm;

      smSyncMeta();
      smAutoGenerate();
    };

    function smInit() {
      AppState.ui.flyoutOpen = null;
      _smgr = new SessionManager({
        key: document.getElementById('sm-key').value,
        bpm: parseInt(document.getElementById('sm-bpm').value),
        style: document.getElementById('sm-style').value,
      });
      smRender();
    }

    window.smSyncMeta = () => {
      if (!_smgr) return;
      _smgr.setMeta({
        key: document.getElementById('sm-key').value,
        bpm: parseInt(document.getElementById('sm-bpm').value),
        style: document.getElementById('sm-style').value,
      });
    };

    window.smAddSection = type => {
      if (!_smgr) smInit();
      _smgr.addSection(type);
      smRender();
    };

    window.smRemoveSection = id => {
      _smgr.removeSection(id);
      smRender();
    };

    window.smMutateSeed = id => {
      _smgr.mutateSeed(id);
      smRender();
    };

    window.smLockSeed = (id, locked) => {
      _smgr.lockSection(id, locked);
      smRender();
    };

    window.smSetProgression = (id, val) => {
      const prog = val.trim() ? val.trim().split(/\s+/) : null;
      if (_smgr) _smgr.setSectionProgression(id, prog);
      smInvalidateCache(id);
      smRender();
    };

    window.smMoveSection = (id, dir) => {
      _smgr.moveSection(id, dir);
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
      const section = _smgr?.getSection(sectionId);
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
      if (!trackEl || !_smgr) return;
      const secs = _smgr.getSections();
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
          // F3: chip con larghezza proporzionale al numero di accordi nella sezione
          const chipW = Math.max(22, Math.floor(w / chords.length) - 3);
          chips = chords.map((chord, ci) => {
            const isEdit = AppState.ui.chipEditing?.sectionId === sec.id && AppState.ui.chipEditing?.chordIndex === ci;
            return `<div style="position:relative;display:inline-block">
          <button class="chord-chip${isCustom ? ' custom' : ''}${isEdit ? ' editing' : ''}"
                  style="width:${chipW}px;min-width:${chipW}px;overflow:hidden;"
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

    // Apre/chiude il micro-editor per un chip
    window.smChipClick = (sectionId, chordIndex) => {
      if (AppState.ui.chipEditing?.sectionId === sectionId && AppState.ui.chipEditing?.chordIndex === chordIndex) {
        AppState.ui.chipEditing = null;
      } else {
        AppState.ui.chipEditing = { sectionId, chordIndex };
      }
      smRenderChordTrack();
    };

    window.smChipClose = () => { AppState.ui.chipEditing = null; smRenderChordTrack(); };

    // Applica la modifica dell'editor al chip
    window.smChipApply = (sectionId, chordIndex) => {
      const section = _smgr?.getSection(sectionId);
      if (!section) return;
      const root = document.getElementById(`ce-root-${sectionId}-${chordIndex}`)?.value ?? 'C';
      const qual = document.getElementById(`ce-qual-${sectionId}-${chordIndex}`)?.value ?? '';
      const bass = document.getElementById(`ce-bass-${sectionId}-${chordIndex}`)?.value;
      const newChord = root + qual + (bass ? '/' + bass : '');

      // Clona la progressione (o costruiscila dall'auto se era la prima modifica custom)
      const baseChords = section.progression?.length
        ? [...section.progression]
        : _smGetSectionChords(sectionId);
      baseChords[chordIndex] = newChord;

      _smgr.setSectionProgression(sectionId, baseChords);
      smInvalidateCache(sectionId);
      AppState.ui.chipEditing = null;
      smRenderChordTrack();
    };

    // Aggiunge un accordo alla fine della progressione custom
    window.smChipAdd = sectionId => {
      const section = _smgr?.getSection(sectionId);
      if (!section) return;
      const base = section.progression?.length
        ? [...section.progression]
        : _smGetSectionChords(sectionId);
      base.push('C');
      _smgr.setSectionProgression(sectionId, base);
      smInvalidateCache(sectionId);
      smRenderChordTrack();
    };

    // F4: imposta progressione di default per sezione aggiunta senza genera
    window.smChipInitSection = sectionId => {
      const section = _smgr?.getSection(sectionId);
      if (!section) return;
      const def = CHORD_DEFAULTS_BY_TYPE[section.type] ?? ['C', 'G', 'Am', 'F'];
      _smgr.setSectionProgression(sectionId, [...def]);
      smRenderChordTrack();
    };

    // Elimina un chip dalla progressione custom
    window.smChipDelete = (sectionId, chordIndex) => {
      const section = _smgr?.getSection(sectionId);
      if (!section) return;
      const base = section.progression?.length
        ? [...section.progression]
        : _smGetSectionChords(sectionId);
      if (base.length <= 1) return;
      base.splice(chordIndex, 1);
      _smgr.setSectionProgression(sectionId, base);
      smInvalidateCache(sectionId);
      AppState.ui.chipEditing = null;
      smRenderChordTrack();
    };

    // Reset alla progressione automatica
    window.smChipReset = sectionId => {
      _smgr?.setSectionProgression(sectionId, null);
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
      if (!_smgr) return;
      const secs = _smgr.getSections();
      const n = secs.length;

      document.getElementById('sm-count').textContent =
        n === 0 ? '0 sezioni' : `${n} sezione${n !== 1 ? 'i' : ''}`;

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
          return `<div class="lanes-sec-label${isSecFly ? ' sm-cfg-open' : ''}" style="width:${w}px;cursor:pointer"
           title="${sec.label} · ${sec.bars} bars — clic per rigenerare o rimuovere l'intera sezione"
           onclick="smSectionFlyout('${sec.id}')">
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
      if (!AppState.ui.flyoutOpen || !_smgr.getSection(AppState.ui.flyoutOpen.sectionId)) {
        flyoutEl.style.display = 'none';
        AppState.ui.flyoutOpen = null;
      } else {
        const { sectionId, inst } = AppState.ui.flyoutOpen;
        const section = _smgr.getSection(sectionId);
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
      if (btn) btn.disabled = !_smgr?.canUndo();
    }

    /** SC2: annulla ultima operazione distruttiva. */
    window.smUndo = () => {
      if (!_smgr?.canUndo()) return;
      _smgr.undo();
      // Svuota cache in-memory (blueprint e audio) — verranno ricalcolate al prossimo generate
      AppState.clearCache();
      _smCrossMemory = new CrossSectionMemory();  // Q2: reset memoria inter-sezione
      AppState.ui.chipEditing = null;
      smRender();
    };

    // SC2: shortcut Ctrl+Z
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        // Non intercettare se il focus è su un input/select/textarea
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
        e.preventDefault();
        smUndo();
      }
    });

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
          const section  = _smgr?.getSection(sectionId);
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
      if (!_smgr) return;
      const state = _smgr.getState();
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
              _smgr.setCachedEvents(sec.id, inst, AppState.cache.sm[`${sec.id}:${inst}`]);
            }
          }
        }

        // 2. Assembla timeline (ensemble → e0/e1/e2, altri → array piatti)
        const trackBuffers = _smgr.assembleSessionEvents(ppq);
        const barTicks = ppq * 4;

        // 3. GrooveLock sui buffer lineari (drums/bass/guitar/piano)
        const glBuffers = {
          drums: trackBuffers.drums,
          bass: trackBuffers.bass,
          guitar: trackBuffers.guitar,
          piano: trackBuffers.piano,
        };
        if (glBuffers.drums?.length) {
          const glRng = makeRng(Math.floor(Math.random() * 99999) ^ 0xC0FF);
          applyGrooveLock(glBuffers, { ppq, bpm: state.bpm, barTicks }, glRng);
        }

        // 4. MIDI Writer
        const writer = new MidiWriter(ppq);
        writer.setTempo(state.bpm);
        writer.setTimeSignature(4, 4);

        // Marker di sezione
        let globalTick = 0;
        for (const sec of state.sections) {
          writer.addMarker(globalTick, sec.label);
          globalTick += sec.bars * barTicks;
        }

        // ── Drums (ch 9 — GM Percussion, nessun program change) ──────
        if (trackBuffers.drums?.length) {
          // Determina se è drum machine o acustica per il nome traccia
          const isDM = state.sections.some(s => (s.instruments.drums.characterId ?? '').startsWith('dm_'));
          const dmPreset = isDM
            ? (state.sections.find(s => s.instruments.drums.params?.dmPreset)?.instruments.drums.params.dmPreset ?? 'trap')
            : null;
          const drumName = isDM ? `Drum Machine (${dmPreset})` : 'Drums';
          const dt = writer.addTrack(drumName);
          const drumMode = window._smMixerOverride['drums'] || 'auto';
          if (drumMode !== 'auto') dt.programChange(0, parseInt(drumMode), 9);
          for (const e of trackBuffers.drums) {
            if (e.type === 'pc') {
              if (drumMode === 'auto') dt.programChange(e.tick, e.prog, e.ch);
            } else if (e.cc != null) {
              dt.controlChange(e.tick, e.cc, e.value, 9);
            } else {
              dt.noteOn(e.tick, e.note, e.velocity, 9); dt.noteOff(e.tick + e.duration, e.note, 9);
            }
          }
        }

        // ── Bass (ch 1) ───────────────────────────────────────────────
        if (trackBuffers.bass?.length) {
          const bt = writer.addTrack('Bass');
          const bsMode = window._smMixerOverride['bass'] || 'auto';
          if (bsMode !== 'auto') bt.programChange(0, parseInt(bsMode), 1);
          for (const e of trackBuffers.bass) {
            if (e.type === 'pc') {
              if (bsMode === 'auto') bt.programChange(e.tick, e.prog, e.ch);
            } else if (e.cc != null) {
              bt.controlChange(e.tick, e.cc, e.value, 1);
            } else {
              bt.noteOn(e.tick, e.note, e.velocity, 1);
              bt.noteOff(e.tick + e.duration, e.note, 1);
            }
          }
        }

        // ── Guitar (ch 2) ─────────────────────────────────────────────
        if (trackBuffers.guitar?.length) {
          const gt = writer.addTrack('Guitar');
          const gtMode = window._smMixerOverride['guitar'] || 'auto';
          if (gtMode !== 'auto') gt.programChange(0, parseInt(gtMode), 2);
          for (const e of trackBuffers.guitar) {
            if (e.type === 'pc') {
              if (gtMode === 'auto') gt.programChange(e.tick, e.prog, e.ch);
            } else if (e.cc != null) {
              gt.controlChange(e.tick, e.cc, e.value, 2);
            } else {
              gt.noteOn(e.tick, e.note, e.velocity, 2);
              gt.noteOff(e.tick + e.duration, e.note, 2);
            }
          }
        }

        // ── Piano (ch 3) ──────────────────────────────────────────────
        if (trackBuffers.piano?.length) {
          const pt = writer.addTrack('Piano');
          const ptMode = window._smMixerOverride['piano'] || 'auto';
          if (ptMode !== 'auto') pt.programChange(0, parseInt(ptMode), 3);
          for (const e of trackBuffers.piano) {
            if (e.type === 'pc') {
              if (ptMode === 'auto') pt.programChange(e.tick, e.prog, e.ch);
            } else if (e.cc != null) {
              pt.controlChange(e.tick, e.cc, e.value, 3);
            } else {
              pt.noteOn(e.tick, e.note, e.velocity, 3);
              pt.noteOff(e.tick + e.duration, e.note, 3);
            }
          }
        }

        // ── Ensemble: 3 tracce separate (e0/e1/e2) ───────────────────
        const ensMode = window._smMixerOverride['ensemble'] || 'auto';
        for (const key of ['e0', 'e1', 'e2']) {
          const ens = trackBuffers[key];
          if (!ens?.evts?.length) continue;
          const et = writer.addTrack(ens.name ?? `Ensemble ${key}`);
          if (ensMode !== 'auto') et.programChange(0, parseInt(ensMode), ens.ch);
          // Emetti i program change dinamici
          for (const pc of ens.progChanges ?? []) {
            if (ensMode === 'auto') et.programChange(pc.tick, pc.prog, pc.ch);
          }
          for (const e of ens.evts) {
            et.noteOn(e.tick, e.note, e.velocity, ens.ch);
            et.noteOff(e.tick + e.duration, e.note, ens.ch);
          }
        }

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
      if (!_smgr) {
        alert('Nessuna sessione. Clicca ⚡ Genera prima.');
        return;
      }
      const secs = _smgr.getSections();
      if (!secs.length) {
        alert('Nessuna sezione. Aggiungi sezioni o clicca ⚡ Genera.');
        return;
      }

      // Costruisci CRD come stringa markdown
      const state = _smgr.getState();
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

    // ── Avvio automatico Session Mode ────────────────────────────────
    // Non ci sono più tab: Session è l'unica vista, si inizializza subito.
    smInit();
