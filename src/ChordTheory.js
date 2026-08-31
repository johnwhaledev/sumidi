/**
 * ChordTheory.js
 * ─────────────────────────────────────────────────────────────────
 * Teoria armonica di base: pitch class, intervalli di accordo e di scala.
 * Estratto da SongArchitect.js (sessione R1 — PLAN35) per separare i dati
 * statici dalla logica di building. Nessuna dipendenza da altri moduli.
 * ─────────────────────────────────────────────────────────────────
 */

// ═══════════════════════════════════════════════════════════════════
// 1. CHORD THEORY
// ═══════════════════════════════════════════════════════════════════

/**
 * All 12 chromatic pitch classes (index = semitones from C).
 * Used to resolve chord names to MIDI root numbers.
 */
export const PITCH_CLASS = {
  'C': 0,  'C#': 1, 'Db': 1,
  'D': 2,  'D#': 3, 'Eb': 3,
  'E': 4,
  'F': 5,  'F#': 6, 'Gb': 6,
  'G': 7,  'G#': 8, 'Ab': 8,
  'A': 9,  'A#': 10,'Bb': 10,
  'B': 11,
};

/**
 * Chord interval maps (semitones from root).
 * Covers all 28 chord types referenced in the Python codebase.
 */
export const CHORD_INTERVALS = {
  // Triads
  'maj':        [0, 4, 7],
  'min':        [0, 3, 7],
  'dim':        [0, 3, 6],
  'aug':        [0, 4, 8],
  // 7ths
  'maj7':       [0, 4, 7, 11],
  'min7':       [0, 3, 7, 10],
  'dom7':       [0, 4, 7, 10],
  '7':          [0, 4, 7, 10],   // alias
  'dim7':       [0, 3, 6, 9],
  'hdim7':      [0, 3, 6, 10],
  'aug7':       [0, 4, 8, 10],
  'minmaj7':    [0, 3, 7, 11],
  // 9ths
  'maj9':       [0, 4, 7, 11, 14],
  'min9':       [0, 3, 7, 10, 14],
  'dom9':       [0, 4, 7, 10, 14],
  'add9':       [0, 4, 7, 14],
  // Suspended
  'sus2':       [0, 2, 7],
  'sus4':       [0, 5, 7],
  'dom7sus4':   [0, 5, 7, 10],
  // 6ths
  '6':          [0, 4, 7, 9],
  'min6':       [0, 3, 7, 9],
  'm6':         [0, 3, 7, 9],    // alias
  'maj69':      [0, 4, 7, 9, 14],
  // Extended
  'dom11':      [0, 4, 7, 10, 14, 17],
  'dom13':      [0, 4, 7, 10, 14, 21],
  'min11':      [0, 3, 7, 10, 14, 17],
  'maj7sh11':   [0, 4, 7, 11, 18],
  '7sh9':       [0, 4, 7, 10, 15],  // Hendrix chord
};

/**
 * Scale interval patterns (semitones from root).
 */
export const SCALE_INTERVALS = {
  'major':           [0, 2, 4, 5, 7, 9, 11],
  'minor':           [0, 2, 3, 5, 7, 8, 10],
  'dorian':          [0, 2, 3, 5, 7, 9, 10],
  'mixolydian':      [0, 2, 4, 5, 7, 9, 10],
  'phrygian':        [0, 1, 3, 5, 7, 8, 10],
  'lydian':          [0, 2, 4, 6, 7, 9, 11],
  'harmonic_minor':  [0, 2, 3, 5, 7, 8, 11],
  'blues':           [0, 3, 5, 6, 7, 10],
  'pentatonic_minor':[0, 3, 5, 7, 10],
  'pentatonic_major':[0, 2, 4, 7, 9],
};

// ═══════════════════════════════════════════════════════════════════
// 2. FORMATO DELLE PROGRESSIONI
// ═══════════════════════════════════════════════════════════════════

