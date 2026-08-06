/**
 * PianoGenerator.js  v0.8 — alberti bass RH per stile alberti_bass
 * ─────────────────────────────────────────────────────────────────
 * v0.6:
 *   1. Voicing quartale (root+4ª+7ª): usato in comping a bassa energia
 *      Timbro aperto e moderno — tipico jazz/neo soul
 *   2. LH comping_synco: mano sinistra sugli "and" dei quarti (step 2,6,10,14)
 *      completamente indipendente dalla destra che sincopata su 1,3,5,9,11,13
 * ─────────────────────────────────────────────────────────────────
 * v0.5 — voice leading e anticipazioni contestuali
 * ─────────────────────────────────────────────────────────────────
 * v0.5:
 *   1. Voice leading ottimizzato: minimizza il movimento totale delle voci
 *      (somma distanze minime) invece di confrontare i soli midpoint
 *   2. Anticipazioni contestuali: 60% prima di un cambio accordo, 35% a bar 2,
 *      15% altrimenti — le anticipazioni ora "sentono" l'armonia imminente
 * ─────────────────────────────────────────────────────────────────
 * v0.4:
 *   1. Upper extensions jazz (9/11/13) su comping ad alta energia
 *   2. Drop-2 voicing: seconda nota abbassata di ottava se voicing compresso
 *   3. Anticipation notes: nota anticipata a -s16/2 su beat forti (comping/hip_hop)
 *   4. LH ghost beat: nota LH leggera su offbeat (ballad/hip_hop feel)
 * ─────────────────────────────────────────────────────────────────
 */

import { makeRng, clampToRegister } from './SongArchitect.js';
import { arcVelocity, selectContextualNote, PhraseMemory, getMelodicCharacter } from './FlowCore.js';

export const PIANO_PROGRAM = 0;

// Registri base — il LH lo viene calcolato dinamicamente per sezione (FASE I)
const LH_HI  = 57;
// Fase D: RH.lo alzato da 57(A3) a 60(C4) per creare gap con LH e non sovrapporsi
const RH = { lo: 60, hi: 84 };

// ── Patterns (step16, durSteps, velFactor) ────────────────────────
const RH_PATTERNS = {
  ballad: [
    [0, 4, 0.85], [8, 4, 0.80],
  ],
  ballad_var: [           // bar 2 variant: add an upbeat hit
    [0, 4, 0.85], [6, 1, 0.65], [8, 3, 0.80], [14, 1, 0.60],
  ],
  comping: [
    [1, 1, 0.72], [3, 1, 0.68], [5, 2, 0.78],
    [9, 1, 0.70], [11, 1, 0.68], [13, 2, 0.75],
  ],
  comping_var: [          // bar 2 variant: shift one hit
    [0, 1, 0.78], [3, 1, 0.68], [5, 2, 0.78],
    [8, 1, 0.75], [11, 1, 0.65], [13, 2, 0.72],
  ],
  new_age: [
    [0,1,0.68],[1,1,0.58],[2,1,0.64],[3,1,0.58],
    [4,1,0.70],[5,1,0.60],[6,1,0.64],[7,1,0.56],
    [8,1,0.68],[9,1,0.58],[10,1,0.64],[11,1,0.58],
    [12,1,0.70],[13,1,0.60],[14,1,0.64],[15,1,0.54],
  ],
  hip_hop: [
    [0, 2, 0.88], [8, 1, 0.65],
  ],
  // Gospel pump: accordi pieni in ottavi dritti su tutta la battuta —
  // il "pump" tipico del piano gospel/soul da ritornello, energico e continuo.
  gospel_pump: [
    [0, 1, 0.88], [2, 1, 0.70], [4, 1, 0.90], [6, 1, 0.68],
    [8, 1, 0.88], [10, 1, 0.70], [12, 1, 0.90], [14, 1, 0.68],
  ],
};

const LH_PATTERNS = {
  ballad:        [[0, 8, 'root'], [8, 8, 'root']],
  ballad_moving: [[0, 4, 'root'], [4, 4, 'fifth'], [8, 4, 'root'], [12, 4, 'fifth']],
  comping:       [[0, 4, 'root+fifth'], [8, 4, 'root+fifth']],
  // LH indipendente: colpisce sugli "and" dei quarti (step 2,6,10,14)
  // mentre la RH sincopata su 1,3,5,9,11,13 — polifonia ritmica reale
  comping_synco: [[2, 1, 'root'], [6, 1, 'fifth'], [10, 1, 'root'], [14, 1, 'chord']],
  // oom_pah fix: beat 1&3 = root BASSO (registro grave), beat 2&4 = accordo MID (senza root basso)
  oom_pah:       [[0, 2, 'root_low'], [4, 2, 'chord_mid'], [8, 2, 'root_low'], [12, 2, 'chord_mid']],
  new_age:       [[0, 16, 'root']],
  hip_hop:       [[0, 8, 'root'], [8, 8, 'root']],
};

