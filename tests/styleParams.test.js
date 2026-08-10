import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { STYLES } from '../src/Styles.js';
import { SONG_FORMS } from '../src/SongForms.js';
import { buildSong } from '../src/SongArchitect.js';

// PLAN36 B2 — Session Mode espone solo tonalità, BPM e stile: forma, ensemble e
// umanizzazione vengono derivati da Styles.js e scritti nei controlli nascosti
// del pannello classic, che restano l'input di gen(). Se un valore di Styles.js
// non esiste fra le option del select, `select.value = ...` lo azzera in
// silenzio e il brano esce con la struttura di un altro genere: è esattamente
// il bug che ha prodotto brani jazz da 60 battute con forma da ballad.

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function optionDelSelect(id) {
  const inizio = html.indexOf(`id="${id}"`);
  const fine = html.indexOf('</select>', inizio);
  return [...html.slice(inizio, fine).matchAll(/value="([^"]*)"/g)].map(m => m[1]);
}

describe('Parametri per stile — coerenza fra Styles.js e i controlli di gen()', () => {
  const forms = optionDelSelect('p-form');
  const ensembles = optionDelSelect('p-ens');

  for (const [stile, def] of Object.entries(STYLES)) {
    it(`"${stile}": defaultForm ed ensemble sono selezionabili`, () => {
      expect(forms, `forma "${def.defaultForm}" assente dal select p-form`).toContain(def.defaultForm);
      expect(ensembles, `ensemble "${def.ensemble?.type}" assente dal select p-ens`).toContain(def.ensemble?.type);
    });
  }

  it('ogni defaultForm è definita anche in SongForms.js', () => {
    for (const [stile, def] of Object.entries(STYLES)) {
      expect(SONG_FORMS[def.defaultForm], `forma "${def.defaultForm}" (${stile}) non definita`).toBeDefined();
    }
  });

  it('i parametri derivati producono la struttura dello stile, non quella di default', () => {
    const struttura = bp => bp.sections.map(s => `${s.type[0]}${s.bars}`).join('-');
    for (const [stile, def] of Object.entries(STYLES)) {
      const atteso = buildSong({ style: stile, seed: 4242 });
      const derivato = buildSong({
        style: stile,
        seed: 4242,
        form: def.defaultForm,
        ensemble: def.ensemble?.type,
      });
      expect(struttura(derivato), `struttura divergente per ${stile}`).toBe(struttura(atteso));
    }
  });

  it('una forma vuota non deve imporre la struttura di un altro genere', () => {
    // Regressione diretta: gen() passa `p-form.value || undefined`, mai ''.
    const conForma = buildSong({ style: 'cinematic', seed: 5, form: 'cinematic_standard' });
    const senzaForma = buildSong({ style: 'cinematic', seed: 5, form: undefined });
    const struttura = bp => bp.sections.map(s => `${s.type[0]}${s.bars}`).join('-');
    expect(struttura(senzaForma)).toBe(struttura(conForma));
  });
});
