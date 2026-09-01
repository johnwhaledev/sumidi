/**
 * ChordGrid.js — la griglia di accordi incollata a mano (A4 di PLAN37)
 * ─────────────────────────────────────────────────────────────────
 * Trasforma il testo che l'utente incolla — `| Am7 | D7 | Gmaj7 | % |`, il
 * formato di ingresso che chiunque abbia usato Band-in-a-Box riconosce — in una
 * progressione nel formato di suMidi (`['Am7', 1]`, `['Dm7', 0.5]`).
 *
 * E' il secondo caso d'uso del programma: non "generami una canzone" ma
 * "accompagnami sui MIEI accordi". Il motore c'era gia' tutto — parseChord
 * gestisce slash chord ed estensioni, `section.progression` accetta gia' le
 * progressioni custom, la mezza battuta esiste da A1 — mancava solo il parser.
 *
 * Qui dentro non si tocca il DOM e non si legge nessuno stato: si riceve testo,
 * si restituisce o una progressione o un errore che dice dove guardare.
 */

import { parseChord, CHORD_INTERVALS } from './SongArchitect.js';

/** Due, perche' la griglia armonica e' di mezza battuta (A1). */
export const MAX_ACCORDI_PER_BATTUTA = 2;

/** Oltre questa lunghezza non e' piu' una griglia incollata, e' un disco. */
export const MAX_BATTUTE = 64;

/** Ripetizione della battuta precedente, come in Band-in-a-Box. */
const RIPETI = ['%', '/'];

/**
 * Controlla un singolo accordo. parseChord da solo non basta: su una qualita'
 * che non conosce ricade su 'maj' senza dirlo, e "Am7x" diventerebbe un La
 * maggiore silenziosamente.
 * @param {string} nome
 * @returns {string|null} il messaggio d'errore, o null se l'accordo va bene
 */
function _erroreAccordo(nome) {
  const parsed = parseChord(nome);
  if (!parsed) return `"${nome}" non è un accordo: manca la nota (A-G, con # o b)`;
  if (!CHORD_INTERVALS[parsed.quality]) {
    return `"${nome}": non conosco la sigla "${parsed.qualityStr}"`;
  }
  return null;
}

/**
 * Analizza il testo della griglia.
 *
 * Regole, tutte quelle che servono e nessuna in piu':
 *   - le battute si separano con `|`; le barre a inizio e fine riga sono
 *     facoltative, e ogni riga di testo e' solo un modo di andare a capo;
 *   - una riga senza nessuna `|` vale come una battuta per accordo
 *     (`Am F C G` = quattro battute), perche' e' come si scrive di fretta;
 *   - due accordi nella stessa battuta si scrivono con uno spazio
 *     (`| Dm7 G7 |`) e prendono mezza battuta ciascuno;
 *   - `%` (o `/`) ripete la battuta precedente.
 *
 * @param {string} testo
 * @param {object} [opts]
 * @param {number} [opts.maxBattute]
 * @returns {{ok: true, battute: number, progressione: Array, anteprima: string[]}
 *          |{ok: false, errore: string, riga?: number, battuta?: number}}
 */
export function analizzaGriglia(testo, { maxBattute = MAX_BATTUTE } = {}) {
  if (typeof testo !== 'string' || !testo.trim()) {
    return { ok: false, errore: 'Non c\'è niente da leggere: incolla una griglia di accordi.' };
  }

  const battute = [];   // ogni voce: array di 1 o 2 nomi di accordo

  const righe = testo.split(/\r?\n/);
  for (let r = 0; r < righe.length; r++) {
    const riga = righe[r].trim();
    if (!riga) continue;

    // Senza barre: una battuta per accordo. Con le barre: le barre comandano,
    // e quelle iniziale e finale sono solo cornice.
    let celle;
    if (!riga.includes('|')) {
      celle = riga.split(/\s+/);
    } else {
      celle = riga.split('|');
      if (celle[0].trim() === '') celle.shift();
      if (celle.length && celle[celle.length - 1].trim() === '') celle.pop();
    }

    for (let c = 0; c < celle.length; c++) {
      const cella = celle[c].trim();
      const numero = battute.length + 1;
      if (!cella) {
        return { ok: false, riga: r + 1, battuta: numero,
                 errore: `Battuta ${numero} vuota: scrivi un accordo o "%" per ripetere la precedente.` };
      }

      const pezzi = cella.split(/\s+/);
      if (pezzi.length === 1 && RIPETI.includes(pezzi[0])) {
        if (!battute.length) {
          return { ok: false, riga: r + 1, battuta: numero,
                   errore: 'La prima battuta non può essere "%": non c\'è niente da ripetere.' };
        }
        battute.push([...battute[battute.length - 1]]);
        continue;
      }

      if (pezzi.length > MAX_ACCORDI_PER_BATTUTA) {
        return { ok: false, riga: r + 1, battuta: numero,
                 errore: `Battuta ${numero}: ${pezzi.length} accordi in una battuta, il massimo è ${MAX_ACCORDI_PER_BATTUTA} (mezza battuta ciascuno).` };
      }

      for (const nome of pezzi) {
        const errore = _erroreAccordo(nome);
        if (errore) return { ok: false, riga: r + 1, battuta: numero, errore: `Battuta ${numero}: ${errore}.` };
      }
      battute.push(pezzi);

      if (battute.length > maxBattute) {
        return { ok: false, riga: r + 1, battuta: battute.length,
                 errore: `Troppe battute: il massimo è ${maxBattute}.` };
      }
    }
  }

  if (!battute.length) return { ok: false, errore: 'Nessuna battuta riconosciuta.' };

  // Progressione: una voce per accordo, con la durata in battute. Le battute
  // identiche di fila si fondono in una voce sola ('Am' per 4 battute =
  // ['Am', 4]), che e' la stessa forma compatta che usa il resto del motore.
  const progressione = [];
  for (const accordi of battute) {
    if (accordi.length === 1) {
      const ultima = progressione[progressione.length - 1];
      if (ultima && ultima[0] === accordi[0] && Number.isInteger(ultima[1])) ultima[1] += 1;
      else progressione.push([accordi[0], 1]);
    } else {
      const durata = 1 / accordi.length;
      for (const nome of accordi) progressione.push([nome, durata]);
    }
  }

  return {
    ok: true,
    battute: battute.length,
    progressione,
    anteprima: battute.map(a => a.join(' ')),
  };
}
