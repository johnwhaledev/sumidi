import { describe, it, expect } from 'vitest';
import { buildSectionBlueprint } from '../src/SessionManager.js';
import { generatePiano } from '../src/PianoGenerator.js';
import { generateGuitar } from '../src/GuitarGenerator.js';

// O1 di PLAN37 — Solo Mode costruiva il blueprint della sezione così com'era e
// accendeva solo lo strumento scelto: gli altri moduli restavano `active` anche
// se nessuno li avrebbe generati. I generatori però guardano proprio quel flag
// per adattarsi a chi manca, quindi l'adattamento c'era ed era spento.
// Questi test fissano l'adattamento (che vive nei generatori) e la condizione
// che lo accende, perché è invisibile: nessuno se ne accorge leggendo il codice
// di Solo Mode, e il sintomo è solo "suona un po' stretto".

const INSTRUMENTS = ['drums', 'bass', 'guitar', 'piano', 'ensemble'];

function sezione(seed = 12345) {
  return {
    id: 'v1', type: 'verse', bars: 8, seed, progression: null,
    instruments: Object.fromEntries(
      INSTRUMENTS.map(i => [i, { active: true, locked: false, seed: 777, characterId: null, params: {} }]),
    ),
  };
}

/** Lo stesso ciclo che Solo Mode applica al blueprint prima di generare. */
function soloBlueprint(bp, inst) {
  for (const [nome, m] of Object.entries(bp.sections[0].modules)) {
    if (m && nome !== inst) m.active = false;
  }
  bp.sections[0].modules[inst].active = true;
  return bp;
}

const bp = (style, solo = null) => {
  const b = buildSectionBlueprint({ key: 'Am', bpm: 90, style }, sezione());
  return solo ? soloBlueprint(b, solo) : b;
};
const noteDi = res => res.events.filter(e => e.cc == null).map(e => e.note);

describe('il blueprint del solo lascia attivo un modulo solo', () => {
  it.each(['piano', 'guitar', 'bass', 'ensemble'])('con %s scelto, gli altri moduli sono spenti', inst => {
    const moduli = bp('unplugged', inst).sections[0].modules;
    expect(moduli[inst].active).toBe(true);
    for (const [nome, m] of Object.entries(moduli)) {
      if (nome !== inst && m) expect(m.active).toBe(false);
    }
  });
});

describe('PianoGenerator — la mano sinistra scende quando il basso non c’è', () => {
  // Il floor della LH passa da C3 (48) a C2 (36) se il modulo bass non è attivo
  // nella sezione: è l'anti-mud verso un basso che, in un pezzo per piano solo,
  // non esiste. Asserzioni relative e non numeriche: O2 potrebbe allargare il
  // registro della sinistra, e questo test non deve diventare un ostacolo.
  it.each(['classical', 'folk', 'cinematic'])('su %s il piano solo arriva più in basso', style => {
    const conBasso = noteDi(generatePiano(bp(style), null, 4242, null));
    const senzaBasso = noteDi(generatePiano(bp(style, 'piano'), null, 4242, null));
    expect(senzaBasso.length).toBeGreaterThan(0);
    expect(Math.min(...senzaBasso)).toBeLessThan(Math.min(...conBasso));
    expect(senzaBasso.filter(n => n < 48).length).toBeGreaterThan(conBasso.filter(n => n < 48).length);
  });

  it('con il basso attivo la sinistra non scende sotto il DO3', () => {
    // È il senso dell'anti-mud: sotto il C3 ci sta il basso, non il piano.
    const note = noteDi(generatePiano(bp('classical'), null, 4242, null));
    const bassi = note.filter(n => n < 48);
    // Prima di O2 qualche nota sotto il C3 restava (finestra di 9 semitoni:
    // clampToRegister non aveva un rappresentante per Sib, Si e Do e le
    // spingeva un'ottava sotto). Con la finestra di un'ottava piena non ne
    // resta nessuna.
    expect(bassi).toEqual([]);
  });
});

