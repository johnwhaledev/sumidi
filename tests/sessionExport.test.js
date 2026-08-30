import { describe, it, expect } from 'vitest';
import { SessionManager } from '../src/SessionManager.js';
import { buildSessionMidi, buildSoloMidi, writeKeySignature } from '../src/SessionExport.js';
import { MidiWriter } from '../src/MidiWriter.js';

// T1 di PLAN37 — Session.js erano 2.561 righe con zero test, e da lì escono i
// file che l'utente porta in DAW. La scrittura del MIDI è stata estratta in
// SessionExport.js (senza DOM) proprio per poterla collaudare; qui si copre
// quella, più assembleSessionEvents, che è il pezzo di SessionManager che
// monta la timeline e da cui dipendono canali, program change e tempi.

const INSTS = ['drums', 'bass', 'guitar', 'piano', 'ensemble'];

/** Eventi finti per uno strumento lineare, con un program change in testa. */
function eventiFinti(prog, n = 4, nota = 60) {
  return {
    program: prog,
    events: Array.from({ length: n }, (_, i) => ({
      tick: i * 480, note: nota + i, velocity: 90, duration: 240,
    })),
  };
}

/** Eventi finti per l'ensemble: tre voci con canali e programmi propri. */
function ensembleFinto(programs = [48, 49, 50]) {
  return {
    programs,
    channels: [5, 6, 7],
    voiceEvents: programs.map((_, v) => ([
      { tick: 0, note: 60 + v, velocity: 80, duration: 480 },
      { tick: 480, note: 64 + v, velocity: 80, duration: 480 },
    ])),
  };
}

/**
 * Sessione di prova con eventi già in cache su ogni strumento.
 * @param {object} [opts] — { sezioni, ensemble, drumMachine }
 */
function sessionePronta({ sezioni = ['intro', 'verse'], ensemble = true, drumMachine = false } = {}) {
  const mgr = new SessionManager({ key: 'Dm', bpm: 84, style: 'jazz_ballad' });
  for (const [i, tipo] of sezioni.entries()) {
    const sec = mgr.addSection(tipo, { bars: 4, seed: 100 + i });
    // Personaggio e parametri PRIMA della cache: entrambi la invalidano, ed è
    // giusto che lo facciano — cambiare batterista deve far rigenerare.
    if (drumMachine) {
      mgr.setCharacter(sec.id, 'drums', 'dm_trap');
      mgr.setInstrumentParams(sec.id, 'drums', { dmPreset: 'boom_bap' });
    }
    mgr.setCachedEvents(sec.id, 'drums', eventiFinti(0, 4, 36));
    mgr.setCachedEvents(sec.id, 'bass', eventiFinti(33, 4, 40));
    mgr.setCachedEvents(sec.id, 'guitar', eventiFinti(25, 4, 52));
    mgr.setCachedEvents(sec.id, 'piano', eventiFinti(0, 4, 60));
    if (ensemble) mgr.setCachedEvents(sec.id, 'ensemble', ensembleFinto());
    else mgr.setInstrumentActive(sec.id, 'ensemble', false);
  }
  return mgr;
}

/** Cerca un evento meta nei byte del file e ne restituisce i parametri. */
function trovaMeta(bytes, tipo, lunghezza) {
  const trovati = [];
  for (let i = 0; i + 2 + lunghezza < bytes.length; i++) {
    if (bytes[i] === 0xFF && bytes[i + 1] === tipo && bytes[i + 2] === lunghezza) {
      trovati.push(Array.from(bytes.slice(i + 3, i + 3 + lunghezza)));
    }
  }
  return trovati;
}

/** Conta i chunk MTrk. */
function contaTracce(bytes) {
  let n = 0;
  for (let i = 0; i + 3 < bytes.length; i++) {
    if (bytes[i] === 0x4D && bytes[i + 1] === 0x54 && bytes[i + 2] === 0x72 && bytes[i + 3] === 0x6B) n++;
  }
  return n;
}

