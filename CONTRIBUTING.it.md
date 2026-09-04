# Contribuire a suMidi

🇬🇧 [Read this page in English](CONTRIBUTING.md)

Grazie: un progetto piccolo vive di poche mani attente.

## Prima di tutto: l'accordo sui contributi

suMidi è in AGPL-3.0 e vende [eccezioni commerciali](COMMERCIAL.md) per restare gratuito per
tutti gli altri. Perché quel meccanismo funzioni serve poter licenziare tutto il codice, quindi
ogni contributo passa da un breve accordo: **[CLA.md](CLA.it.md)**. Mantieni il tuo copyright, non
c'è niente da firmare, basta una riga nella descrizione della pull request:

```
Ho letto CLA.md e accetto l'accordo di licenza per i contributi.
```

## Prima di scrivere codice

**Apri una issue.** Vale soprattutto per il motore musicale: una modifica che cambia il suono
generato — un generatore, un pool di progressioni, il timing — è una scelta musicale prima che
tecnica, e va discussa prima di essere scritta. Le pull request che cambiano il suono senza
averne parlato prima difficilmente vengono accolte, per quanto sia buono il codice.

Le correzioni evidenti (un refuso, un errore che rompe una funzione) non hanno bisogno di
questo giro: apri direttamente la pull request.

## Come lavora questo progetto

- **Niente framework, niente build step.** JavaScript ES6+ a moduli, servito così com'è. Le
  dipendenze di runtime sono nel repository (`vendor/`, `soundfonts/`): l'app funziona offline e
  non chiama nessun servizio di terzi. Una nuova dipendenza va motivata.
- **Un commit per voce**, con un messaggio che spiega *perché*, non *cosa*: il diff dice già
  cosa. Se il commit cambia il suono, il messaggio deve dirlo e dire quanto.
- **La suite deve restare verde**, e una modifica al motore arriva con i suoi test:
  ```
  npm install
  npm test        # vitest
  npm run lint    # eslint
  ```
- **Se tocchi un generatore, misura.** `node scripts/impronta-note.mjs --scrivi prima.txt`
  prima della modifica, `--confronta prima.txt` dopo: sono ~275.000 note su 13 stili × 4 seed ×
  2 tonalità. Se la modifica non doveva cambiare la musica, l'impronta lo dimostra; se doveva
  cambiarla in un punto solo, dice se è successo davvero lì.
- **Italiano** per commenti, docstring e messaggi di commit. È la lingua del progetto — e sì, è
  anche il suo limite più grande verso l'esterno: la traduzione è in programma.

## Che cosa è particolarmente benvenuto

- Correzioni con un caso riproducibile allegato (stile, tonalità, seed).
- Test sulle parti che ne hanno poche — `Session.js` e l'interfaccia sono i punti più scoperti.
- Segnalazioni d'ascolto: «questo stile con questo seed suona storto qui» è utile quanto una
  patch, a volte di più. Allega il seed e il file MIDI.

## Che cosa probabilmente non lo è

- Nuovi generi musicali: il collo di bottiglia non è il numero di stili.
- Riscritture di parti che funzionano, per gusto architetturale.
- Un modello generativo dentro il motore: il valore di suMidi è che le regole sono leggibili e
  il risultato riproducibile da un seed.
