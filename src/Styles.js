/**
 * Styles.js
 * ─────────────────────────────────────────────────────────────────
 * Metadati per ciascun genere musicale (bpm, key, forma di default,
 * ensemble, feel, humanize, swing...). Estratto da SongArchitect.js
 * (sessione R1 — PLAN35).
 * ─────────────────────────────────────────────────────────────────
 */

// 5. STYLE METADATA
// ═══════════════════════════════════════════════════════════════════

/**
 * Top-level style configuration.
 * Used to fill in defaults when user doesn't specify everything.
 */
export const STYLES = {
  unplugged: {
    label:        'MTV Unplugged',
    defaultForm:  'unplugged_ballad',
    availableForms: ['unplugged_ballad','unplugged_short','unplugged_no_bridge','unplugged_extended'],
    defaultKey:   'Am',
    defaultScale: 'minor',
    defaultBpm:   { min: 60, max: 80, preferred: 72 },
    progressionFamily: 'unplugged',
    ensemble:     { type: 'strings', voices: 3 },
    feel:         'straight',
    humanize:     0.35,
    swing:        0.0,
  },
  folk: {
    label:        'Folk Acoustic',
    defaultForm:  'folk_standard',
    availableForms: ['folk_standard'],
    defaultKey:   'G',
    defaultScale: 'major',
    defaultBpm:   { min: 80, max: 110, preferred: 95 },
    progressionFamily: 'folk',
    ensemble:     { type: 'strings', voices: 3 },
    feel:         'straight',
    humanize:     0.4,
    swing:        0.0,
  },
  jazz_ballad: {
    label:        'Jazz Ballad',
    defaultForm:  'jazz_standard',
    availableForms: ['jazz_standard','jazz_aaba'],
    defaultKey:   'C',
    defaultScale: 'major',
    defaultBpm:   { min: 50, max: 80, preferred: 65 },
    progressionFamily: 'jazz',
    ensemble:     { type: 'woodwinds', voices: 3 },
    feel:         'swing_light',
    humanize:     0.5,
    swing:        0.25,
  },
  neo_soul: {
    label:        'Neo Soul',
    defaultForm:  'neo_soul_standard',
    availableForms: ['neo_soul_standard'],
    defaultKey:   'Dm',
    defaultScale: 'dorian',
    defaultBpm:   { min: 65, max: 90, preferred: 78 },
    progressionFamily: 'neo_soul',
    ensemble:     { type: 'strings', voices: 3 },
    feel:         'behind',
    humanize:     0.45,
    swing:        0.15,
  },
  classical: {
    label:        'Classical Chamber',
    defaultForm:  'classical_standard',
    availableForms: ['classical_standard'],
    defaultKey:   'C',
    defaultScale: 'major',
    defaultBpm:   { min: 60, max: 100, preferred: 80 },
    progressionFamily: 'classical',
    ensemble:     { type: 'strings', voices: 3 },
    feel:         'straight',
    humanize:     0.3,
    swing:        0.0,
  },
  pop_rock: {
    label:        'Pop Rock',
    defaultForm:  'pop_rock_standard',
    availableForms: ['pop_rock_standard', 'pop_rock_short'],
    defaultKey:   'A',
    defaultScale: 'major',
    defaultBpm:   { min: 100, max: 130, preferred: 112 },
    progressionFamily: 'pop_rock',
    ensemble:     { type: 'brass', voices: 3 },
    feel:         'straight',
    humanize:     0.30,
    swing:        0.0,
  },
  bossa_nova: {
    label:        'Bossa Nova',
    defaultForm:  'bossa_nova_standard',
    availableForms: ['bossa_nova_standard', 'bossa_nova_aaba'],
    defaultKey:   'A',
    defaultScale: 'major',
    defaultBpm:   { min: 110, max: 145, preferred: 130 },
    progressionFamily: 'bossa_nova',
    ensemble:     { type: 'woodwinds', voices: 3 },
    feel:         'swing_light',
    humanize:     0.45,
    swing:        0.10,
  },
  blues_rock: {
    label:        'Blues Rock',
    defaultForm:  'blues_rock_standard',
    availableForms: ['blues_rock_standard'],
    defaultKey:   'E',
    defaultScale: 'blues',          // FASE H: blues invece di mixolydian (blue note b5)
    defaultBpm:   { min: 85, max: 115, preferred: 100 },
    progressionFamily: 'blues_rock',
    ensemble:     { type: 'brass', voices: 3 },
    feel:         'shuffle',        // BUG-2: era 'straight' — drums shufflano, altri dritti → mismatch
    humanize:     0.40,
    swing:        0.18,             // BUG-2: era 0.0 — ~1/6 s16 = triplet feel light
  },
  singer_songwriter: {
    label:        'Singer/Songwriter',
    defaultForm:  'singer_songwriter_standard',
    availableForms: ['singer_songwriter_standard'],
    defaultKey:   'G',
    defaultScale: 'major',
    defaultBpm:   { min: 65, max: 90, preferred: 76 },
    progressionFamily: 'singer_songwriter',
    ensemble:     { type: 'chamber', voices: 3 },
    feel:         'straight',
    humanize:     0.38,
    swing:        0.0,
  },
  latin: {
    label:        'Latin / Afro-Cuban',
    defaultForm:  'latin_standard',
    availableForms: ['latin_standard'],
    defaultKey:   'Am',
    defaultScale: 'minor',
    defaultBpm:   { min: 100, max: 140, preferred: 120 },
    progressionFamily: 'latin',
    ensemble:     { type: 'brass', voices: 3 },
    feel:         'straight',
    humanize:     0.35,
    swing:        0.0,
  },
  cinematic: {
    label:        'Cinematic / Orchestral',
    defaultForm:  'cinematic_standard',
    availableForms: ['cinematic_standard'],
    defaultKey:   'Am',
    defaultScale: 'minor',
    defaultBpm:   { min: 55, max: 90, preferred: 72 },
    progressionFamily: 'cinematic',
    ensemble:     { type: 'strings', voices: 4 },
    feel:         'straight',
    humanize:     0.30,
    swing:        0.0,
  },
  reggae: {
    label:        'Reggae / Dub',
    defaultForm:  'reggae_standard',
    availableForms: ['reggae_standard'],
    defaultKey:   'C',
    defaultScale: 'major',
    defaultBpm:   { min: 70, max: 100, preferred: 84 },
    progressionFamily: 'reggae',
    ensemble:     { type: 'brass', voices: 3 },
    feel:         'straight',
    humanize:     0.30,
    swing:        0.0,
  },
  lo_fi: {
    label:        'Lo-Fi',
    defaultForm:  'lo_fi_standard',
    availableForms: ['lo_fi_standard'],
    defaultKey:   'Dm',
    defaultScale: 'dorian',
    defaultBpm:   { min: 70, max: 90, preferred: 80 },
    progressionFamily: 'lo_fi',
    ensemble:     { type: 'strings', voices: 2 },
    feel:         'behind',          // groove rilassato, dietro il beat
    humanize:     0.55,              // wobble da tape/vinile
    swing:        0.20,
  },
  punk: {
    label:        'Punk',
    defaultForm:  'punk_standard',
    availableForms: ['punk_standard', 'punk_short'],
    defaultKey:   'A',
    defaultScale: 'major',
    defaultBpm:   { min: 160, max: 190, preferred: 175 },
    progressionFamily: 'punk',
    // di fatto inattivo (trio powerchord puro, niente sezione orchestrale):
    // il campo resta popolato solo perché generateSong() lo legge sempre
    // (styleDef.ensemble.type/voices); EnsembleGenerator.js lo ignora
    // consapevolmente per questo stile (vedi ORCHESTRAL_DISABLED_STYLES).
    ensemble:     { type: 'strings', voices: 2 },
    feel:         'straight',
    humanize:     0.18,              // tight e grezzo, poco rubato
    swing:        0.0,
  },
  garage_rock: {
    label:        'Garage Rock',
    defaultForm:  'garage_rock_standard',
    availableForms: ['garage_rock_standard'],
    defaultKey:   'E',
    defaultScale: 'mixolydian',
    defaultBpm:   { min: 120, max: 150, preferred: 132 },
    progressionFamily: 'garage_rock',
    // di fatto inattivo (trio puro, niente sezione orchestrale): vedi nota
    // analoga su punk — ignorato consapevolmente da EnsembleGenerator.js
    // (ORCHESTRAL_DISABLED_STYLES).
    ensemble:     { type: 'strings', voices: 2 },
    feel:         'straight',
    humanize:     0.32,              // più sporco/live del punk
    swing:        0.05,
  },
  chiptune: {
    label:        '8-Bit / Chiptune',
    defaultForm:  'chiptune_standard',
    availableForms: ['chiptune_standard'],
    defaultKey:   'C',
    defaultScale: 'major',
    defaultBpm:   { min: 140, max: 165, preferred: 152 },
    progressionFamily: 'chiptune',
    // di fatto inattivo (square/pulse wave, niente sezione orchestrale):
    // ignorato consapevolmente da EnsembleGenerator.js
    // (ORCHESTRAL_DISABLED_STYLES).
    ensemble:     { type: 'chamber', voices: 2 },
    feel:         'straight',
    humanize:     0.0,               // quantizzazione rigida — estetica chip
    swing:        0.0,
  },
};