describe('assembleSessionEvents — montaggio della timeline', () => {
  it('mette ogni strumento sul suo canale', () => {
    const tb = sessionePronta().assembleSessionEvents(480);
    const canaleDi = k => tb[k].find(e => e.type === 'pc')?.ch;
    expect(canaleDi('drums')).toBe(9);
    expect(canaleDi('bass')).toBe(1);
    expect(canaleDi('guitar')).toBe(2);
    expect(canaleDi('piano')).toBe(3);
    expect([tb.e0.ch, tb.e1.ch, tb.e2.ch]).toEqual([5, 6, 7]);
  });

  it('sposta gli eventi della seconda sezione dopo la prima', () => {
    const mgr = sessionePronta({ sezioni: ['intro', 'verse'] });
    const tb = mgr.assembleSessionEvents(480);
    const barTicks = 480 * 4;
    const primaSezioneTicks = 4 * barTicks;   // 4 battute
    const note = tb.piano.filter(e => e.type !== 'pc');
    expect(note).toHaveLength(8);            // 4 per sezione
    expect(note.slice(0, 4).every(e => e.tick < primaSezioneTicks)).toBe(true);
    expect(note.slice(4).every(e => e.tick >= primaSezioneTicks)).toBe(true);
  });

  it('emette il program change solo quando il programma cambia davvero', () => {
    // Stesso programma su entrambe le sezioni: un solo PC in tutto il brano.
    const uguale = sessionePronta({ sezioni: ['intro', 'verse'] });
    expect(uguale.assembleSessionEvents(480).bass.filter(e => e.type === 'pc')).toHaveLength(1);

    // Programma diverso nella seconda sezione: due PC.
    const diverso = sessionePronta({ sezioni: ['intro', 'verse'] });
    const secondaId = diverso.getSections()[1].id;
    diverso.setCachedEvents(secondaId, 'bass', eventiFinti(34, 4, 40));
    expect(diverso.assembleSessionEvents(480).bass.filter(e => e.type === 'pc')).toHaveLength(2);
  });

  it('salta gli strumenti spenti', () => {
    const mgr = sessionePronta();
    for (const sec of mgr.getSections()) mgr.setInstrumentActive(sec.id, 'guitar', false);
    expect(mgr.assembleSessionEvents(480).guitar).toHaveLength(0);
  });

  it('salta gli strumenti attivi ma senza eventi in cache', () => {
    const mgr = new SessionManager({ key: 'Am', bpm: 90, style: 'unplugged' });
    mgr.addSection('verse');
    const tb = mgr.assembleSessionEvents(480);
    for (const k of ['drums', 'bass', 'guitar', 'piano']) expect(tb[k]).toHaveLength(0);
    expect(tb.e0.evts).toHaveLength(0);
  });

  it('divide l’ensemble in tre tracce, una per voce', () => {
    const tb = sessionePronta().assembleSessionEvents(480);
    for (const k of ['e0', 'e1', 'e2']) {
      expect(tb[k].evts.length).toBe(4);          // 2 note x 2 sezioni
      expect(tb[k].progChanges.length).toBe(1);   // stesso programma: un solo PC
    }
  });
});

describe('buildSessionMidi — il file esportato', () => {
  const midi = (mgr, opts) => buildSessionMidi(mgr.getState(), mgr.assembleSessionEvents(480), { ppq: 480, ...opts });

  it('produce un file MIDI valido con una traccia per strumento', () => {
    const bytes = midi(sessionePronta()).toUint8Array();
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x4D, 0x54, 0x68, 0x64]);
    // tempo track + drums, bass, guitar, piano + 3 voci di ensemble = 8
    expect(contaTracce(bytes)).toBe(8);
    expect((bytes[10] << 8) | bytes[11]).toBe(8);
  });

  it('scrive tempo, metro e armatura di chiave (B2)', () => {
    const bytes = midi(sessionePronta()).toUint8Array();
    expect(trovaMeta(bytes, 0x51, 3)).toHaveLength(1);          // set tempo
    expect(trovaMeta(bytes, 0x58, 4)).toHaveLength(1);          // time signature
    const armature = trovaMeta(bytes, 0x59, 2);
    expect(armature).toHaveLength(1);
    expect(armature[0]).toEqual([255, 1]);                       // Dm = 1 bemolle, minore
  });

  it('scrive un marker per sezione', () => {
    const tre = sessionePronta({ sezioni: ['intro', 'verse', 'chorus'] });
    const bytes = midi(tre).toUint8Array();
    let marker = 0;
    for (let i = 0; i + 1 < bytes.length; i++) if (bytes[i] === 0xFF && bytes[i + 1] === 0x06) marker++;
    expect(marker).toBe(3);
  });

  it('senza ensemble scrive quattro tracce piu’ il tempo track', () => {
    const bytes = midi(sessionePronta({ ensemble: false })).toUint8Array();
    expect(contaTracce(bytes)).toBe(5);
  });

  it('l’override del mixer sostituisce il programma e zittisce quelli dinamici', () => {
    const mgr = sessionePronta({ sezioni: ['intro', 'verse'] });
    // Programmi diversi fra le due sezioni: senza override sarebbero due PC.
    mgr.setCachedEvents(mgr.getSections()[1].id, 'bass', eventiFinti(34, 4, 40));
    const contaPc = bytes => {
      let n = 0;
      for (const b of bytes) if ((b & 0xF0) === 0xC0 && (b & 0x0F) === 1) n++;
      return n;
    };
    const senza = contaPc(midi(mgr).toUint8Array());
    const con = contaPc(midi(mgr, { mixerOverride: { bass: '33' } }).toUint8Array());
    expect(senza).toBeGreaterThan(con);
    expect(con).toBe(1);   // solo quello forzato, in testa
  });

  it('la traccia batteria prende il nome della drum machine quando ce n’e’ una', () => {
    const testo = b => new TextDecoder().decode(b);
    expect(testo(midi(sessionePronta()).toUint8Array())).toContain('Drums');
    const dm = testo(midi(sessionePronta({ drumMachine: true })).toUint8Array());
    expect(dm).toContain('Drum Machine (boom_bap)');
  });

  it('una sessione senza sezioni produce comunque un file leggibile', () => {
    const vuota = new SessionManager({ key: 'C', bpm: 100, style: 'pop_rock' });
    const bytes = midi(vuota).toUint8Array();
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x4D, 0x54, 0x68, 0x64]);
    expect(contaTracce(bytes)).toBe(1);   // solo il tempo track
  });
});