const STYLE_PATTERNS = {
  ballad:       { low:  { rh:'ballad',    rhv:'ballad_var',  lh:'ballad'        },
                  mid:  { rh:'ballad',    rhv:'ballad_var',  lh:'ballad_moving' },
                  high: { rh:'comping',   rhv:'comping_var', lh:'comping'       } },
  comping:      { low:  { rh:'comping',   rhv:'comping_var', lh:'comping'        },
                  mid:  { rh:'comping',   rhv:'comping_var', lh:'comping_synco'  },
                  high: { rh:'comping',   rhv:'comping_var', lh:'comping_synco'  } },
  new_age_flow: { low:  { rh:'new_age',   rhv:'new_age',     lh:'new_age'       },
                  mid:  { rh:'new_age',   rhv:'new_age',     lh:'ballad_moving' },
                  high: { rh:'new_age',   rhv:'new_age',     lh:'comping'       } },
  hip_hop_keys: { low:  { rh:'hip_hop',   rhv:'hip_hop',     lh:'hip_hop'       },
                  mid:  { rh:'hip_hop',   rhv:'hip_hop',     lh:'hip_hop'       },
                  high: { rh:'comping',   rhv:'comping_var', lh:'hip_hop'       } },
  alberti_bass: { low:  { rh:'ballad',    rhv:'ballad_var',  lh:'oom_pah'       },
                  mid:  { rh:'ballad',    rhv:'ballad_var',  lh:'oom_pah'       },
                  high: { rh:'comping',   rhv:'comping_var', lh:'oom_pah'       } },
  broken_chords:{ low:  { rh:'hip_hop',   rhv:'hip_hop',     lh:'hip_hop'       },
                  mid:  { rh:'hip_hop',   rhv:'hip_hop',     lh:'hip_hop'       },
                  high: { rh:'comping',   rhv:'comping_var', lh:'hip_hop'       } },
  freely:       { low:  { rh:'comping',   rhv:'comping_var', lh:'comping_synco' },
                  mid:  { rh:'comping',   rhv:'comping_var', lh:'comping_synco' },
                  high: { rh:'comping',   rhv:'comping_var', lh:'comping_synco' } },
  // Bug fix: 'gospel_pump' era usato in SongArchitect.js (chorus dello stile
  // folk) ma mancava qui — il fallback silenzioso a STYLE_PATTERNS['ballad']
  // faceva suonare ogni ritornello folk come una ballata invece del comping
  // ritmico previsto. LH oom_pah (root basso + accordo medio) tipico gospel.
  gospel_pump:  { low:  { rh:'comping',      rhv:'comping_var', lh:'oom_pah'       },
                  mid:  { rh:'gospel_pump',  rhv:'comping_var', lh:'oom_pah'       },
                  high: { rh:'gospel_pump',  rhv:'comping_var', lh:'comping_synco' } },
};

// Stili che usano shell voicings jazz (root+3rd+7th, senza 5a)
const JAZZ_SHELL_STYLES = new Set(['comping']);
// Stili senza pedale (jazz comping)
const NO_PEDAL_STYLES   = new Set(['comping']);
// Stili con anticipation notes (hit anticipata a -s16/2 sul beat forte)
const ANTICIPATION_STYLES = new Set(['comping', 'hip_hop_keys']);
// Stili con LH ghost beat (nota leggera su offbeat)
const LH_GHOST_STYLES = new Set(['hip_hop_keys', 'ballad']);
// Stili a fraseggio libero (RH generata da _genFreelyBar)
const FREELY_STYLES = new Set(['freely']);
// Stili con broken chord sempre attivo (RH usa _genBrokenBar)
const BROKEN_CHORD_STYLES = new Set(['broken_chords']);

