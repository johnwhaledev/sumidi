# Contributing to suMidi

🇮🇹 [Leggi questa pagina in italiano](CONTRIBUTING.it.md)

Thanks — a small project lives on a few careful hands.

## First: the contributor agreement

suMidi is AGPL-3.0 and sells [commercial exceptions](COMMERCIAL.md) to stay free for everyone
else. For that mechanism to work, the project needs to be able to license the whole codebase, so
every contribution goes through a short agreement: **[CLA.md](CLA.md)**. You keep your copyright,
there is nothing to sign, one line in the pull request description is enough:

```
I have read CLA.md and I accept the contributor licence agreement.
```

## Before you write code

**Open an issue.** This matters most for the music engine: a change that alters the generated
sound — a generator, a progression pool, timing — is a musical decision before a technical one,
and should be discussed before it is written. Pull requests that change the sound without prior
discussion are unlikely to be accepted, however good the code.

Obvious fixes (a typo, an error that breaks a function) don't need this step: open the pull
request directly.

## How this project works

- **No framework, no build step.** ES6+ JavaScript modules, served as-is. Runtime dependencies
  live in the repository (`vendor/`, `soundfonts/`): the app works offline and calls no
  third-party service. A new dependency needs a reason.
- **One commit per item**, with a message that explains *why*, not *what* — the diff already says
  what. If the commit changes the sound, the message must say so, and by how much.
- **The suite must stay green**, and a change to the engine comes with its own tests:
  ```
  npm install
  npm test        # vitest
  npm run lint    # eslint
  ```
- **If you touch a generator, measure.** `node scripts/impronta-note.mjs --scrivi before.txt`
  before the change, `--confronta before.txt` after: that's ~275,000 notes across 13 styles × 4
  seeds × 2 keys. If the change wasn't meant to change the music, the fingerprint proves it; if it
  was meant to change it in one place only, it shows whether that's really what happened.
- **Italian** for code comments, docstrings and commit messages. It's the language the project is
  written in — and yes, it's also its biggest limitation looking outward: translation is under
  way.

## Especially welcome

- Fixes with a reproducible case attached (style, key, seed).
- Tests on the parts that have few — `Session.js` and the interface are the least covered.
- Listening reports: "this style with this seed sounds off here" is as useful as a patch,
  sometimes more. Attach the seed and the MIDI file.

## Probably not

- New musical genres: the bottleneck isn't the number of styles.
- Rewrites of working parts, for architectural taste.
- A generative model inside the engine: suMidi's value is that the rules are readable and the
  result reproducible from a seed.
