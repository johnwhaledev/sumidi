import { describe, it, expect } from 'vitest';
import { STYLES } from '../src/Styles.js';
import { SONG_FORMS } from '../src/SongForms.js';
import { buildSong } from '../src/SongArchitect.js';

// PLAN36 B2 — Session Mode deriva forma, ensemble e umanizzazione da
// Styles.js (fonte di verità) e li passa a buildSong() come parametri
// espliciti (T4/B3, smAutoGenerate). Prima li scriveva nei controlli
// nascosti del pannello Classic e gen() li rileggeva da lì — un valore di
// Styles.js assente fra le option del select veniva azzerato in silenzio
// (il bug che ha prodotto brani jazz da 60 battute con forma da ballad, e
// più tardi lo stesso bug su "cinematic"). Smontato il ponte DOM, il rischio
// non esiste più: qui restano solo i controlli su buildSong() stesso.

describe('Parametri per stile — coerenza fra Styles.js e buildSong()', () => {
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
    // Regressione diretta: buildSong() deve ricevere undefined, mai '', quando la forma non è specificata.
    const conForma = buildSong({ style: 'cinematic', seed: 5, form: 'cinematic_standard' });
    const senzaForma = buildSong({ style: 'cinematic', seed: 5, form: undefined });
    const struttura = bp => bp.sections.map(s => `${s.type[0]}${s.bars}`).join('-');
    expect(struttura(senzaForma)).toBe(struttura(conForma));
  });
});