/**
 * Una progressione usa un formato misto: l'accordo è una stringa quando dura
 * una battuta ('Am'), oppure una coppia [nome, battute] quando ne dura di più
 * (['Am7', 2]). La seconda forma compare nei pool jazz e blues_rock.
 *
 * A1 di PLAN37 — la durata può anche essere **mezza battuta** (['Am7', 0.5]):
 * è la granularità con cui buildHarmonicMap costruisce le regioni armoniche
 * (finestre di mezza battuta in 4/4). Prima non esisteva alcun modo di
 * rappresentare un accordo più corto di una battuta, e questo escludeva dal
 * motore il ii-V dentro la battuta, la cadenza che stringe sull'ultima e ogni
 * accelerazione armonica: un brano suMidi aveva sempre lo stesso passo, su
 * tutti e 13 gli stili. Durate più corte di mezza battuta vengono arrotondate
 * a mezza: meglio sentirle dove non erano previste che perderle del tutto.
 *
 * Chi deve solo mostrare l'accordo usi nomeAccordo(): trattare la coppia come
 * stringa produce "Am7,2" a video. Chi deve allineare gli accordi alle battute
 * usi accordiPerBattuta(); chi deve mostrarli a chi legge, etichettePerBattuta(),
 * che in una battuta con due accordi li mostra entrambi. Tutte e tre passano da
 * accordiPerFinestra(), che è anche la logica con cui buildHarmonicMap decide
 * quale accordo copre quale finestra: una fonte sola, come per B3.
 */

// Finestre per battuta con cui si leggono le progressioni: mezza battuta, cioè
// la stessa granularità delle regioni armoniche in 4/4.
export const FINESTRE_PER_BATTUTA = 2;
export function nomeAccordo(voce) {
  return Array.isArray(voce) ? voce[0] : voce;
}

/**
 * Espande una progressione in un accordo per finestra, ciclando se la sezione è
 * più lunga della progressione. È la funzione di base: accordiPerBattuta ed
 * etichettePerBattuta ne sono due letture.
 *
 * @param {Array<string|[string, number]>} progressione
 * @param {number} battute            — quante battute coprire
 * @param {number} finestrePerBattuta — 1 = una finestra per battuta, 2 = mezze
 * @returns {string[]} un nome di accordo per ogni finestra
 */
export function accordiPerFinestra(progressione, battute, finestrePerBattuta = FINESTRE_PER_BATTUTA) {
  const normalizzata = (progressione ?? []).map(v => (Array.isArray(v) ? v : [v, 1]));
  if (!normalizzata.length || !(battute > 0) || !(finestrePerBattuta > 0)) return [];

  // Durate convertite in finestre intere. Il minimo è una finestra: un accordo
  // più corto della griglia disponibile si sente comunque, allungato.
  const inFinestre = normalizzata.map(([nome, durata]) =>
    [nome, Math.max(1, Math.round((durata ?? 1) * finestrePerBattuta))]);

  const lunghezzaCiclo = inFinestre.reduce((somma, [, durata]) => somma + durata, 0);
  if (!(lunghezzaCiclo > 0)) return [];

  const fuori = [];
  const totale = Math.round(battute * finestrePerBattuta);
  for (let finestra = 0; finestra < totale; finestra++) {
    const posizione = finestra % lunghezzaCiclo;
    let accumulate = 0, nome = inFinestre[0][0];
    for (const [accordo, durata] of inFinestre) {
      if (posizione < accumulate + durata) { nome = accordo; break; }
      accumulate += durata;
    }
    fuori.push(nome);
  }
  return fuori;
}

/**
 * Un accordo per battuta: quello su cui la battuta parte. Per le progressioni
 * a battute intere — cioè tutte quelle scritte finora — è esattamente il
 * risultato di prima.
 *
 * @param {Array<string|[string, number]>} progressione
 * @param {number} battute  — quante battute coprire
 * @returns {string[]} un nome di accordo per ogni battuta
 */
export function accordiPerBattuta(progressione, battute) {
  const finestre = accordiPerFinestra(progressione, battute);
  return Array.from({ length: Math.max(0, Math.trunc(battute)) },
    (_, bar) => finestre[bar * FINESTRE_PER_BATTUTA]).filter(x => x != null);
}

/**
 * Un'etichetta per battuta, per chi legge: 'Am7' se la battuta ha un accordo
 * solo, 'Am7 D7' se ne ha due. Serve a chord chart e CRD, che altrimenti
 * mostrerebbero solo il primo dei due e direbbero una cosa diversa da quella
 * che si sente — la divergenza che B1 di PLAN36 aveva già pagato una volta.
 *
 * @param {Array<string|[string, number]>} progressione
 * @param {number} battute
 * @returns {string[]} un'etichetta per ogni battuta
 */
export function etichettePerBattuta(progressione, battute) {
  const finestre = accordiPerFinestra(progressione, battute);
  const fuori = [];
  for (let bar = 0; bar < Math.trunc(battute); bar++) {
    const nella = finestre.slice(bar * FINESTRE_PER_BATTUTA, (bar + 1) * FINESTRE_PER_BATTUTA)
      .filter(x => x != null);
    if (!nella.length) break;
    fuori.push([...new Set(nella)].join(' '));
  }
  return fuori;
}