describe('buildSoloMidi — il brano per uno strumento solo', () => {
  const sezioni = [{ label: 'Intro', bars: 4 }, { label: 'Verse', bars: 8 }];
  const traccia = (channel, program) => ({
    channel, program,
    events: [
      { tick: 0, note: 48, velocity: 90, duration: 480 },
      { tick: 480, cc: 64, value: 127 },
      { tick: 960, note: 55, velocity: 85, duration: 480 },
    ],
  });
  const stato = { key: 'F#', bpm: 120, style: 'classical', sections: sezioni };

  it('una traccia sola prende l’etichetta senza numero', () => {
    const bytes = buildSoloMidi(stato, sezioni, [traccia(3, 0)], { ppq: 480, etichetta: 'Piano' }).toUint8Array();
    const testo = new TextDecoder().decode(bytes);
    expect(testo).toContain('Piano');
    expect(testo).not.toContain('Piano 1');
    expect(contaTracce(bytes)).toBe(2);
  });

  it('piu’ tracce vengono numerate', () => {
    const tre = [traccia(5, 48), traccia(6, 49), traccia(7, 50)];
    const testo = new TextDecoder().decode(buildSoloMidi(stato, sezioni, tre, { ppq: 480, etichetta: 'Ensemble' }).toUint8Array());
    for (const n of [1, 2, 3]) expect(testo).toContain(`Ensemble ${n}`);
  });

  it('scrive l’armatura di chiave anche nel solo (B2 / O7)', () => {
    const bytes = buildSoloMidi(stato, sezioni, [traccia(3, 0)], { ppq: 480 }).toUint8Array();
    const armature = trovaMeta(bytes, 0x59, 2);
    expect(armature).toHaveLength(1);
    expect(armature[0]).toEqual([6, 0]);   // F# maggiore = 6 diesis
  });

  it('scrive un marker per sezione', () => {
    const bytes = buildSoloMidi(stato, sezioni, [traccia(3, 0)], { ppq: 480 }).toUint8Array();
    let marker = 0;
    for (let i = 0; i + 1 < bytes.length; i++) if (bytes[i] === 0xFF && bytes[i + 1] === 0x06) marker++;
    expect(marker).toBe(2);
  });
});

describe('writeKeySignature', () => {
  it('è la stessa armatura in entrambi i percorsi di export', () => {
    const armaturaDi = keyStr => {
      const w = new MidiWriter(480);
      w.setTempo(100);
      writeKeySignature(w, keyStr);
      w.addTrack('t');
      return trovaMeta(w.toUint8Array(), 0x59, 2)[0];
    };
    expect(armaturaDi('C')).toEqual([0, 0]);
    expect(armaturaDi('Am')).toEqual([0, 1]);
    expect(armaturaDi('Eb')).toEqual([253, 0]);   // -3 in complemento a due
  });
});

describe('gli strumenti coperti sono quelli che il modello dichiara', () => {
  it('INSTRUMENTS non è cambiato sotto i test', () => {
    const mgr = sessionePronta();
    expect(Object.keys(mgr.getSections()[0].instruments).sort()).toEqual([...INSTS].sort());
  });
});
