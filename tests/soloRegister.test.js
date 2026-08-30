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
    // Qualche nota sotto il C3 resta (ornamenti, ottave), ma sono l'eccezione.
    expect(bassi.length / note.length).toBeLessThan(0.1);
  });
});

describe('GuitarGenerator — lo stagger dei transienti cambia in solo', () => {
  it('su classical la chitarra sola non sfalsa i transienti come col basso', () => {
    const impronta = b => generateGuitar(b, null, 4242, null)
      .events.filter(e => e.cc == null).map(e => `${e.tick}:${e.note}`).join('|');
    expect(impronta(bp('classical', 'guitar'))).not.toBe(impronta(bp('classical')));
  });
});
