/**
 * Playback.js — Motore di riproduzione audio via WebAudioFont
 * ─────────────────────────────────────────────────────────────────
 * Sostituisce il vecchio SynthPreview (oscillatori Web Audio grezzi,
 * rimosso perché "inutile e fastidioso") con campioni reali via la
 * libreria WebAudioFont (https://github.com/surikov/webaudiofont),
 * set sonoro FluidR3_GM.
 *
 * Design:
 *  - Nessuna barra di scorrimento / playhead sincronizzato: solo un
 *    bottone play/stop per sezione o brano intero, con indicatore
 *    statico (non-scrubbing) di cosa sta suonando.
 *  - Carica solo i timbri effettivamente usati dai brani generati
 *    (batteria/percussioni GM, basso, chitarra acustica/elettrica,
 *    piano/rhodes, archi solisti e in ensemble, ottoni, flauto) —
 *    non un intero soundfont da decine/centinaia di MB.
 *  - I preset vengono caricati "on demand" dal CDN ufficiale del
 *    progetto (https://surikov.github.io/webaudiofontdata/) al primo
 *    utilizzo e tenuti in cache in memoria per il resto della sessione.
 *    Se in futuro si vuole rendere l'app utilizzabile offline / senza
 *    dipendere da un CDN di terzi, basta scaricare i file elencati in
 *    PROGRAM_PRESET / le varianti percussive e cambiare WAF_CDN_BASE
 *    in un percorso locale (es. './soundfonts') — nessun'altra modifica
 *    al resto del modulo è necessaria.
 * ─────────────────────────────────────────────────────────────────
 */

const WAF_CDN_BASE   = './soundfonts';
// CDN ufficiale WebAudioFont — usato come fallback automatico quando un
// preset non è presente in locale (es. le varianti extra del mixer, mai
// scaricate col setup base): evita di dover pre-scaricare N file "nel
// dubbio" per ogni possibile variante timbrica, si scarica solo quello che
// viene davvero usato, al volo, la prima volta che serve.
const WAF_REMOTE_BASE = 'https://surikov.github.io/webaudiofontdata/sound';
const WAF_PLAYER_URL = 'https://surikov.github.io/webaudiofont/npm/dist/WebAudioFontPlayer.js';

// ── Catalogo timbri melodici (program GM → codice preset FluidR3_GM) ──
// Copre i program number emessi dai generatori (Guitar/Bass/Piano/Chord/
// Ensemble) PIÙ le varianti extra selezionabili dal mixer (routing MIDI in
// anteprima, non solo in export) — queste ultime marcate sotto, caricate
// dal CDN al volo se non presenti in soundfonts/ (vedi WAF_REMOTE_BASE).
const PROGRAM_PRESET = {
  0:  '0000',  // Acoustic Grand Piano
  1:  '0010',  // Bright Acoustic Piano — mixer piano "Brt. Piano"
  4:  '0040',  // Electric Piano 1 (Rhodes — usato per lo stile lo_fi)
  5:  '0050',  // Electric Piano 2 — mixer piano "El. Piano 2"
  6:  '0060',  // Harpsichord — mixer piano "Harpsi."
  7:  '0070',  // Clavinet — mixer piano "Clavinet"
  24: '0240',  // Acoustic Guitar (nylon) — chitarra classica
  25: '0250',  // Acoustic Guitar (steel) — fingerpicking/arpeggio/strumming
  26: '0260',  // Jazz Guitar — mixer guitar "Jazz"
  27: '0270',  // Clean Electric Guitar — mixer guitar "Clean"
  28: '0280',  // Muted Electric Guitar — mixer guitar "Muted"
  29: '0290',  // Overdriven Guitar — riff
  30: '0300',  // Distortion Guitar — powerchord
  32: '0320',  // Acoustic Bass
  33: '0330',  // Electric Bass (finger) — fingerstyle/walking
  34: '0340',  // Electric Bass (pick)
  35: '0350',  // Fretless Bass
  36: '0360',  // Slap Bass 1
  38: '0380',  // Synth Bass 1 — mixer bass "Synth Bass"
  40: '0400',  // Violin (voce soprano ensemble "chamber")
  41: '0410',  // Viola (voce alto ensemble "chamber")
  42: '0420',  // Cello (voce tenor ensemble "chamber")
  48: '0480',  // String Ensemble 1 (ensemble "strings")
  49: '0490',  // String Ensemble 2 (traccia chord/pad di riferimento)
  50: '0500',  // Synth Strings 1 — mixer ensemble "SynthStr 1"
  52: '0520',  // Choir Aahs — mixer ensemble "Choir"
  61: '0610',  // Brass Section (ensemble "brass")
  73: '0730',  // Flute (ensemble "woodwinds")
};
const DEFAULT_MELODIC_PROGRAM = 0;

