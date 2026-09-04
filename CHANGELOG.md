# Changelog

All notable changes to suMidi are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] — 2026-09-04

First tagged release.

### Added

- **Recoverable seed and shareable songs.** Style, key, tempo and seed now live in the URL
  (`?style=&key=&bpm=&seed=`), and the seed is shown and editable in the composer bar. A link can
  be shared and reopened to the same song.
- **Session persistence.** The arrangement autosaves to the browser and restores on reload; a
  session can also be exported and re-imported as a `.sumidi.json` file.
- **Chord grid paste-in.** Paste a chord chart (`| Am7 | D7 | Gmaj7 | % |`) and get it arranged
  over your own progression instead of a generated one.
- **Form selection in the composer bar.** Eight additional song forms — previously reachable only
  from the internal lab page — are now selectable per style.
- **Per-section style override in Solo Mode**, alongside the existing automatic per-section
  default.
- **Sub-beat harmonic rhythm.** The engine can now express a chord change inside a bar, not only
  once per bar. Used today for harmonic anticipation (a chord arriving half a beat early on about
  8% of bars, depending on style) — enabled by default, and every seed from before this release
  can sound different from the point it first anticipates a chord.
- Continuous integration on GitHub Actions: tests and lint run on every push and pull request.
- `CONTRIBUTING.md`, `CLA.md` and `COMMERCIAL.md` — how to contribute, the contributor licence
  agreement, and how to license suMidi for closed-source use.
- English documentation (`README.md`, `CONTRIBUTING.md`, `CLA.md`), each paired with its Italian
  original (`README.it.md`, `CONTRIBUTING.it.md`, `CLA.it.md`).

### Changed

- **Playback is now reproducible from the seed.** Previously only structure, chords, key and
  tempo were deterministic; the actual notes played were randomized per instrument on every load.
  The same seed now always plays back the same performance — as a result, every seed and shared
  link sounds different from before this release.
- **Section dynamics now vary correctly for every style.** Five styles (punk, garage_rock,
  chiptune, cinematic, lo_fi) previously fell back to a generic ballad dynamic curve; each now
  uses its own.
- **Piano left hand register widened** to at least an octave, giving it room to spread instead of
  crowding into a narrow band.
- **The pad is back in the session export**, at low background volume, with smoother voice
  leading between chords.
- **Piano right-hand voicing pairs voices by position** across chord changes, reducing large
  jumps between voicings.
- **Solo Mode, piano:** when the piano plays alone, the left hand now plays a walking bass-style
  line instead of block accompaniment, and the other instrument modules are correctly disabled
  in the underlying arrangement instead of staying silently active.
- **Composer bar layout no longer shifts** between generations (style, tonality or "Random").
- Chord qualities `m9`, `m11` and `13` now resolve to their correct minor/extended quality instead
  of silently falling back to major.
- Playback soundfonts and the WebAudioFont library are now vendored in the repository instead of
  fetched from a third-party domain at runtime — the app no longer depends on an external service
  to make sound.
- The internal Classic lab panel now loads only on the lab page, reducing what the main app
  downloads and parses.
- The header/favicon logo shrank from ~666 KB to ~21 KB with no visible change — it was only ever
  displayed at 26 px.
- Chord progressions are now stored as scale degrees with an automated consistency check, instead
  of hand-written concrete chords per key.

### Fixed

- MIDI exports now include the key signature (previously every export opened as C major/A minor
  regardless of the actual key).
- BPM sliders now reach the full range declared for each style; several styles were silently
  capped below their stated maximum.
- Opening a shared link no longer silently overwrites an in-progress arrangement that had not
  been saved.
- Solo Mode export no longer depends on what was exported earlier in the same session.
- A duplicate progression in the folk intro pool no longer reduces the effective variety below
  what was intended.
- Transposing a chord with a slash bass note no longer drops the bass note.
- The chord chart now displays the chord name instead of an internal `[name, duration]` pair.

### Removed

- Waltz (3/4) progressions and forms, and the short folk form: neither was reachable from the
  published app.

[Unreleased]: https://github.com/johnwhaledev/sumidi/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/johnwhaledev/sumidi/releases/tag/v1.0.0
