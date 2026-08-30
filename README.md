# suMidi

Generatore procedurale di brani MIDI multi-traccia, client-side (nessun server applicativo, nessun backend). Apri l'app da un server statico, scegli stile/tonalità/BPM, genera un brano completo (batteria, basso, chitarra, piano, ensemble), ascoltalo in-app ed esportalo in `.mid` pronto per il tuo DAW.

[![Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/johnwhale)

## Caratteristiche

- **13 stili musicali**: MTV Unplugged, Folk Acoustic, Jazz Ballad, Neo Soul, Classical Chamber, Pop Rock, Blues Rock, Singer/Songwriter, Cinematic/Orchestral, Lo-Fi, Punk, Garage Rock, 8-Bit/Chiptune.
- **Session Mode**: interfaccia DAW-inspired con arrangement lanes a blocchi per sezione, flyout per strumento/sezione, chord track interattiva con editor accordi (incluse slash chord) e voice-leading automatico.
- **Solo Mode**: ascolta un solo strumento (Piano, Chitarra, Basso o Ensemble) sull'intera progressione di accordi già costruita, con stile fisso o adattato automaticamente per tipo di sezione — indipendente dall'arrangiamento multi-traccia, un click per attivarlo.
- **Roster di 31 personaggi**: ogni strumento (batteria, drum machine, percussioni etniche, basso, chitarra, piano, ensemble) può essere assegnato a un personaggio con stile e "feel" propri.
- **Drum machine**: step sequencer a 16 step con preset Trap, Lo-Fi, Electro, editabili passo per passo.
- **Seed deterministico**: stesso seed, stesso stile/tonalità/BPM ⇒ stesso brano identico, sempre. Il seed è visibile e incollabile nella composer bar, e l'indirizzo della pagina lo porta con sé (`?style=&key=&bpm=&seed=`): un brano si ritrova dopo giorni e si condivide con un link, senza che nulla venga salvato su un server. Blocco seed e randomizzazione rapida di stile/tonalità/BPM dalla stessa barra.
- **Playback in-app**: ascolto di sezione o del brano intero via WebAudioFont, senza dover prima esportare.
- **Export**: file MIDI multi-traccia su canali separati.
- **Undo** fino a 10 passi, umanizzazione regolabile del timing/velocity.

## Come si usa

Non serve build, ma **serve un server statico**: l'app usa moduli ES (`import`/`export`), bloccati dal browser se apri `index.html` direttamente da `file://`.

```bash
git clone https://github.com/johnwhaledev/sumidi.git
cd sumidi
npx serve .
# poi apri l'URL che stampa (es. http://localhost:3000)
```

Per lo sviluppo (test, lint):

```bash
npm install
npm test        # suite di regressione (vitest)
npm run lint     # ESLint
```

## Struttura del progetto

```
index.html          punto d'ingresso dell'app
manual.html          manuale utente
styles.css           stili dell'interfaccia
fonts/               font self-hostati (Ubuntu, woff2)
soundfonts/          preset audio locali per il playback (non versionati, vedi sotto)
scripts/             script di supporto (es. download-soundfonts.mjs)
src/                  moduli JS (motore di generazione + UI)
  SongArchitect.js    costruisce la struttura del brano (sezioni, armonia)
  ChordTheory.js, SongProgressions.js, SongForms.js,
  SectionPresets.js, Styles.js    dati musicali (accordi, pool, forme, stili)
  *Generator.js       un generatore per strumento (Bass, Guitar, Piano, Drums, Ensemble, Chord)
  Ornaments.js         motore condiviso per glissandi/portamento
  FlowCore.js          utility condivise (RNG, dinamiche, memoria di frase)
  Playback.js          motore di ascolto in-app (WebAudioFont)
  CharacterRoster.js, GrooveLock.js, Humanizer.js  personaggi, groove, umanizzazione
  MidiWriter.js, TabRenderer.js, MarkdownExporter.js   export MIDI/tablature/Markdown
  SessionManager.js, AppState.js   stato (sessione, cache, UI)
  SongEngine.js       gen() a blueprint intero + pannello Classic (usato da lab.html)
  Session.js          Session Mode: pannelli, chord track, playback, export, Solo Mode
  main.js             bootstrap (carica i due moduli sopra, avvia Session Mode)
design/               componenti UI (DesignSystem.js) e materiale di design
tests/                suite di regressione (vitest)
img/                  icone strumenti e personaggi
```

## Note tecniche

L'app non salva automaticamente il lavoro in corso tra una sessione e l'altra: esporta il `.mid` prima di chiudere la pagina. È pensata per browser desktop moderni aggiornati (Chrome, Edge, Firefox).

Il playback carica la libreria [WebAudioFont](https://github.com/surikov/webaudiofont) e i preset sonori da `surikov.github.io`: serve una connessione a Internet la prima volta (i preset, se già scaricati in una cartella locale `soundfonts/` non versionata, vengono riletti da lì). Font e resto dell'interfaccia sono self-hostati, nessun'altra risorsa parte in rete.

## Supporta il progetto

Se suMidi ti è utile e vuoi supportarne lo sviluppo: [ko-fi.com/johnwhale](https://ko-fi.com/johnwhale) ☕

## Licenza

Distribuito con licenza **GNU Affero General Public License v3.0** — vedi [LICENSE](LICENSE). In sintesi: sei libero di usare, modificare e distribuire il codice, anche per scopi commerciali, ma se distribuisci una versione modificata (incluso offrirla come servizio web) devi rilasciarne il codice sorgente con la stessa licenza.