// ═══════════════════════════════════════════════════════════════════
export function generatePiano(blueprint, drumContext = null, seedOverride = null, crossMemory = null) {
  const { sections, meta } = blueprint;
  const ppq      = meta.ppq;
  const barTicks = meta.barTicks;
  const s16      = ppq / 4;
  const bpm      = meta.bpm ?? 120; // S6-B
  const rng      = makeRng((seedOverride ?? meta.seed) ^ 0x7EA5);

  const events      = [];
  let prevRhVoicing = null;
  let prevRegionPc  = null;
  let prevRegionChord = null; // S6-B
  const seedMotive  = meta.seedMotive ?? null;  // T10 v2: contour hook per gradi di scala
  // Pool della scala globale ristretto al registro RH — usato per mappare il
  // contour del motivo su note reali, sempre in tonalità e sempre nello stesso
  // registro (così l'hook resta riconoscibile identico ad ogni ritornello).
  const hookScalePool = (meta.keyScaleNotes ?? []).filter(n => n >= RH.lo && n <= RH.hi + 12);
  // T11: RNG rest — stesso seed del BassGenerator per coerenza inter-strumentale
  const rngRest     = makeRng((seedOverride ?? meta.seed) ^ 0x5A23);
  // Carattere melodico per stile (cromatismo/stepBias) — usato dallo stile 'freely',
  // che prima sceglieva le note in modo puramente casuale (rng.choice), senza
  // alcun voice-leading tra una nota e la successiva.
  const character    = getMelodicCharacter(meta.style);
  const freelyMemory = new PhraseMemory();

  for (const section of sections) {
    const preset = section.modules.piano;
    if (!preset?.active) { prevRhVoicing = null; prevRegionPc = null; continue; }
    freelyMemory.reset();

    // Q2: warm-start voice leading quando prevRhVoicing è null (sezione piano dopo sezione senza piano)
    // Usa l'ultima nota registrata da crossMemory come ancora singola per _buildRhVoicing
    if (prevRhVoicing == null && crossMemory?.getEntryNote('piano') != null) {
      prevRhVoicing = [crossMemory.getEntryNote('piano')];
    }

    const style          = preset.style    ?? 'ballad';
    const movement       = preset.movement ?? 'medium';  // S8: per freely style
    const energy         = section.energy;
    const energyKey      = energy <= 3 ? 'low' : energy <= 6 ? 'mid' : 'high';
    const velBaseSection = preset.velocityBase ?? 60;
    const arcType        = preset.velocityArcType ?? 'flat';
    const usePedal       = !NO_PEDAL_STYLES.has(style);

    // FASE I: LH floor alzato a C3 (48) quando il basso è attivo nella stessa sezione.
    // Evita overlap frequenziale 65–220Hz tra LH piano e basso (anti-mud).
    const bassActive = section.modules.bass?.active ?? false;
    const LH = { lo: bassActive ? 48 : 36, hi: LH_HI };

    const patConf = STYLE_PATTERNS[style]?.[energyKey] ?? STYLE_PATTERNS['ballad']['mid'];

    // Densità RH: quante hit deboli conservare (0–1)
    const rhDensity = energy <= 3 ? 0.5 : energy <= 6 ? 0.75 : 1.0;

    if (usePedal) events.push({ tick: section.startTick, cc: 64, value: 100 });

    for (let b = 0; b < section.bars; b++) {
      const barStart  = section.startTick + b * barTicks;
      const isBar2    = b % 2 === 1;
      // T7: velocity arc — velBase varia bar per bar nella sezione
      const velBase   = arcVelocity(velBaseSection, b, section.bars, arcType);

      const region = section.harmonicMap.find(r =>
        r.start_tick <= barStart && r.end_tick > barStart
      ) ?? section.harmonicMap[0];
      if (!region) continue;

      // T11: se c'è rest_probability sul piano, riduzione densità (interplay, non silenzio)
      const pianoRestProb = preset.rest_probability ?? 0;
      const isPianoRestBar = pianoRestProb > 0
                          && b > 0
                          && b % 2 === 0
                          && rngRest.bool(pianoRestProb);
      // Quando il piano è in rest, rhDensity scende a 0.30 — suona rrado ma non tace
      const effectiveDensity = isPianoRestBar ? rhDensity * 0.30 : rhDensity;

      // Accordo al bar successivo — serve per anticipazioni contestuali
      const nextBarStart  = barStart + barTicks;
      const nextRegion    = section.harmonicMap.find(r =>
        r.start_tick <= nextBarStart && r.end_tick > nextBarStart
      ) ?? null;
      const chordChanging = nextRegion != null && nextRegion.rootPc !== region.rootPc;

      // Pedal: lift and re-press on chord change
      if (usePedal && prevRegionPc != null && prevRegionPc !== region.rootPc) {
        events.push({ tick: barStart - 5, cc: 64, value: 0   });
        events.push({ tick: barStart,     cc: 64, value: 100 });
      }
      // S5-A: estrai snareSteps per questo bar
      const snareSteps = drumContext?.get(barStart)?.snareSteps ?? null;
      // S6-B: calcolo tensione e risoluzione
      const tension = _chordTension(region.chord);
      const isResolution = prevRegionChord != null && _chordTension(prevRegionChord) >= 2 && tension === 0 && prevRegionPc !== region.rootPc;
      
      prevRegionPc = region.rootPc;
      prevRegionChord = region.chord;

      // Build voicings — quartale a bassa energia jazz, shell altrimenti, full per pop
      const useShell   = JAZZ_SHELL_STYLES.has(style);
      // Energy 4-5: crossfade probabilistico quartal→shell (non salto secco)
      const useQuartal = style === 'comping' && (energy <= 4 || (energy === 5 && rng.bool(0.60)));
      const rhVoicing  = useQuartal
        ? _buildQuartalVoicing(region, RH.lo, RH.hi)
        : useShell
          ? _buildShellVoicing(region, energy, region.scale_notes ?? [], tension)
          : _buildRhVoicing(region, prevRhVoicing);
      prevRhVoicing    = rhVoicing;
      const { lhRoot, lhFifth, lhChord } = _buildLhVoicing(region, LH);

      // Variant probabilistico: bar 2 → 65%, bar 3-4 di frase → 40%
      const barInPhrase = b % 4;
      const variantProb = barInPhrase === 1 ? 0.65 : (barInPhrase >= 2 ? 0.40 : 0);
      const useVariant  = patConf.rhv != null && rng.bool(variantProb);
      const rhPatName   = useVariant ? patConf.rhv : patConf.rh;
      const rhPattern = RH_PATTERNS[rhPatName]
                     ?? RH_PATTERNS[patConf.rh]
                     ?? RH_PATTERNS['ballad'];
      const lhPattern = LH_PATTERNS[patConf.lh] ?? LH_PATTERNS['ballad'];

      // Alberti bass RH: lo-hi-mid-hi in sedicesimi per stile alberti_bass
      const useAlberti      = style === 'alberti_bass' && energyKey !== 'high';
      // Broken chord (arpeggio) per ballad a bassa energia — 40% probabilità
      const useBroken       = style === 'ballad' && energyKey === 'low' && rng.bool(0.40);
      // S8: freely sempre usa _genFreelyBar; broken_chords sempre usa _genBrokenBar
      const useFreelyStyle       = FREELY_STYLES.has(style);
      const useBrokenChordsStyle = BROKEN_CHORD_STYLES.has(style);

      // ── Right hand ──────────────────────────────────────────
      if (useFreelyStyle) {
        events.push(..._genFreelyBar(barStart, region, s16, barTicks, velBase,
                                     section.endTick, rng, movement, freelyMemory, character));
      } else if (useAlberti) {
        events.push(..._genAlbertiBar(barStart, rhVoicing, s16, velBase, section.endTick));
      } else if (useBroken || useBrokenChordsStyle) {
        events.push(..._genBrokenBar(barStart, rhVoicing, s16, barTicks, velBase, section.endTick));
      } else {
      for (const [step16, durSteps, velFactor] of rhPattern) {
        const tick = barStart + step16 * s16;
        if (tick >= section.endTick) break;

        const dur = Math.min(
          Math.round(durSteps * s16 * 0.92),
          barTicks - step16 * s16 - 4
        );
        if (dur <= 0) continue;

        const isStrong = step16 === 0 || step16 === 8;

        // Density filter: skip alcuni hit deboli a bassa energia / rest bar (T11)
        if (!isStrong && !rng.bool(effectiveDensity)) continue;

        // S5-A: comping evita i tick esatti dello snare (25% probabilità skip)
        if (snareSteps?.has(step16) && !isStrong && rng.bool(0.25)) continue;

        // S5-B: ghost note su snareStep-1 (step precedente allo snare) — solo comping/hip_hop
        if (ANTICIPATION_STYLES.has(style) && snareSteps != null) {
          for (const ss of snareSteps) {
            const ghostStep = ss - 1;
            if (ghostStep === step16 && ghostStep >= 0) {
              const ghostTick = barStart + ghostStep * s16;
              if (ghostTick >= section.startTick) {
                events.push({ tick: ghostTick, note: rhVoicing[rhVoicing.length - 1],
                              velocity: rng.int(18, 28), duration: Math.round(s16 * 0.35) });
              }
            }
          }
        }

        const vel = Math.max(1, Math.min(127,
          Math.round(velBase * velFactor) + (isStrong ? rng.int(2, 8) : rng.int(-4, 4))
        ));

        // Strong beats: core voicing con inversioni voice-leading
        let notesToPlay = isStrong
          ? _coreVoicing(region, RH.lo, RH.hi, prevRhVoicing)
          : rhVoicing;

        // T10 v2 — HOOK: nel ritornello, sovrappone al voicing la stessa nota del
        // motivo melodico (stesso contour, stesso registro) ad ogni occorrenza —
        // è il gancio riconoscibile che lega tutti i chorus della canzone.
        // Applicazione affidabile (non probabilistica sulla prima barra) perché un
        // hook che non ricorre sempre uguale non viene percepito come tale.
        if (isStrong && section.type === 'chorus' && seedMotive?.length && hookScalePool.length) {
          const hookIdx  = (b * 2 + (step16 === 0 ? 0 : 1)) % seedMotive.length;
          const applyHook = b === 0 ? true : rng.bool(0.75);
          if (applyHook) {
            const degOffset = seedMotive[hookIdx];
            const scaleIdx  = Math.max(0, Math.min(hookScalePool.length - 1,
              Math.floor(hookScalePool.length / 2) + degOffset));
            const hookNote  = hookScalePool[scaleIdx];
            if (!notesToPlay.includes(hookNote)) notesToPlay = [...notesToPlay, hookNote];
          }
        }

          // S6-B: Stagger -10ms su dom7→maj risoluzione
          const stagger = isResolution 
            ? Math.round((-10 / (60000 / bpm)) * ppq) 
            : Math.round(s16 * 0.04);
            
          notesToPlay.forEach((pitch, ni) => {
            const t = tick + ni * stagger;
            const v = Math.max(1, vel - ni * 3);
            events.push({ tick: t, note: pitch, velocity: v, duration: dur });
          });

        // Anticipation note: probabilità contestuale — più alta prima di un cambio accordo
        const antProb = chordChanging ? 0.60 : isBar2 ? 0.35 : 0.15;
        if (ANTICIPATION_STYLES.has(style) && isStrong && rng.bool(antProb)) {
          const antTick = tick - Math.round(s16 / 2);
          if (antTick >= section.startTick) {
            const antNote = notesToPlay[notesToPlay.length - 1];
            events.push({ tick: antTick, note: antNote,
                          velocity: Math.max(1, vel - 18), duration: Math.round(s16 * 0.4) });
          }
        }
      }
      }

      // ── Left hand ───────────────────────────────────────────
      for (const [step16, durSteps, role] of lhPattern) {
        const tick = barStart + step16 * s16;
        if (tick >= section.endTick) break;

        const dur = Math.min(
          Math.round(durSteps * s16 * 0.95),
          barTicks - step16 * s16 - 4
        );
        if (dur <= 0) continue;

        const vel = Math.max(1, Math.min(127,
          Math.round(velBase * 0.85) + rng.int(-5, 5)
        ));

        switch (role) {
          case 'root':
            events.push({ tick, note: lhRoot, velocity: vel, duration: dur });
            break;
          case 'fifth':
            events.push({ tick, note: lhFifth, velocity: Math.max(1, vel - 4), duration: dur });
            break;
          case 'root+fifth':
            events.push({ tick, note: lhRoot,  velocity: vel,                  duration: dur });
            events.push({ tick, note: lhFifth, velocity: Math.max(1, vel - 8), duration: dur });
            break;
          case 'chord':
            lhChord.forEach(n => {
              events.push({ tick, note: n, velocity: Math.max(1, vel - 4), duration: dur });
            });
            break;
          case 'root_low': {
            // Oom-pah beat 1&3: root al registro più basso del LH (basso profondo)
            let basso = lhRoot;
            while (basso - 12 >= LH.lo) basso -= 12;
            events.push({ tick, note: basso, velocity: vel, duration: dur });
            break;
          }
          case 'chord_mid': {
            // Oom-pah beat 2&4: 3a + 5a nel registro medio LH (omit root bassa)
            const degs = region.chord_degrees.slice(1, 3);
            degs.forEach(dg => {
              let n = 60 + ((region.rootPc + dg) % 12);
              while (n < 48) n += 12;
              while (n > 57) n -= 12;
              n = Math.max(48, Math.min(57, n));
              events.push({ tick, note: n, velocity: Math.max(1, vel - 4), duration: dur });
            });
            break;
          }
        }
      }

      // LH approccio cromatico: anticipa il root del prossimo accordo a step 14
      if (chordChanging && rhDensity > 0.4 && nextRegion?.root != null) {
        const appTick = barStart + 14 * s16;
        if (appTick < section.endTick) {
          const targetRoot = clampToRegister(nextRegion.root, LH.lo, LH.hi);
          const below = targetRoot - 1, above = targetRoot + 1;
          const approach = Math.abs(below - lhRoot) <= Math.abs(above - lhRoot) ? below : above;
          events.push({
            tick:     appTick,
            note:     Math.max(LH.lo, Math.min(LH.hi, approach)),
            velocity: Math.max(1, Math.round(velBase * 0.60)),
            duration: Math.round(s16 * 0.85),
          });
        }
      }

      // LH ghost beat: nota leggera su un offbeat (step 2, 6, 10 o 14)
      if (LH_GHOST_STYLES.has(style) && rng.bool(0.15)) {
        const ghostStep = rng.choice([2, 6, 10, 14]);
        events.push({ tick: barStart + ghostStep * s16, note: lhRoot,
                      velocity: rng.int(20, 35), duration: Math.round(s16 * 0.3) });
      }
    }

    if (usePedal) events.push({ tick: section.endTick - 10, cc: 64, value: 0 });

    // Q2: aggiorna crossMemory dopo ogni sezione attiva — utile nel path gen() con
    // sezioni piano inattive nel mezzo (prevRhVoicing si azzera su !active)
    if (prevRhVoicing?.length) {
      crossMemory?.recordSectionEnd('piano', prevRhVoicing[prevRhVoicing.length - 1]);
    }
  }

  return { events, program: PIANO_PROGRAM };
}

