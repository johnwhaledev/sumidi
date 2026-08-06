# suMidi

Generatore procedurale di brani MIDI multi-traccia, interamente client-side: nessun server, nessuna dipendenza esterna in esecuzione. Apri `index.html` nel browser, scegli stile/tonalità/BPM, genera un brano completo (batteria, basso, chitarra, piano, ensemble) ed esportalo in `.mid` pronto per il tuo DAW.

[![Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/johnwhale)

## Caratteristiche

- **16 stili musicali**: MTV Unplugged, Folk Acoustic, Jazz Ballad, Neo Soul, Classical Chamber, Pop Rock, Bossa Nova, Blues Rock, Singer/Songwriter, Latin/Afro-Cuban, Cinematic/Orchestral, Reggae/Dub, Lo-Fi, Punk, Garage Rock, 8-Bit/Chiptune.
- **Session Mode**: interfaccia DAW-inspired con arrangement lanes a blocchi per sezione, flyout per strumento/sezione, chord track interattiva con editor accordi (incluse slash chord) e voice-leading automatico.
- **Roster di 33 personaggi**: ogni strumento (batteria, drum machine, percussioni etniche, basso, chitarra, piano, ensemble) può essere assegnato a un personaggio con stile e "feel" propri.
- **Drum machine**: step sequencer a 16 step con preset Trap, Lo-Fi, Electro, editabili passo per passo.
- **Seed deterministico**: stesso seed, stesso stile/tonalità/BPM ⇒ stesso brano identico, sempre. Blocco seed e randomizzazione rapida di stile/tonalità/BPM dalla composer bar.
- **Export**: file MIDI multi-traccia su canali separati, più un export in Markdown con struttura del brano, accordi e tablature per chitarra/basso.
- **Undo** fino a 10 passi, umanizzazione regolabile del timing/velocity.

## Come si usa

Non serve build né server: `index.html` è un'app statica.

```bash
git clone https://github.com/<tuo-utente>/sumidi.git
cd sumidi
# apri index.html nel browser, oppure servilo con un server statico qualsiasi, es.:
npx serve .
```

Per lo sviluppo (test, lint):

```bash
npm install
npm test        # suite di regressione (vitest)
npm run lint     # ESLint
```

## Struttura del progetto

```
index.html         punto d'ingresso dell'app
manual.html         manuale utente
styles.css          stili dell'interfaccia
src/                 moduli JS (motore di generazione + UI)
  SongArchitect.js   costruisce la struttura del brano (sezioni, armonia)
  *Generator.js      un generatore per strumento (Bass, Guitar, Piano, Drums, Ensemble, Chord)
  Ornaments.js        motore condiviso per glissandi/portamento
  FlowCore.js         utility condivise (RNG, dinamiche, memoria di frase)
  main.js             logica UI
design/              componenti UI (DesignSystem.js) e materiale di design
tests/               suite di regressione (vitest)
img/                 icone strumenti e personaggi
```

## Note tecniche

L'app non salva automaticamente il lavoro in corso tra una sessione e l'altra: esporta il `.mid` (e, se ti interessa, il Markdown con accordi e tablature) prima di chiudere la pagina. È pensata per browser desktop moderni aggiornati (Chrome, Edge, Firefox); l'unica risorsa caricata da remoto è il font Google "Ubuntu" — senza connessione l'app resta comunque utilizzabile con un font di sistema equivalente.

## Supporta il progetto

Se suMidi ti è utile e vuoi supportarne lo sviluppo: [ko-fi.com/johnwhale](https://ko-fi.com/johnwhale) ☕

## Licenza

Distribuito con licenza **GNU Affero General Public License v3.0** — vedi [LICENSE](LICENSE). In sintesi: sei libero di usare, modificare e distribuire il codice, anche per scopi commerciali, ma se distribuisci una versione modificata (incluso offrirla come servizio web) devi rilasciarne il codice sorgente con la stessa licenza.