// ── Catalogo percussioni (nota MIDI GM → varianti FluidR3_GM da provare) ──
// A differenza dei timbri melodici, per le percussioni WebAudioFont non
// espone un unico "drum kit": ogni pezzo è un preset a sé, indicizzato
// per nota. Non tutte le note hanno necessariamente la stessa variante
// disponibile lato CDN, quindi si prova una piccola lista di varianti
// candidate finché una risponde — vedi _loadDrumPreset.
const DRUM_NOTES = [
  35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52,
  53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 75,
];
const DRUM_VARIANT_CANDIDATES = [0, 1, 2, 3, 4, 6];

// Finestra di "lookahead" per lo scheduler a rotazione (vedi playTracks):
// invece di creare TUTTI gli AudioBufferSourceNode in un colpo solo a inizio
// riproduzione (con un brano intero questo può significare migliaia di nodi
// creati sincronamente, che in alcuni browser/macchine sovraccarica il
// thread audio e produce un ammutolimento dopo la prima manciata di note),
// si accodano solo le note che cadono entro i prossimi SCHEDULE_LOOKAHEAD_SEC
// secondi, ricontrollando ogni SCHEDULE_INTERVAL_MS.
const SCHEDULE_LOOKAHEAD_SEC = 2.5;
const SCHEDULE_INTERVAL_MS   = 300;

// ── Stato interno del modulo ───────────────────────────────────────
let _audioContext   = null;
let _player         = null;
let _playerLibPromise = null;
const _melodicCache = new Map();  // program -> Promise<presetVar>
const _drumCache    = new Map();  // note -> Promise<presetVar|null>
let _activeEnvelopes = [];        // eventi in coda sull'ultima riproduzione
let _schedulerHandle = null;      // setInterval dello scheduler a rotazione

function _ensureContext() {
  if (!_audioContext) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    _audioContext = new Ctx();
  }
  // I browser sospendono l'AudioContext finché non c'è un gesto utente:
  // il click sul bottone play è già quel gesto, ma il resume va comunque
  // richiesto esplicitamente. Qui il resume() non viene atteso (usato solo
  // dai loader dei preset, che non dipendono da ctx.currentTime) — vedi
  // _ensureContextResumed() per il percorso di scheduling, dove invece è
  // fondamentale attenderlo.
  if (_audioContext.state === 'suspended') _audioContext.resume();
  return _audioContext;
}

/**
 * Come _ensureContext(), ma ATTENDE che l'AudioContext sia effettivamente
 * 'running' prima di restituirlo. Necessario perché finché il context è
 * 'suspended' il suo ctx.currentTime resta congelato (spesso a 0): se si
 * calcola "startAt = ctx.currentTime + margine" mentre è ancora sospeso e poi
 * lo si usa per schedulare le note, il resume() che arriva poco dopo può far
 * scattare l'orologio audio da un punto diverso da quello previsto, con
 * l'effetto di sentire tutte le note "compresse" in un istante iniziale
 * seguito da silenzio. Va chiamato subito prima di calcolare startAt.
 */
async function _ensureContextResumed() {
  const ctx = _ensureContext();
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch { /* alcuni browser rifiutano se non c'è più un gesto utente recente */ }
  }
  return ctx;
}

function _loadPlayerLib() {
  if (window.WebAudioFontPlayer) return Promise.resolve();
  if (_playerLibPromise) return _playerLibPromise;
  _playerLibPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = WAF_PLAYER_URL;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Impossibile caricare WebAudioFontPlayer da ' + WAF_PLAYER_URL));
    document.head.appendChild(s);
  });
  return _playerLibPromise;
}

function _ensurePlayer() {
  if (!_player) _player = new window.WebAudioFontPlayer();
  return _player;
}

/**
 * Carica uno script preset in una variabile globale specifica, risolvendo
 * a `null` (non a errore) se non si popola — usato sia per il tentativo
 * locale che per l'eventuale fallback CDN.
 */
function _loadPresetVar(ctx, player, url, varName) {
  return new Promise((resolve) => {
    player.loader.startLoad(ctx, url, varName);
    player.loader.waitLoad(() => resolve(window[varName] ?? null));
  });
}