// ── Core voicing: root+3rd+5th — prova le 3 inversioni, sceglie min-movimento ─
function _coreVoicing(region, lo, hi, prevVoicing = null) {
  const rootPc  = region.rootPc;
  const degrees = region.chord_degrees;
  const d       = [degrees[0] ?? 0, degrees[1] ?? 4, degrees[2] ?? 7];

  // Costruisce una voce a partire dal grado bassIdx come nota più bassa
  const buildInv = (bassIdx) => {
    let bassNote = 60 + ((rootPc + d[bassIdx]) % 12);
    while (bassNote < lo) bassNote += 12;
    while (bassNote > hi) bassNote -= 12;
    bassNote = Math.max(lo, Math.min(hi, bassNote));
    const notes = [bassNote];
    for (let i = 1; i < d.length; i++) {
      const deg = d[(bassIdx + i) % d.length];
      let p = 60 + ((rootPc + deg) % 12);
      while (p <= notes[notes.length - 1]) p += 12;
      if (p <= hi) notes.push(p);
    }
    return notes.sort((a, b) => a - b);
  };

  if (!prevVoicing?.length) return buildInv(0);

  let best = buildInv(0), bestCost = Infinity;
  for (let inv = 0; inv < d.length; inv++) {
    const v    = buildInv(inv);
    if (v.length < 2) continue;
    const cost = prevVoicing.reduce((sum, prev) =>
      sum + v.reduce((dx, c) => Math.min(dx, Math.abs(c - prev)), Infinity), 0);
    if (cost < bestCost) { bestCost = cost; best = v; }
  }
  return best;
}



