/**
 * SessionManager.js — Gestione stato per Session Mode
 * ─────────────────────────────────────────────────────────────────
 * Modello dati completo per la composizione multi-sezione.
 * Nessuna dipendenza da Classic Mode / buildSong().
 *
 * API pubblica:
 *   new SessionManager(opts)          — crea sessione
 *   .getState()                       — stato completo
 *   .getSections()                    — array sezioni
 *   .getSection(id)                   — sezione per ID
 *   .setMeta(opts)                    — aggiorna key/bpm/style/name
 *   .addSection(type, opts)           — aggiunge sezione, ritorna oggetto
 *   .removeSection(id)                — rimuove sezione
 *   .replaceAllSections(specs)        — sostituisce tutte le sezioni in un
 *                                        solo snapshot di undo (rigenerazione
 *                                        completa: vedi nota in fondo al file)
 *   .moveSection(id, direction)       — 'up' | 'down'
 *   .lockSection(id, locked)          — blocca seed sezione
 *   .mutateSeed(id, newSeed?)         — cambia seed (se non locked)
 *   .lockInstrument(sid, inst, lock)  — blocca strumento in sezione
 *   .setInstrumentActive(sid, inst, active)
 *   .setCharacter(sid, inst, charId)  — assegna personaggio
 *   .setInstrumentParams(sid, inst, params)
 *   .setCachedEvents(sid, inst?, evts)
 *   .invalidateCache(sid?, inst?)     — invalida cache (null = tutti)
 *   .toJSON()                         — serializza (senza cachedEvents)
 *   SessionManager.fromJSON(data)     — deserializza
 *   .saveSnapshot()                   — salva stato corrente nella cronologia (max 10)
 *   .canUndo()                        — true se c'è almeno uno snapshot
 *   .undo()                           — ripristina snapshot precedente, ritorna true/false
 */

import { buildSong, buildHarmonicMap, STYLES, SONG_FORMS } from './SongArchitect.js';
import { bpmDensityScale }             from './FlowCore.js';

// ── Costanti ──────────────────────────────────────────────────────

export const INSTRUMENTS = ['drums', 'bass', 'guitar', 'piano', 'ensemble'];

export const SECTION_TYPES = ['intro', 'verse', 'chorus', 'bridge', 'outro', 'custom'];

// Bar di default per tipo sezione
const DEFAULT_BARS = { intro: 4, verse: 8, chorus: 8, bridge: 8, outro: 4, custom: 8 };

// Label visualizzata per tipo
const SECTION_LABELS = { intro: 'Intro', verse: 'Verse', chorus: 'Chorus',
                         bridge: 'Bridge', outro: 'Outro', custom: 'Custom' };

// ── Helpers privati ───────────────────────────────────────────────

function _uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function _rndSeed() {
  return Math.floor(Math.random() * 99998) + 1;
}

function _sectionLabel(type, countSameType) {
  const base = SECTION_LABELS[type] ?? type;
  return countSameType > 0 ? `${base} ${countSameType + 1}` : base;
}

function _defaultInstrumentState() {
  return {
    active:       true,
    locked:       false,
    seed:         _rndSeed(),
    characterId:  null,   // null = default del roster per tipo strumento
    params:       {},     // espanso da S5 in poi (knob, slider, dot-pattern)
    cachedEvents: null,   // null = rigenera al prossimo generate
  };
}

function _defaultSection(type, countSameType) {
  return {
    id:          _uid(),
    type,
    label:       _sectionLabel(type, countSameType),
    bars:        DEFAULT_BARS[type] ?? 8,
    seed:        _rndSeed(),
    lockedSeed:  false,
    progression: null,    // array di accordi custom, se null usa form generator
    instruments: Object.fromEntries(
      INSTRUMENTS.map(inst => [inst, _defaultInstrumentState()])
    ),
    cachedEvents: null,   // null = tutte le tracce da rigenerare
  };
}

// ── buildSectionBlueprint ─────────────────────────────────────────

// Mapping stile → form che contiene tutti i tipi di sezione
const _SESSION_FORMS = {
  unplugged:         'unplugged_ballad',
  folk:              'folk_standard',
  jazz_ballad:       'jazz_standard',
  neo_soul:          'neo_soul_standard',
  classical:         'classical_standard',
  pop_rock:          'pop_rock_standard',
  bossa_nova:        'bossa_nova_standard',
  blues_rock:        'blues_rock_standard',
  singer_songwriter: 'singer_songwriter_standard',
};