/**
 * Carica (con cache) il preset melodico per un dato program GM. Prova
 * prima la cartella locale soundfonts/ (veloce, offline); se il file non
 * c'è (es. una delle varianti extra selezionabili dal mixer, non incluse
 * nel set base scaricato), ricade sul CDN ufficiale WebAudioFont — così
 * non serve pre-scaricare N file "per sicurezza", solo quelli davvero
 * usati vengono recuperati, al volo, la prima volta che servono.
 */
function _loadMelodicPreset(program) {
  const code = PROGRAM_PRESET[program] ?? PROGRAM_PRESET[DEFAULT_MELODIC_PROGRAM];
  if (_melodicCache.has(code)) return _melodicCache.get(code);

  const fname = `${code}_FluidR3_GM_sf2_file.js`;
  const ctx = _ensureContext();
  const player = _ensurePlayer();

  const localVar = `_tone_${code}_FluidR3_GM_sf2_file`;
  const p = _loadPresetVar(ctx, player, `${WAF_CDN_BASE}/${fname}`, localVar)
    .then(preset => preset ?? _loadPresetVar(ctx, player, `${WAF_REMOTE_BASE}/${fname}`, `${localVar}_remote`));
  _melodicCache.set(code, p);
  return p;
}

/** Carica (con cache, provando più varianti) il preset percussivo per una nota MIDI. */
function _loadDrumPreset(note) {
  if (_drumCache.has(note)) return _drumCache.get(note);

  const ctx = _ensureContext();
  const player = _ensurePlayer();

  const tryVariant = (idx) => {
    if (idx >= DRUM_VARIANT_CANDIDATES.length) return Promise.resolve(null); // nessuna variante disponibile: nota silenziosa
    const v = DRUM_VARIANT_CANDIDATES[idx];
    const varName = `_drum_${note}_${v}_FluidR3_GM_sf2_file`;
    const url = `${WAF_CDN_BASE}/128${note}_${v}_FluidR3_GM_sf2_file.js`;
    return new Promise((resolve) => {
      player.loader.startLoad(ctx, url, varName);
      player.loader.waitLoad(() => resolve(window[varName] ?? null));
    }).then(preset => preset ?? tryVariant(idx + 1));
  };

  const p = tryVariant(0);
  _drumCache.set(note, p);
  return p;
}

/**
 * Precarica tutti i timbri necessari per un set di tracce.
 * @param {Array<{channel:number, events:Array, program?:number}>} tracks
 * @returns {Promise<void>}
 */
export async function preloadForTracks(tracks) {
  await _loadPlayerLib();
  const jobs = [];
  const seenPrograms = new Set();
  const seenNotes = new Set();

  for (const track of tracks ?? []) {
    if (track.channel === 9) {
      for (const e of track.events ?? []) {
        if (e.note == null || seenNotes.has(e.note)) continue;
        seenNotes.add(e.note);
        jobs.push(_loadDrumPreset(e.note));
      }
    } else {
      const program = track.program ?? DEFAULT_MELODIC_PROGRAM;
      if (!seenPrograms.has(program)) {
        seenPrograms.add(program);
        jobs.push(_loadMelodicPreset(program));
      }
    }
  }
  await Promise.all(jobs);
}

/**
 * Riproduce un set di tracce (stesso formato usato da smGenerateSection /
 * gen(): array di { channel, events, program } dove events è
 * { tick, note, velocity, duration } — gli eventi CC (automazione, non
 * supportata da WebAudioFont per nota) vengono ignorati in anteprima ma
 * restano intatti nel MIDI esportato.
 *
 * @param {Array} tracks
 * @param {{ppq:number, bpm:number}} timing
 * @returns {Promise<{ stop: Function, durationSec: number }>}
 */