// v0.4: upper extensions (9/11/13) ad alta energia + drop-2 se voicing compresso
// S6-B: _chordTension per calcolo dinamico extensions e spread
function _chordTension(chordStr) {
  if (!chordStr) return 0;
  if (chordStr.includes('dim') || chordStr.includes('aug')) return 3;
  if (chordStr.includes('dom') || chordStr.includes('7') || chordStr.includes('9') || chordStr.includes('11') || chordStr.includes('13')) {
    if (chordStr.includes('maj7')) return 1;
    if (chordStr.includes('m7') || chordStr.includes('min7')) return 1;
    return 2; // dominant
  }
  return 0; // maj/min
}

function _buildShellVoicing(region, energy = 5, scaleNotes = [], tension = 0) {
  const rootPc  = region.rootPc;
  const degrees = region.chord_degrees;
  const third   = degrees[1] ?? 4;
  const seventh = degrees[3] ?? 10;

  const shellDegs = [0, third, seventh];
  const notes = [];
  for (const deg of shellDegs) {
    let p = 60 + ((rootPc + deg) % 12);
    while (p < RH.lo) p += 12;
    while (p > RH.hi) p -= 12;
    notes.push(Math.max(RH.lo, Math.min(RH.hi, p)));
  }
  const baseNotes = [...new Set(notes)].sort((a, b) => a - b);

  // Upper extension: 9th/11th/13th — cerca la prima scala note sopra la 7th
  // S6-B: uso estensioni se alta energia o alta tensione
  const useExtensions = energy >= 6 || tension >= 2;
  if (useExtensions && scaleNotes.length > 0) {
    const top = baseNotes[baseNotes.length - 1];
    const ext = scaleNotes.find(n => n > top && n <= RH.hi);
    if (ext != null) baseNotes.push(ext);
  }

  // Drop-2: se il voicing è compresso in alto, o se c'è alta tensione (voicing spread)
  if (baseNotes.length >= 3 && (baseNotes[baseNotes.length - 1] > 80 || tension >= 2)) {
    const secondIdx = baseNotes.length - 2;
    const dropped   = baseNotes[secondIdx] - 12;
    if (dropped >= RH.lo) {
      baseNotes[secondIdx] = dropped;
      baseNotes.sort((a, b) => a - b);
    }
  }

  return _clampSpan(baseNotes);
}