/**
 * Costruisce un SongBlueprint a sezione singola compatibile con tutti i generatori.
 *
 * @param {object} sessionMeta  — { key, bpm, style, ensemble? }
 * @param {object} section      — oggetto sezione da SessionManager.getSections()
 * @returns {SongBlueprint}     — { meta, sections: [singleSection] }
 */
export function buildSectionBlueprint(sessionMeta, section) {
  const formKey = _SESSION_FORMS[sessionMeta.style] ?? 'unplugged_ballad';

  // buildSong produce l'armonia e i moduli per il tipo di sezione richiesto
  const fullBp = buildSong({
    style:    sessionMeta.style,
    key:      sessionMeta.key,
    bpm:      sessionMeta.bpm,
    form:     formKey,
    seed:     section.seed,
    ensemble: sessionMeta.ensemble ?? 'strings',
  });

  const barTicks = fullBp.meta.barTicks;
  const bars     = section.bars;

  // Trova la sezione del tipo corretto (o fallback alla prima disponibile)
  const srcSec = fullBp.sections.find(s => s.type === section.type)
               ?? fullBp.sections[0];

  const maxTick = bars * barTicks;

  // Se la sezione ha una progressione personalizzata, ricalcola l'harmonicMap da zero
  // usando buildHarmonicMap (stessa logica di SongArchitect, finestre di mezzo bar)
  let harmonicMap;
  if (section.progression?.length) {
    harmonicMap = buildHarmonicMap(
      section.progression,
      0,          // startTick = 0 (normalizzato)
      bars,
      fullBp.meta.ppq,
      barTicks,
      sessionMeta.style,
    ).filter(r => r.start_tick < maxTick);
  } else {
    // Normalizza harmonicMap originale: tick spostati a startTick = 0
    const tickShift = -srcSec.startTick;
    harmonicMap = srcSec.harmonicMap
      .map(r => ({
        ...r,
        start_tick: r.start_tick + tickShift,
        end_tick:   Math.min(r.end_tick + tickShift, maxTick),
      }))
      .filter(r => r.start_tick < maxTick);
  }

  // Applica params da SessionState ai moduli (strumento per strumento)
  const modules = {};
  for (const inst of INSTRUMENTS) {
    const srcMod    = srcSec.modules?.[inst];
    if (!srcMod) continue;
    const instState = section.instruments?.[inst];
    const p         = instState?.params ?? {};

    if (inst === 'drums') {
      // feel (0–1) → energyOverride = srcEnergy ± 2 rispetto a 0.5 centrale
      const feelAdj = p.feel != null ? Math.round((p.feel - 0.5) * 4) : 0;
      modules.drums = {
        ...srcMod,
        active:         instState?.active ?? srcMod.active,
        style:          p.style          ?? srcMod.style,
        energyOverride: p.feel != null
          ? Math.max(1, Math.min(10, srcSec.energy + feelAdj)) : undefined,
        ghostBoost:     p.ghost          ?? 1.0,
        fillDensity:    p.fills          ?? undefined,
        velocityBase:   p.velocity != null
          ? Math.round(p.velocity * 100) : srcMod.velocityBase,
      };

    } else if (inst === 'bass') {
      modules.bass = {
        ...srcMod,
        active:           instState?.active ?? srcMod.active,
        style:            p.style           ?? srcMod.style,
        density:          bpmDensityScale(sessionMeta.bpm, p.density ?? srcMod.density),
        rest_probability: p.rest            ?? srcMod.rest_probability,
        velocityBase:     p.velocity != null
          ? Math.round(p.velocity * 100) : srcMod.velocityBase,
        register:         p.lowestNote != null
          ? { lo: p.lowestNote, hi: srcMod.register?.hi ?? 55 }
          : srcMod.register,
      };

    } else if (inst === 'piano') {
      modules.piano = {
        ...srcMod,
        active:           instState?.active ?? srcMod.active,
        style:            p.style           ?? srcMod.style,
        velocityBase:     p.velocity != null
          ? Math.round(p.velocity * 100) : srcMod.velocityBase,
        velocityArcType:  p.arcType         ?? srcMod.velocityArcType,
        movement:         p.movement        ?? srcMod.movement,
      };

    } else if (inst === 'guitar') {
      modules.guitar = {
        ...srcMod,
        active:       instState?.active ?? srcMod.active,
        style:        p.style          ?? srcMod.style,
        velocityBase: p.velocity != null
          ? Math.round(p.velocity * 100) : srcMod.velocityBase,
      };

    } else if (inst === 'ensemble') {
      // Se il SM ha ensemble attivo, costruiamo il modulo da zero con tutti i campi
      // necessari a EnsembleGenerator — srcMod può essere {active:false} senza campi utili.
      const ensActive = instState?.active ?? srcMod.active;
      if (ensActive) {
        modules.ensemble = {
          active:       true,
          style:        p.playStyle ?? 'pad',
          velocityBase: p.velocity != null ? Math.round(p.velocity * 100) : (srcMod.velocityBase ?? 55),
          density:      bpmDensityScale(sessionMeta.bpm, srcMod.density ?? 0.5),
          dynamics:     srcMod.dynamics ?? 'mp',
          energy:       srcSec.energy ?? 5,
          register:     srcMod.register ?? { lo: 62, hi: 88 },  // VOICE_REGISTERS.ensemble
        };
      } else {
        modules.ensemble = { ...srcMod, active: false };
      }

    } else {
      modules[inst] = { ...srcMod, active: instState?.active ?? srcMod.active };
    }
  }

  const singleSection = {
    ...srcSec,
    bars,
    startTick:   0,
    endTick:     maxTick,
    harmonicMap,
    modules,
    index:       0,
  };

  const ensTypeOverride = section.instruments.ensemble?.params?.ensStyle
                        ?? section.instruments.ensemble?.params?.style;  // backward-compat
  return {
    meta: {
      ...fullBp.meta,
      seed: section.seed,
      totalBars: bars,
      ...(ensTypeOverride
        ? { ensemble: { ...(fullBp.meta.ensemble ?? {}), type: ensTypeOverride } }
        : {}),
    },
    sections: [singleSection],
  };
}

