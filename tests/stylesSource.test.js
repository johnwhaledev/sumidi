import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { STYLES } from '../src/Styles.js';
import { SONG_FORMS } from '../src/SongArchitect.js';
import { SESSION_FORMS } from '../src/SessionManager.js';

// B3 di PLAN37 — Styles.js è la fonte delle verità musicali per stile (forma di
// default, range di BPM, umanizzazione). Erano copiate a mano in sei punti di
// SongEngine.js, e tre di quelle copie erano già divergenti: nessuno se ne era
// accorto perché niente le confrontava. Ora le copie non ci sono più, e questi
// test tengono il posto: la nota di metodo di PLAN37 dice che le tabelle sono
// dove il progetto sbaglia e che la suite non le guardava.

const STILI = Object.keys(STYLES);

describe('Styles.js — coerenza interna della fonte', () => {
  it('ci sono i 13 stili attesi', () => {
    expect(STILI).toHaveLength(13);
  });

  it.each(STILI)('%s dichiara tutti i campi che l’interfaccia legge', style => {
    const d = STYLES[style];
    expect(typeof d.label).toBe('string');
    expect(typeof d.defaultForm).toBe('string');
    expect(Array.isArray(d.availableForms)).toBe(true);
    expect(d.availableForms.length).toBeGreaterThan(0);
    expect(typeof d.defaultKey).toBe('string');
    expect(d.defaultBpm).toBeTruthy();
  });

  it.each(STILI)('%s: la forma di default è fra quelle disponibili', style => {
    expect(STYLES[style].availableForms).toContain(STYLES[style].defaultForm);
  });

  it.each(STILI)('%s: tutte le forme dichiarate esistono davvero', style => {
    for (const f of STYLES[style].availableForms) {
      expect(SONG_FORMS[f], `forma "${f}" dichiarata da ${style} ma assente da SONG_FORMS`).toBeTruthy();
    }
  });

  it.each(STILI)('%s: min ≤ preferred ≤ max, e sono BPM plausibili', style => {
    const { min, max, preferred } = STYLES[style].defaultBpm;
    expect(min).toBeLessThanOrEqual(preferred);
    expect(preferred).toBeLessThanOrEqual(max);
    expect(min).toBeGreaterThanOrEqual(30);
    expect(max).toBeLessThanOrEqual(300);
  });

  it.each(STILI)('%s: umanizzazione fra 0 e 1', style => {
    const h = STYLES[style].humanize ?? 0.35;
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(1);
  });
});

describe('gli slider BPM sanno esprimere i range dichiarati dagli stili', () => {
  // smRandomAll e randomAll pescano ora da STYLES.defaultBpm, ma scrivono il
  // risultato in un <input type="range">: se il range dello stile esce dai
  // limiti dello slider, il browser tronca in silenzio e l'etichetta mostra un
  // numero diverso da quello davvero usato. È successo davvero: punk dichiara
  // 160-190 e la composer bar si fermava a 180, mentre lo slider di lab.html si
  // fermava a 130 e troncava anche chiptune e garage_rock.
  // Questo test legge i limiti dall'HTML vero: è il confronto fra la fonte e la
  // sua unica copia rimasta, quella che vive nel markup.
  const limitiSlider = (file, id) => {
    const html = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const tag = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`, 's'));
    expect(tag, `input #${id} non trovato in ${file}`).toBeTruthy();
    return {
      min: Number(tag[0].match(/min="(\d+)"/)[1]),
      max: Number(tag[0].match(/max="(\d+)"/)[1]),
    };
  };

  it.each([['index.html', 'sm-bpm'], ['lab.html', 'p-bpm']])(
    'lo slider di %s copre tutti i 13 stili',
    (file, id) => {
      const { min, max } = limitiSlider(file, id);
      for (const style of STILI) {
        const d = STYLES[style].defaultBpm;
        expect(d.min, `${style} parte da ${d.min}, sotto il minimo ${min} dello slider`).toBeGreaterThanOrEqual(min);
        expect(d.max, `${style} arriva a ${d.max}, sopra il massimo ${max} dello slider`).toBeLessThanOrEqual(max);
      }
    },
  );
});

describe('SESSION_FORMS — copia parziale, sorvegliata', () => {
  // Session Mode costruisce ogni sezione con la forma indicata qui. La mappa è
  // ferma a quando gli stili erano 8: i 5 aggiunti dopo cadono nel fallback
  // 'unplugged_ballad' e prendono la curva dinamica di una ballad. Correggerlo
  // cambia la musica generata, quindi è una decisione d'ascolto (PLAN37, B6).
  // Questi due test non sanano la divergenza: impediscono che cresca.

  it('per gli stili che elenca, coincide con STYLES.defaultForm', () => {
    for (const [style, form] of Object.entries(SESSION_FORMS)) {
      expect(STYLES[style], `SESSION_FORMS elenca "${style}", che non esiste in STYLES`).toBeTruthy();
      expect(form).toBe(STYLES[style].defaultForm);
    }
  });

  it('gli stili non coperti sono esattamente i 5 noti', () => {
    const scoperti = STILI.filter(s => !SESSION_FORMS[s]).sort();
    expect(scoperti).toEqual(['chiptune', 'cinematic', 'garage_rock', 'lo_fi', 'punk']);
  });

  it('ogni forma usata da Session Mode contiene tutti i tipi di sezione', () => {
    // È il criterio dichiarato nel commento sopra la mappa, ed è anche la
    // ragione per cui la correzione è sicura sul piano strutturale: tutte e 13
    // le forme di default lo soddisfano.
    const TIPI = ['intro', 'verse', 'chorus', 'bridge', 'outro'];
    for (const style of STILI) {
      const form = SONG_FORMS[STYLES[style].defaultForm];
      const sezioni = Array.isArray(form) ? form : (form?.sections ?? []);
      const tipi = new Set(sezioni.map(x => (typeof x === 'string' ? x : x.type)));
      for (const t of TIPI) {
        expect(tipi.has(t), `${STYLES[style].defaultForm} non ha una sezione "${t}"`).toBe(true);
      }
    }
  });
});