// ── RH voicing with voice leading, guarantees root present ───────
function _buildRhVoicing(region, prevVoicing) {
  const degrees  = region.chord_degrees;
  const rootPc   = region.rootPc;
  const useDegs  = degrees.slice(0, 4);

  const candidates = [];
  for (let oct = 4; oct <= 7; oct++) {
    for (const deg of useDegs) {
      const pitch = oct * 12 + rootPc + deg;
      if (pitch >= RH.lo && pitch <= RH.hi) candidates.push(pitch);
    }
  }
  candidates.sort((a, b) => a - b);
  if (!candidates.length) return [60, 64, 67];

  const windowSize = Math.min(4, useDegs.length);
  let startIdx = Math.floor(candidates.length * 0.3);

  if (prevVoicing?.length) {
    // Voice leading ottimizzato: minimizza il movimento totale delle voci
    // (somma delle distanze minime nota-per-nota) invece del solo midpoint
    let bestCost = Infinity;
    for (let i = 0; i <= candidates.length - windowSize; i++) {
      const window = candidates.slice(i, i + windowSize);
      const cost   = prevVoicing.reduce((sum, prev) => {
        const minDist = window.reduce((d, c) => Math.min(d, Math.abs(c - prev)), Infinity);
        return sum + minDist;
      }, 0);
      if (cost < bestCost) { bestCost = cost; startIdx = i; }
    }
  }

  return _clampSpan(candidates.slice(startIdx, startIdx + windowSize));
}

