import { describe, it, expect } from 'vitest';
import { renderChordChart, buildGuitarTab, buildBassTab } from '../src/TabRenderer.js';
import { exportMarkdown } from '../src/MarkdownExporter.js';
import { buildSong } from '../src/SongArchitect.js';

// T1 di PLAN37 — TabRenderer.js (347 righe) e MarkdownExporter.js (241) erano
// due dei dieci moduli senza test. Sono i due modi in cui suMidi mostra il
// brano a chi lo deve suonare: se sbagliano, sbagliano in silenzio, perché
// nessun errore JS accompagna una griglia disallineata.

const BRANO = buildSong({ style: 'folk', key: 'Am', bpm: 90, seed: 4242 });

/** Una sezione finta con la progressione che si vuole mettere alla prova. */
function sezione(progression, bars = 4) {
  return [{ type: 'verse', index: 0, bars, startBar: 0, progression }];
}

describe('TabRenderer — chord chart (T1)', () => {
  it('produce un SVG chiuso, con una cella per battuta', () => {
    const svg = renderChordChart(BRANO.sections, BRANO.meta.totalBars);

    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    // Ogni battuta ha il suo rettangolo, più nessuno di troppo.
    expect((svg.match(/<rect /g) ?? []).length).toBe(BRANO.meta.totalBars);
  });

  it('scrive il nome dell’accordo, non la coppia [nome, durata] (regressione d9763f9)', () => {
    // Formato misto delle progressioni: 'Am' vale una battuta, ['Am7', 2] due.
    // Trattare la coppia come stringa stampava "Am7,2" nella griglia.
    const svg = renderChordChart(sezione([['Am7', 2], 'F', 'G']), 4);

    expect(svg).toContain('>Am7<');
    expect(svg).not.toContain('Am7,2');
  });

  it('una battuta con due accordi li mostra entrambi (A1)', () => {
    const svg = renderChordChart(sezione([['Dm7', 0.5], ['G7', 0.5], 'C'], 2), 2);

    expect(svg).toContain('Dm7');
    expect(svg).toContain('G7');
  });

  it('numera le battute dalla prima, non da zero', () => {
    const svg = renderChordChart(sezione(['Am', 'F', 'G', 'C']), 4);

    expect(svg).toContain('>1<');
    expect(svg).toContain('>4<');
    expect(svg).not.toContain('>5<');
  });
});

describe('TabRenderer — tablatura (T1)', () => {
  it('mette la corda vuota al tasto 0 e non inventa tasti negativi', () => {
    // MI basso a vuoto: 40 sulla chitarra, 28 sul basso.
    const svgG = buildGuitarTab([{ tick: 0, note: 40, velocity: 90, duration: 240 }], sezione(['Am'], 1), 480);
    const svgB = buildBassTab([{ tick: 0, note: 28, velocity: 90, duration: 240 }], sezione(['Am'], 1), 480);

    for (const svg of [svgG, svgB]) {
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('>0<');
      expect(svg).not.toMatch(/>-\d+</);
    }
  });

  it('regge una traccia vuota senza rompersi', () => {
    expect(() => buildGuitarTab([], BRANO.sections, BRANO.meta.ppq)).not.toThrow();
    expect(() => buildBassTab([], BRANO.sections, BRANO.meta.ppq)).not.toThrow();
  });
});

describe('MarkdownExporter (T1)', () => {
  const md = exportMarkdown(BRANO, [], []);

  it('intesta il documento con stile e tonalità del brano', () => {
    expect(md).toContain('# suMidi');
    expect(md).toContain('folk');
    expect(md).toContain('Am');
  });

  it('la tabella Structure elenca tutte le sezioni del brano', () => {
    const righe = md.split('\n').filter(r => r.startsWith('| ') && !r.startsWith('| Section') && !r.startsWith('|---'));

    expect(righe.length).toBeGreaterThanOrEqual(BRANO.sections.length);
    for (const sec of BRANO.sections) {
      expect(md, `manca la sezione ${sec.type}`).toContain(sec.type);
    }
  });

  it('senza eventi non stampa una tablatura vuota', () => {
    expect(md).not.toContain('Guitar Tab');
    expect(md).not.toContain('Bass Tab');
  });

  it('con gli eventi la tablatura e il CRD compaiono', () => {
    const eventi = [
      { tick: 0,   note: 40, velocity: 90, duration: 240 },
      { tick: 480, note: 45, velocity: 90, duration: 240 },
    ];
    const conTab = exportMarkdown(BRANO, eventi, eventi);

    expect(conTab).toContain('Guitar Tab');
    expect(conTab).toContain('Bass Tab');
    expect(conTab).toContain('CRD Format');
  });
});
