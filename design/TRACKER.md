# suMidi — TRACKER

> File aggiornato a ogni sessione. Stato corrente del progetto.

---

## Stato: S10 — Percussionista etnico

### ✅ Completato
- PLAN27 — tutti i bug fix e miglioramenti qualità
- PLAN28 — GrooveLock, walking bass, drum groove reattivo
- PLAN29/29b/29c — architettura Session Mode pianificata
- Icone crop: strumenti (15) + silhouette musicisti (15)
- **Fase 1** — Design System SVG (DesignSystem.js completo + test HTML)
- **S1** — TonePreview sostituito con SynthPreview.js (oscillatori Web Audio API)
- **S1** — Font Ubuntu + palette neutra grigia in index.html
- **S2** — Logo "suMidi" inline (su grigio + Midi teal) in header e auth-box
- **S2** — manual.html allineato: stessa palette, stesso font, stesso logo
- **S2** — Residui palette blue-viola eliminati da entrambi i file
- **S2** — Cartella `_da_eliminare/` con TonePreview.js, soundfonts/, webaudiofont-master/
- **S3** — SessionManager.js (modello dati completo + API CRUD sezioni)
- **S3** — index.html: tab Classic Mode / Session Mode + skeleton UI sezioni
- **S4** — buildSectionBlueprint() in SessionManager.js
- **S4** — seedOverride in tutti e 5 i generatori (Bass, Guitar, Piano, Drums, Ensemble)
- **S4** — smGenerateSection() + _smCache + smPreviewSection() in index.html
- **S4** — Pulsanti ▶ Preview e 🔄 Rigenera per ogni sezione

- **S5** — CharacterRoster.js (18 personaggi, 5 strumenti)
- **S5** — Pannello ⚙ per-sezione con tab strumenti
- **S5** — Character Selector carousel (◀ nome/bio/foto ▶) — riusabile
- **S5** — Panel Drums: style select + feel slider + ghost toggle + fills toggle + vol knob + dot rows read-only
- **S5** — Panel Bass: style select + density/rest/vol knobs + lowest note select + dot row read-only
- **S5** — Percussionist.js: legge energyOverride, fillDensity, ghostBoost dal module
- **S5** — SessionManager.buildSectionBlueprint: applica params drums e bass ai modules

- **S6** — SessionManager.buildSectionBlueprint: params piano (style/velocityBase/arcType) e guitar (style/velocityBase)
- **S6** — smGenerateSection: piano program override da params (Rhodes, Wurly, ecc.)
- **S6** — _buildPanelPiano: style + suono (acustico/elettrico) + dinamica + volume
- **S6** — _buildPanelGuitar: style acustica/elettrica + dot row read-only + volume
- **S6** — _guitarPattern: estrazione ritmo chitarra da cached events

- **S7** — CharacterRoster.js: 3 percussionisti etnici aggiunti (Ana/bossa, Miguel/reggae, Yasmin/cajon)
- **S7** — SessionManager.buildSectionBlueprint: branch ensemble (playStyle→modules.ensemble.style, velocity)
- **S7** — SessionManager.buildSectionBlueprint: meta.ensemble.type override da params.style
- **S7** — _buildPanelDrums: rilevamento isPerc (perc_*) → lista stili etnici
- **S7** — _buildPanelEnsemble: tipo strumento + modo esecuzione + volume
- **S7** — smBuildPanelContent: case ensemble connesso a _buildPanelEnsemble

- **S8** — PianoGenerator.js: stile `freely` + `broken_chords` aggiunti a STYLE_PATTERNS
- **S8** — PianoGenerator.js: `_genFreelyBar()` — fraseggio jazz/soul, movement minimal/medium/full
- **S8** — PianoGenerator.js: `FREELY_STYLES` e `BROKEN_CHORD_STYLES` set; branch RH nel loop bar
- **S8** — SessionManager.js: `movement` propagato a modules.piano nel blueprint
- **S8** — CharacterRoster.js: Kwame aggiornato a `broken_chords`
- **S8** — index.html: Panel Piano aggiornato con stili kb+freely, selettore Movimento

- **S9** — DrumMachineGenerator.js: nuovo file, step sequencer 16 step, preset trap/lo_fi/electro
- **S9** — DrumMachineGenerator.js: swing interno (16th e 8th), DM_NOTES, DM_PRESETS, DM_CHANNELS esportati
- **S9** — CharacterRoster.js: TR-8 (trap), LO-1 (lo_fi), E-909 (electro) aggiunti
- **S9** — index.html: import DrumMachineGenerator; smGenerateSection → routing dm_ → generateDrumMachine
- **S9** — index.html: _buildPanelDrumMachine con griglia 16 step interattiva + swing slider
- **S9** — index.html: smDmToggleStep / smDmSetPreset; CSS .sm-dm-grid/row/step/label

- **S10** — Percussionist.js: mappatura GM estesa (BONGO, CONGA, TIMBALE, AGOGO, CABASA, ecc.)
- **S10** — GROOVE_PARAMS: aggiunti profili `perc_latin`, `perc_folk`, `perc_bossa`
- **S10** — Percussionist.js: implementata logica procedurale isolata (`_genBar`, `_genFill`) per poliritmie etniche

- **S11** — SessionManager.js: aggiunti `seed` per strumento, `progression`, `mutateInstrumentSeed`, `setSectionProgression`
- **S11** — SessionManager.js: aggiunto `assembleSessionEvents()` per esportazione MIDI

### ⏳ Sessioni successive (vedi PLAN30.md)
- **S5–S7** — Session Player Panels UI
- **S8** — Piano Freely + broken_chords
- **S9** — Drum Machine step sequencer

### 🔴 Bloccanti / Da decidere
- [ ] Foto reali personaggi (opzionale — placeholder con silhouette già definito in PLAN30)

---

## File prodotti

| File | Descrizione | Stato |
|:---|:---|:---:|
| `DesignSystem.js/DesignSystem.js` | Componenti SVG UI (knob, slider, dots, toggle, meter) | ✅ |
| `SynthPreview.js` | Motore audio Web Audio API (sostituto TonePreview) | ✅ |
| `PLAN/PLAN30.md` | Piano esecutivo unificato S1–S11 con roster personaggi | ✅ |
| `SessionManager.js` | Logica stato sessione | ✅ |

---

## Regola sessioni

Ogni sessione: **1 obiettivo principale, aggiorno questo TRACKER a fine sessione.**
Piano di riferimento: **PLAN/PLAN30.md**