// ── Quartal voicing: root + 4ª + 7ª minore (due quarte perfette impilate) ─
// Timbro aperto e ambiguo — tipico del jazz moderno e neo soul a bassa energia
function _buildQuartalVoicing(region, lo, hi) {
  const rootPc = region.rootPc;
  const notes  = [];
  for (const d of [0, 5, 10]) {
    let p = 60 + ((rootPc + d) % 12);
    while (p < lo) p += 12;
    while (p > hi) p -= 12;
    notes.push(Math.max(lo, Math.min(hi, p)));
  }
  return [...new Set(notes)].sort((a, b) => a - b);
}

// ── LH voicing ───────────────────────────────────────────────────
// FASE I: LH viene passata come parametro (non più costante globale)
function _buildLhVoicing(region, LH) {
  const lhRoot  = clampToRegister(region.root, LH.lo, LH.hi);
  const lhFifth = clampToRegister(region.root + 7, LH.lo, LH.hi);
  const degs    = region.chord_degrees.slice(0, 3);
  const lhChord = degs.map(d => {
    let n = lhRoot + d;
    while (n > LH.hi) n -= 12;
    while (n < LH.lo) n += 12;
    return Math.max(LH.lo, Math.min(LH.hi, n));
  }).sort((a, b) => a - b);
  return { lhRoot, lhFifth, lhChord };
}

// ── Span check: un pianista non può suonare più di ~14 semitoni per mano ─────
function _clampSpan(notes, maxSpan = 14) {
  if (notes.length < 2) return notes;
  const sorted = [...notes].sort((a, b) => a - b);
  while (sorted.length > 1 && sorted[sorted.length - 1] - sorted[0] > maxSpan) {
    sorted.pop();
  }
  return sorted;
}

// ── Alberti bass RH: lo-hi-mid-hi in sedicesimi ──────────────────────────────
// Schema classico: nota bassa → nota alta → nota media → nota alta (ripetuto per beat)
// Accentuazione naturale: primo sedicesimo di ogni battuta più forte
function _genAlbertiBar(barStart, voicing, s16, velBase, endTick) {
  if (!voicing?.length) return [];
  const events = [];
  const n   = voicing.length;
  const lo  = voicing[0];
  const hi  = voicing[n - 1];
  const mid = voicing[Math.floor(n / 2)];
  const beat = [lo, hi, mid, hi];      // schema lo-hi-mid-hi per ogni beat
  for (let step = 0; step < 16; step++) {
    const tick = barStart + step * s16;
    if (tick >= endTick) break;
    const dur  = Math.round(s16 * 0.88);
    const note = beat[step % 4];
    const isDownbeat = step % 4 === 0;
    const vel  = Math.max(1, Math.round(velBase * (isDownbeat ? 0.80 : 0.60)));
    events.push({ tick, note, velocity: vel, duration: dur });
  }
  return events;
}