describe('PianoGenerator — la finestra della sinistra copre un ottava piena (O2)', () => {
  // O2 di PLAN37, decisione del committente: la mano sinistra deve avere
  // almeno un'ottava. Sotto i 12 semitoni clampToRegister non ha un
  // rappresentante esatto per ogni pitch class e la nota finisce fuori dalla
  // finestra — sempre verso il basso, cioè addosso al basso vero. Il test
  // guarda la conseguenza udibile, non la costante.
  const STILI = ['unplugged', 'folk', 'jazz_ballad', 'neo_soul', 'classical',
                 'pop_rock', 'blues_rock', 'singer_songwriter', 'cinematic',
                 'lo_fi', 'punk', 'garage_rock', 'chiptune'];

  it.each(STILI)('su %s nessuna nota cade sotto il pavimento della sezione', style => {
    for (const seed of [4242, 777]) {
      // Col basso attivo il pavimento è C3 (48), senza basso è C2 (36).
      const conBasso = noteDi(generatePiano(bp(style), null, seed, null));
      expect(conBasso.filter(n => n < 48)).toEqual([]);
      const soloPiano = noteDi(generatePiano(bp(style, 'piano'), null, seed, null));
      expect(soloPiano.filter(n => n < 36)).toEqual([]);
    }
  });
});

describe('PianoGenerator — la sinistra fa una linea quando il basso non c’è (O3)', () => {
  // Con il basso spento la sinistra non ha più nessuno sotto: battere la
  // fondamentale a ogni colpo la lascia un pedale. Ora le note si scelgono con
  // le stesse funzioni del walking bass (importate da BassGenerator, non
  // riscritte). Col basso acceso non cambia niente: sotto c'è già chi la linea
  // la fa, e due linee nello stesso registro sono fango.

  /** Note della mano sinistra (sotto il DO4), in ordine di tick. */
  const sinistra = res => res.events
    .filter(e => e.cc == null && e.note < 60)
    .sort((a, b) => a.tick - b.tick || a.note - b.note);

  const distinte = note => new Set(note.map(e => e.note)).size;

  it.each(['classical', 'folk', 'jazz_ballad', 'cinematic'])('su %s la sinistra sola tocca più note', style => {
    const conBasso   = sinistra(generatePiano(bp(style), null, 4242, null));
    const senzaBasso = sinistra(generatePiano(bp(style, 'piano'), null, 4242, null));
    expect(senzaBasso.length).toBeGreaterThan(0);
    // È la differenza fra una linea e un pedale: la stessa sezione, gli stessi
    // accordi, ma la sinistra non ribatte più la fondamentale.
    expect(distinte(senzaBasso)).toBeGreaterThan(distinte(conBasso));
  });

  it('sulla linea il bicordo root+quinta diventa una nota sola', () => {
    // Due note tenute insieme sono un accordo, non un passo. Il ruolo
    // 'root+fifth' vive nel pattern LH 'comping', che tocca a energia bassa.
    const perTick = solo => {
      const b = bp('jazz_ballad', solo);
      b.sections[0].energy = 2;
      b.sections[0].modules.piano.style = 'comping';
      const m = new Map();
      for (const e of sinistra(generatePiano(b, null, 4242, null))) {
        m.set(e.tick, (m.get(e.tick) ?? 0) + 1);
      }
      return [...m.values()];
    };
    expect(perTick(null).filter(n => n >= 2).length).toBeGreaterThan(0);
    expect(perTick('piano').every(n => n === 1)).toBe(true);
  });

  it('la linea non inventa note: restano dell’accordo o della scala', () => {
    const b = bp('classical', 'piano');
    const regioni = b.sections[0].harmonicMap;
    for (const e of sinistra(generatePiano(b, null, 4242, null))) {
      const r = regioni.find(x => e.tick >= x.start_tick && e.tick < x.end_tick) ?? regioni[0];
      const ammesse = new Set([
        ...(r.chord_tones ?? []).map(n => n % 12),
        ...(r.scale_notes ?? []).map(n => n % 12),
      ]);
      // Le note di approccio cromatico sono l'eccezione prevista: stanno a un
      // semitono dalla fondamentale del prossimo accordo.
      const vicine = regioni.map(x => x.rootPc).flatMap(pc => [(pc + 11) % 12, (pc + 1) % 12]);
      expect(ammesse.has(e.note % 12) || vicine.includes(e.note % 12)).toBe(true);
    }
  });
});

describe('GuitarGenerator — lo stagger dei transienti cambia in solo', () => {
  it('su classical la chitarra sola non sfalsa i transienti come col basso', () => {
    const impronta = b => generateGuitar(b, null, 4242, null)
      .events.filter(e => e.cc == null).map(e => `${e.tick}:${e.note}`).join('|');
    expect(impronta(bp('classical', 'guitar'))).not.toBe(impronta(bp('classical')));
  });
});