// ═════════════════════════════════════════════════════════════════
// SessionManager
// ═════════════════════════════════════════════════════════════════

export class SessionManager {

  constructor(opts = {}) {
    this._state = {
      id:        _uid(),
      name:      opts.name  ?? 'Nuova Sessione',
      key:       opts.key   ?? 'Am',
      bpm:       opts.bpm   ?? 90,
      style:     opts.style ?? 'unplugged',
      sections:  [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this._history = [];  // SC2: cronologia snapshot per undo
  }

  // ── Lettura ────────────────────────────────────────────────────

  getState()      { return this._state; }
  getSections()   { return this._state.sections; }

  getSection(id) {
    return this._state.sections.find(s => s.id === id) ?? null;
  }

  // ── Configurazione globale ─────────────────────────────────────

  setMeta(opts = {}) {
    if (opts.name  !== undefined) this._state.name  = opts.name;
    if (opts.key   !== undefined) this._state.key   = opts.key;
    if (opts.bpm   !== undefined) this._state.bpm   = opts.bpm;
    if (opts.style !== undefined) this._state.style = opts.style;
    this._touch();
  }

  // ── Sezioni ────────────────────────────────────────────────────

  addSection(type = 'verse', opts = {}) {
    const countSame = this._state.sections.filter(s => s.type === type).length;
    const sec = _defaultSection(type, countSame);
    if (opts.bars  !== undefined) sec.bars = opts.bars;
    if (opts.seed  !== undefined) sec.seed = opts.seed;
    if (opts.label !== undefined) sec.label = opts.label;

    if (opts.after !== undefined) {
      const idx = this._state.sections.findIndex(s => s.id === opts.after);
      if (idx >= 0) {
        this._state.sections.splice(idx + 1, 0, sec);
        this._touch();
        return sec;
      }
    }
    this._state.sections.push(sec);
    this._touch();
    return sec;
  }

  removeSection(id) {
    const idx = this._state.sections.findIndex(s => s.id === id);
    if (idx < 0) return false;
    this.saveSnapshot();
    this._state.sections.splice(idx, 1);
    this._touch();
    return true;
  }

  /**
   * Sostituisce l'intero arrangiamento con un nuovo set di sezioni, in
   * un solo snapshot di undo (bug fix: prima, una rigenerazione completa
   * chiamava removeSection()/setSectionProgression() sezione per sezione,
   * ognuna delle quali salva il proprio snapshot — un "Genera" con 9
   * sezioni riempiva la cronologia con 18 stati intermedi del rebuild.
   * Cliccare "↩ Annulla" subito dopo restituiva uno di questi stati a
   * metà smontaggio invece del brano precedente, sembrando cancellare
   * sezioni a caso. Ora un solo snapshot copre l'intera operazione: un
   * click su "↩ Annulla" torna correttamente al brano precedente per
   * intero, con un solo passo).
   * @param {Array<{type, bars, seed, progression}>} specs
   */
  replaceAllSections(specs) {
    this.saveSnapshot();
    this._state.sections = [];
    for (const spec of specs) {
      const sec = this.addSection(spec.type, { bars: spec.bars, seed: spec.seed });
      if (spec.progression?.length) this._setSectionProgressionSilent(sec, spec.progression);
    }
    this._touch();
    return this._state.sections;
  }

  moveSection(id, direction) {
    const arr = this._state.sections;
    const idx = arr.findIndex(s => s.id === id);
    if (idx < 0) return false;
    const next = idx + (direction === 'up' ? -1 : 1);
    if (next < 0 || next >= arr.length) return false;
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    this._touch();
    return true;
  }

  setSectionProgression(id, progression) {
    const sec = this.getSection(id);
    if (!sec) return false;
    this.saveSnapshot();
    this._setSectionProgressionSilent(sec, progression);
    this._touch();
    return true;
  }

  /** Come setSectionProgression, ma senza salvare uno snapshot — per uso
   *  interno da replaceAllSections(), che ne salva già uno per l'intera
   *  operazione. */
  _setSectionProgressionSilent(sec, progression) {
    sec.progression = progression;
    sec.cachedEvents = null;
    for (const inst of INSTRUMENTS) {
      if (!sec.instruments[inst].locked) sec.instruments[inst].cachedEvents = null;
    }
  }

  // ── Seed ───────────────────────────────────────────────────────

  lockSection(id, locked = true) {
    const sec = this.getSection(id);
    if (!sec) return false;
    sec.lockedSeed = locked;
    this._touch();
    return true;
  }

  mutateSeed(id, newSeed = null) {
    const sec = this.getSection(id);
    if (!sec || sec.lockedSeed) return false;
    this.saveSnapshot();
    sec.seed = newSeed ?? _rndSeed();
    sec.cachedEvents = null;
    for (const inst of INSTRUMENTS) {
      if (!sec.instruments[inst].locked) sec.instruments[inst].cachedEvents = null;
    }
    this._touch();
    return true;
  }

  mutateInstrumentSeed(sectionId, instrument, newSeed = null) {
    const sec = this.getSection(sectionId);
    if (!sec || !sec.instruments[instrument]) return false;
    if (sec.instruments[instrument].locked) return false;
    sec.instruments[instrument].seed = newSeed ?? _rndSeed();
    sec.instruments[instrument].cachedEvents = null;
    this._touch();
    return true;
  }

  // ── Strumenti ─────────────────────────────────────────────────

  lockInstrument(sectionId, instrument, locked = true) {
    const sec = this.getSection(sectionId);
    if (!sec || !sec.instruments[instrument]) return false;
    sec.instruments[instrument].locked = locked;
    if (!locked) sec.instruments[instrument].cachedEvents = null;
    this._touch();
    return true;
  }

  setInstrumentActive(sectionId, instrument, active) {
    const sec = this.getSection(sectionId);
    if (!sec || !sec.instruments[instrument]) return false;
    sec.instruments[instrument].active = active;
    sec.instruments[instrument].cachedEvents = null;
    this._touch();
    return true;
  }

  setCharacter(sectionId, instrument, characterId) {
    const sec = this.getSection(sectionId);
    if (!sec || !sec.instruments[instrument]) return false;
    sec.instruments[instrument].characterId = characterId;
    if (!sec.instruments[instrument].locked) sec.instruments[instrument].cachedEvents = null;
    this._touch();
    return true;
  }

  setInstrumentParams(sectionId, instrument, params) {
    const sec = this.getSection(sectionId);
    if (!sec || !sec.instruments[instrument]) return false;
    sec.instruments[instrument].params = {
      ...sec.instruments[instrument].params,
      ...params,
    };
    if (!sec.instruments[instrument].locked) sec.instruments[instrument].cachedEvents = null;
    this._touch();
    return true;
  }

  // ── Cache eventi ───────────────────────────────────────────────

  setCachedEvents(sectionId, instrument, events) {
    const sec = this.getSection(sectionId);
    if (!sec) return false;
    if (instrument) {
      if (!sec.instruments[instrument]) return false;
      sec.instruments[instrument].cachedEvents = events;
    } else {
      sec.cachedEvents = events;
    }
    return true;
  }

  // SC1 — Dependency map per invalidazione granulare
  static CACHE_DEPS = {
    progression: ['bass', 'guitar', 'piano', 'ensemble'],  // drums non dipende dall'armonia
    seed:       ['drums', 'bass', 'guitar', 'piano', 'ensemble'],
    style:      ['drums', 'bass', 'guitar', 'piano', 'ensemble'],
    bpm:        ['drums'],                                 // solo timing
    key:        ['bass', 'guitar', 'piano', 'ensemble'],
    character:  ['drums', 'bass', 'guitar', 'piano', 'ensemble'],
  };

  /**
   * Invalida cache granulare per motivo specifico.
   * Risparmia rigenerazioni: cambio accordo non invalida drums.
   * @param {string} sectionId  ID sezione
   * @param {string} reason     'progression'|'seed'|'style'|'bpm'|'key'|'character'
   * @param {string|null} instrument  null = tutti gli strumenti dipendenti
   */
  invalidateCacheForReason(sectionId, reason = 'all', instrument = null) {
    const sec = this.getSection(sectionId);
    if (!sec) return;

    const toInvalidate = reason === 'all'
      ? [...INSTRUMENTS]
      : (SessionManager.CACHE_DEPS[reason] ?? []);

    for (const inst of toInvalidate) {
      if (instrument && inst !== instrument) continue;
      if (sec.instruments[inst] && !sec.instruments[inst].locked) {
        sec.instruments[inst].cachedEvents = null;
      }
    }
    this._touch();
  }

  /**
   * Invalida cache (legacy — usa invalidation granulare dove possibile).
   * @param {string|null} sectionId  null = tutte le sezioni
   * @param {string|null} instrument null = tutti gli strumenti non locked
   */
  invalidateCache(sectionId = null, instrument = null) {
    const targets = sectionId
      ? [this.getSection(sectionId)].filter(Boolean)
      : this._state.sections;

    for (const sec of targets) {
      if (instrument) {
        if (sec.instruments[instrument]) sec.instruments[instrument].cachedEvents = null;
      } else {
        sec.cachedEvents = null;
        for (const inst of INSTRUMENTS) {
          if (!sec.instruments[inst].locked) sec.instruments[inst].cachedEvents = null;
        }
      }
    }
    this._touch();
  }

  // ── Esportazione / Assemblaggio ────────────────────────────────

  /**
   * Assembla tutti gli eventi in cache in una singola timeline.
   * Presuppone che tutte le sezioni attive abbiano cachedEvents validi.
   * Include i Program Change per strumento quando cambiano tra sezioni.
   * @param {number} ppq
   * @returns {Object} {
   *   drums:[], bass:[], guitar:[], piano:[],
   *   e0:{ evts:[], ch:5, prog:48, progChanges:[] },
   *   e1:{ evts:[], ch:6, prog:48, progChanges:[] },
   *   e2:{ evts:[], ch:7, prog:48, progChanges:[] },
   * }
   */
  assembleSessionEvents(ppq) {
    const trackBuffers = {
      drums: [], bass: [], guitar: [], piano: [],
      e0: { evts: [], ch: 5, prog: 48, name: 'Ensemble V1', progChanges: [] },
      e1: { evts: [], ch: 6, prog: 48, name: 'Ensemble V2', progChanges: [] },
      e2: { evts: [], ch: 7, prog: 48, name: 'Ensemble V3', progChanges: [] },
    };
    // Tracking program precedenti per emettere PC solo su cambio
    const prevProg = { drums: null, bass: null, guitar: null, piano: null, e0: null, e1: null, e2: null };
    let globalTick = 0;

    const formName  = (STYLES[this._state.style] ?? STYLES['unplugged']).defaultForm;
    const barTicks  = ppq * (SONG_FORMS[formName]?.[0]?.beatsPerBar ?? 4);

    for (const sec of this._state.sections) {
      const sectionTicks = sec.bars * barTicks;

      for (const inst of INSTRUMENTS) {
        const instState = sec.instruments[inst];
        if (!instState.active || !instState.cachedEvents) continue;

        if (inst === 'ensemble') {
          // Ensemble ha voiceEvents separati con channel embedded
          const cached = instState.cachedEvents;
          const voiceEvts = cached.voiceEvents ?? [];
          const programs  = cached.programs ?? [cached.prog ?? 48, cached.prog ?? 48, cached.prog ?? 48];
          const channels  = cached.channels ?? [5, 6, 7];

          voiceEvts.forEach((vv, vi) => {
            const key = `e${vi}`;
            if (!trackBuffers[key]) return;
            const prog = programs[vi] ?? 48;
            const ch = channels[vi] ?? (5 + vi);
            // Aggiorna channel e prog dalla prima sezione che li definisce
            trackBuffers[key].ch = ch;
            trackBuffers[key].prog = prog;
            // Emetti Program Change se diverso dal precedente
            if (prevProg[key] !== prog) {
              trackBuffers[key].progChanges.push({ tick: globalTick, prog, ch });
              prevProg[key] = prog;
            }
            for (const e of vv) {
              if (e.cc == null)  // solo note, no CC nell'export MIDI grezzo
                trackBuffers[key].evts.push({ ...e, tick: e.tick + globalTick });
            }
          });
        } else {
          // Strumenti singoli: drums, bass, guitar, piano
          const cached = instState.cachedEvents;
          const prog = cached.program ?? this._defaultProgramForInst(inst);
          const ch = this._channelForInst(inst);

          // Emetti Program Change se diverso dal precedente
          if (prevProg[inst] !== prog) {
            trackBuffers[inst].push({ type: 'pc', tick: globalTick, prog, ch });
            prevProg[inst] = prog;
          }

          const evts = cached.events || [];
          for (const e of evts) {
            trackBuffers[inst].push({ ...e, tick: e.tick + globalTick });
          }
        }
      }
      globalTick += sectionTicks;
    }
    return trackBuffers;
  }

  /** Restituisce il canale MIDI di default per strumento */
  _channelForInst(inst) {
    const channels = { drums: 9, bass: 1, guitar: 2, piano: 3, ensemble: 5 };
    return channels[inst] ?? 0;
  }

  /** Restituisce il program number di default per strumento */
  _defaultProgramForInst(inst) {
    const defaults = { drums: 0, bass: 32, guitar: 25, piano: 0, ensemble: 48 };
    return defaults[inst] ?? 0;
  }

  // ── Serializzazione ────────────────────────────────────────────

  /** Ritorna copia serializzabile (senza cachedEvents). */
  toJSON() {
    const state = JSON.parse(JSON.stringify(this._state));
    for (const sec of state.sections) {
      sec.cachedEvents = null;
      for (const inst of INSTRUMENTS) {
        if (sec.instruments[inst]) sec.instruments[inst].cachedEvents = null;
      }
    }
    return state;
  }

  static fromJSON(data) {
    const mgr = new SessionManager();
    mgr._state = { ...data };
    return mgr;
  }

  // ── Undo / Snapshot ────────────────────────────────────────────

  /** Salva snapshot dello stato corrente (max 10, senza cachedEvents). */
  saveSnapshot() {
    this._history.push(this.toJSON());
    if (this._history.length > 10) this._history.shift();
  }

  /** True se c'è almeno uno snapshot disponibile. */
  canUndo() {
    return this._history.length > 0;
  }

  /** Ripristina snapshot precedente. Ritorna true se riuscito. */
  undo() {
    if (!this.canUndo()) return false;
    this._state = this._history.pop();
    return true;
  }

  // ── Privato ────────────────────────────────────────────────────

  _touch() {
    this._state.updatedAt = new Date().toISOString();
  }
}