// ── Broken chord (arpeggio) per ballad a bassa energia ────────────────────────
// La RH arpeggia il voicing in ottavi (ascendente → ritorno) invece di blocchi

// T8: sequenza adattiva alla lunghezza del voicing (fix out-of-bounds)
function _buildBrokenSeq(n) {
  if (n === 0) return [];
  if (n === 1) return [0, 0, 0, 0, 0, 0, 0, 0];
  if (n === 2) return [0, 1, 0, 1, 1, 0, 1, 0];  // alternanza senza ripetizioni consecutive
  return [0, 1, 2, 1, 0, 1, 2, 1];               // pattern originale per 3+ note
}

function _genBrokenBar(barStart, voicing, s16, barTicks, velBase, endTick) {
  if (!voicing?.length) return [];
  const n   = voicing.length;
  const idxSeq = _buildBrokenSeq(n);
  if (!idxSeq.length) return [];
  const events = [];
  for (let step = 0; step < 8; step++) {
    const tick = barStart + step * 2 * s16;  // ottavi: posizioni 0,2,4,6,8,10,12,14
    if (tick >= endTick) break;
    const note = voicing[idxSeq[step]];
    if (note == null) continue;
    const dur = Math.round(s16 * 1.9);
    const vel = Math.max(1, Math.round(velBase * (step === 0 ? 0.80 : 0.68)));
    events.push({ tick, note, velocity: vel, duration: dur });
  }
  return events;
}

// ── S8: Freely bar — fraseggio jazz/soul libero, mai due bar uguali ──────────
// region.scale_notes usate come pool melodico (note di scala nel registro RH).
// movement: 'minimal' (1-3 note), 'medium' (3-6 note), 'full' (6-10 note + run).
function _genFreelyBar(barStart, region, s16, barTicks, velBase, endTick, rng, movement,
                        memory = null, character = null) {
  const events = [];
  const scaleNotes = (region.scale_notes ?? []).filter(n => n >= RH.lo && n <= RH.hi);
  if (!scaleNotes.length) return events;

  // Numero di note target per il bar
  const minN = movement === 'minimal' ? 1 : movement === 'full' ? 5 : 2;
  const maxN = movement === 'minimal' ? 3 : movement === 'full' ? 9 : 5;
  const noteCount = rng.int(minN, maxN);

  // Durate in sedicesimi — brevi per full (crome/semicrome), lunghe per minimal (nere)
  const durPool = movement === 'full'
    ? [1, 1, 1, 2, 2]
    : movement === 'minimal'
    ? [2, 3, 4, 4]
    : [1, 2, 2, 3, 3];

  // Offset iniziale variabile (0–3 steps) per evitare sempre beat 1
  let cursor = rng.int(0, movement === 'minimal' ? 3 : 1);

  for (let i = 0; i < noteCount && cursor < 16; i++) {
    const tick = barStart + cursor * s16;
    if (tick >= endTick) break;

    // Prima: rng.choice puramente casuale — nessun legame tra una nota e la
    // successiva. Ora usa selectContextualNote con la PhraseMemory della
    // sezione: la linea "libera" ha comunque una direzione e un fraseggio
    // riconoscibile, con il grado di cromatismo tipico dello stile corrente.
    const note = memory
      ? selectContextualNote(scaleNotes, memory.lastNote, memory, rng, {
          stepBias: character?.stepBias ?? 0.6,
          randomness: (character?.randomness ?? 0.25) + 0.1, // "freely" resta più libero
          chromaticism: character?.chromaticism ?? 0,
        })
      : rng.choice(scaleNotes);
    memory?.record(note);
    const durSteps = rng.choice(durPool);
    const dur      = Math.min(
      Math.round(durSteps * s16 * 0.88),
      barTicks - cursor * s16 - 4
    );
    if (dur <= 0) { cursor += 1; continue; }

    const isStrong = cursor === 0 || cursor === 8;
    const velFact  = isStrong ? 0.90 : 0.60 + rng.int(0, 5) * 0.04;
    const vel      = Math.max(1, Math.min(127, Math.round(velBase * velFact)));

    events.push({ tick, note, velocity: vel, duration: dur });

    // Gap casuale tra nota e nota (respiro jazz)
    const gap = rng.int(0, movement === 'full' ? 1 : 2);
    cursor += durSteps + gap;
  }

  return events;
}
