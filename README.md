# suMidi

**Generate a complete, multi-track MIDI song in your browser. No account, no server, no upload.**

Pick a style, a key and a tempo: suMidi writes drums, bass, guitar, piano and ensemble parts,
plays them back in the page, and exports a multi-track `.mid` file ready for your DAW. Everything
runs client-side — the music never leaves your machine.

### ▶ [Try it now — sumidi.johnwhale.com](https://sumidi.johnwhale.com)

<!-- DEMO — sostituire questo commento con il video.
     Come si fa: apri una issue qualsiasi sul repo, trascina l'mp4 nel campo del commento,
     GitHub carica il file e restituisce un URL https://github.com/user-attachments/...
     Copia quell'URL qui sotto e chiudi la issue senza inviarla.

     <video src="URL_DEL_VIDEO" controls width="100%"></video>

     Formato: mp4 (H.264 + audio AAC), 20-30 secondi, sotto i 10 MB. GitHub riproduce gli mp4
     nel README con un player; mp3 e wav no, e una GIF non ha audio - che per un generatore
     musicale e' il punto. -->

*(30-second demo coming here — meanwhile, the link above runs the real thing.)*

[![Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/johnwhale)

🇮🇹 [Leggi questa pagina in italiano](README.it.md)

## What it does

- **13 styles**: MTV Unplugged, Folk Acoustic, Jazz Ballad, Neo Soul, Classical Chamber, Pop
  Rock, Blues Rock, Singer/Songwriter, Cinematic/Orchestral, Lo-Fi, Punk, Garage Rock,
  8-bit/Chiptune.
- **Session Mode**: a DAW-inspired arrangement view — one lane per section, a flyout per
  instrument, and an interactive chord track you can edit by hand (slash chords included) with
  automatic voice leading.
- **Solo Mode**: hear a single instrument (piano, guitar, bass or ensemble) play the whole
  progression on its own, either in a fixed style or adapting to each section type. One click,
  independent from the full arrangement.
- **31 characters**: every instrument — drums, drum machine, world percussion, bass, guitar,
  piano, ensemble — can be handed to a player with their own style and feel.
- **Drum machine**: a 16-step sequencer with Trap, Lo-Fi and Electro presets, editable step by
  step.
- **Deterministic seed**: same seed, style, key and tempo always produce the exact same song.
  The seed is visible and pasteable in the composer bar, and the page URL carries the whole
  state (`?style=&key=&bpm=&seed=`) — so a song can be found again days later, or shared as a
  link, without anything being stored on a server.
- **Saveable projects**: your arrangement comes back on its own when you reopen the page, and 💾
  saves the whole project to a `.sumidi.json` file (sections, characters, custom chords, seed)
  that 📂 reopens. The file holds the decisions, not the notes: the notes are regenerated
  identically from them.
- **In-app playback** through WebAudioFont — listen to one section or the whole song without
  exporting first.
- **Export**: multi-track MIDI, one instrument per channel.
- **Undo** up to 10 steps, with adjustable humanisation of timing and velocity.

## Running it locally

There is no build step, but you **do need a static server**: the app uses ES modules, which
browsers refuse to load over `file://`.

```bash
git clone https://github.com/johnwhaledev/sumidi.git
cd sumidi
npx serve .
# then open the URL it prints (e.g. http://localhost:3000)
```

For development (tests, linting):

```bash
npm install
npm test        # regression suite (vitest)
npm run lint    # ESLint
```

## Project layout

```
index.html           the app
manual.html          user manual
styles.css           interface styles
fonts/               self-hosted fonts (Ubuntu, woff2)
soundfonts/          local audio presets for playback (in the repo, 17 MB)
vendor/              the WebAudioFont player library
scripts/             support scripts (e.g. download-soundfonts.mjs, impronta-note.mjs)
src/                 JS modules (generation engine + UI)
  SongArchitect.js   builds the song structure (sections, harmony)
  ChordTheory.js, ProgressioniGradi.js, SongProgressions.js, SongForms.js,
  SectionPresets.js, Styles.js        musical data (chords, pools, forms, styles)
  *Generator.js      one generator per instrument (bass, guitar, piano, drums, ensemble, pad)
  Ornaments.js       shared engine for glides and portamento
  FlowCore.js        shared utilities (RNG, dynamics, phrase memory)
  Playback.js        in-app playback engine (WebAudioFont)
  CharacterRoster.js, GrooveLock.js, Humanizer.js   characters, groove, humanisation
  MidiWriter.js, TabRenderer.js, MarkdownExporter.js   MIDI / tab / Markdown export
  SessionManager.js, SessionStore.js, SessionExport.js, AppState.js   state, saving, export
  SongEngine.js      whole-blueprint gen() and the composer bar
  SongEngineLab.js   the Classic panel, loaded only by lab.html
  Session.js         Session Mode: panels, chord track, playback, export, Solo Mode
  main.js            bootstrap
design/              UI components (DesignSystem.js) and design material
tests/               regression suite (vitest)
img/                 instrument and character icons
```

## Technical notes

Built for up-to-date desktop browsers (Chrome, Edge, Firefox).

**Nothing is fetched from the network.** The [WebAudioFont](https://github.com/surikov/webaudiofont)
library and the 65 playback presets live in the repository (`vendor/` and `soundfonts/`, 17 MB
in total), as do the fonts and the rest of the interface: the app works offline and depends on
no third-party service. The official CDN is kept only as a safety net, in case a preset is
missing locally.

**A note on the language.** The code comments, the user manual and the commit messages are in
Italian — it is the language this project is written in. The interface is being translated;
until then, this README and [CONTRIBUTING.md](CONTRIBUTING.md) are your way in.

## Support the project

If suMidi is useful to you: [ko-fi.com/johnwhale](https://ko-fi.com/johnwhale) ☕

## Licence

Released under the **GNU Affero General Public License v3.0** — see [LICENSE](LICENSE). In short:
you are free to use, modify and distribute the code, including commercially, but if you
distribute a modified version — including offering it as a web service — you must release your
source code under the same licence.

**A commercial licence is available.** If you want to build suMidi into a product without
releasing your own source, there is a paid exception to the AGPL: contact details are at
[www.johnwhale.com](https://www.johnwhale.com). See [COMMERCIAL.md](COMMERCIAL.md).

## Contributing

Pull requests are welcome — with one caveat: a change that alters the *sound* is a musical
decision before a technical one, so open an issue first. How this project works, and what a
change needs to be accepted: [CONTRIBUTING.md](CONTRIBUTING.md).

For the commercial exception above to remain possible, every contribution goes through a short
licence agreement — [CLA.md](CLA.md): you keep your copyright, there is nothing to sign, one
line in the pull request is enough.