export async function playTracks(tracks, timing) {
  stopAll();
  await preloadForTracks(tracks);

  const ctx = await _ensureContextResumed();
  const player = _ensurePlayer();
  const { ppq: rawPpq, bpm: rawBpm } = timing;
  // Guardia difensiva: alcuni generatori/percorsi possono in teoria produrre
  // ppq/bpm mancanti o non numerici — invece di propagare NaN fino a
  // AudioParam.linearRampToValueAtTime (che lancia se riceve un valore non
  // finito, interrompendo l'intera riproduzione), si ricade su default sani.
  const ppq = Number.isFinite(rawPpq) && rawPpq > 0 ? rawPpq : 480;
  const bpm = Number.isFinite(rawBpm) && rawBpm > 0 ? rawBpm : 120;
  const secPerTick = 60 / bpm / ppq;
  const startAt = ctx.currentTime + 0.05; // piccolo margine per evitare click di schedulazione a t=0

  // ── Fase 1: costruisce la coda di note (nessun nodo Web Audio ancora
  // creato — solo calcolo dei tempi). Con un brano intero questa coda può
  // avere migliaia di elementi: crearli TUTTI come AudioBufferSourceNode
  // in un colpo solo (come si faceva prima) sovraccarica il thread audio
  // e produce un ammutolimento dopo la prima manciata di note. Si accoda
  // invece un descrittore leggero, e i nodi veri vengono creati poco alla
  // volta da scheduleDue() qui sotto, man mano che si avvicina il momento
  // in cui devono suonare.
  const queue = [];
  let totalEvents = 0, skippedEvents = 0;

  for (const track of tracks ?? []) {
    const isDrum = track.channel === 9;
    for (const e of track.events ?? []) {
      if (e.note == null || !Number.isFinite(e.note)) continue; // salta CC/automazione o note corrotte
      totalEvents++;
      const tick = Number.isFinite(e.tick) ? e.tick : 0;
      const rawDurTicks = Number.isFinite(e.duration) ? e.duration : ppq / 4;
      const rawVelocity = Number.isFinite(e.velocity) ? e.velocity : 90;

      const whenSec = startAt + tick * secPerTick;
      const durSec  = Math.max(0.02, rawDurTicks * secPerTick);
      const gain    = Math.max(0, Math.min(1, rawVelocity / 127));
      if (!Number.isFinite(whenSec) || !Number.isFinite(durSec) || !Number.isFinite(gain)) { skippedEvents++; continue; }

      queue.push({ whenSec, durSec, gain, note: e.note, isDrum, program: track.program });
    }
  }
  queue.sort((a, b) => a.whenSec - b.whenSec);

  let maxEndSec = 0;
  for (const item of queue) maxEndSec = Math.max(maxEndSec, item.whenSec - ctx.currentTime + item.durSec);

  // ── Fase 2: scheduler a rotazione ──────────────────────────────────
  const envelopes = [];
  _activeEnvelopes = envelopes;
  let idx = 0;
  let scheduledEvents = 0, failedEvents = 0;

  function scheduleDue() {
    const horizon = ctx.currentTime + SCHEDULE_LOOKAHEAD_SEC;
    while (idx < queue.length && queue[idx].whenSec <= horizon) {
      const item = queue[idx];
      idx++;
      const presetPromise = item.isDrum ? _loadDrumPreset(item.note) : _loadMelodicPreset(item.program ?? DEFAULT_MELODIC_PROGRAM);
      presetPromise.then(preset => {
        if (!preset) return; // nota percussiva senza timbro disponibile: silenziosa, non bloccante
        try {
          const env = player.queueWaveTable(ctx, ctx.destination, preset, item.whenSec, item.note, item.durSec, item.gain);
          envelopes.push(env);
          scheduledEvents++;
        } catch (err) {
          failedEvents++;
          console.error('[Playback] queueWaveTable fallita per nota', item.note, 'a', item.whenSec.toFixed(2), 's:', err);
        }
      });
    }
    if (idx >= queue.length && _schedulerHandle) {
      clearInterval(_schedulerHandle);
      _schedulerHandle = null;
      console.info(`[Playback] scheduler completato: scheduled≈${scheduledEvents} failed=${failedEvents} skipped(pre)=${skippedEvents} su ${totalEvents} eventi`);
    }
  }

  scheduleDue(); // prima tranche subito, così l'attacco del brano non ha latenza
  if (_schedulerHandle) clearInterval(_schedulerHandle);
  _schedulerHandle = setInterval(scheduleDue, SCHEDULE_INTERVAL_MS);

  console.info(`[Playback] ctx.state=${ctx.state} tracks=${tracks?.length ?? 0} eventi totali=${totalEvents} durata stimata=${maxEndSec.toFixed(2)}s (scheduling a rotazione, lookahead ${SCHEDULE_LOOKAHEAD_SEC}s)`);

  return {
    durationSec: maxEndSec,
    stop: stopAll,
  };
}

/** Interrompe immediatamente qualunque riproduzione in corso. */
export function stopAll() {
  if (_schedulerHandle) {
    clearInterval(_schedulerHandle);
    _schedulerHandle = null;
  }
  for (const env of _activeEnvelopes) {
    try { env?.cancel?.(); } catch { /* nota già terminata, ignorabile */ }
  }
  _activeEnvelopes = [];
  if (_player && _audioContext) {
    try { _player.cancelQueue(_audioContext); } catch { /* nessuna coda attiva */ }
  }
}

/** True se il motore ha già un AudioContext attivo (utile per lo stato UI). */
export function isReady() {
  return !!_audioContext;
}
