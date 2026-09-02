/**
 * SongEngineLab.js — il pannello Classic e la vetrina di lab.html
 * ─────────────────────────────────────────────────────────
 * D3(c) di PLAN37: questo codice viveva in SongEngine.js, che main.js importa
 * su ogni pagina. Legge però solo elementi `p-*`, `gen-btn`, `status`, `prog` e
 * `lab-output`, che esistono soltanto in lab.html: chiunque aprisse il sito lo
 * scaricava e lo parsava senza poterlo mai eseguire. Ora lo carica solo la
 * pagina che lo usa, con un secondo `<script type="module">`.
 *
 * Da SongEngine.js restano importati i due pezzi condivisi: `gen()`, il motore
 * di generazione a blueprint intero, e `disabled`, l'insieme dei moduli spenti
 * dai bottoni del pannello — è lo stesso insieme che legge `smAutoGenerate`,
 * quindi va condiviso e non duplicato.
 */
import { AppState } from './AppState.js';
import { STYLES } from './Styles.js';
import { buildGuitarTab, buildBassTab, renderChordChart } from './TabRenderer.js';
import { exportMarkdown, downloadMarkdown } from './MarkdownExporter.js';
import { smBumpSupportCounter } from './Session.js';
import { gen, disabled } from './SongEngine.js';

// ── UI helpers ────────────────────────────────────────────────
window.rnd = () => { document.getElementById('p-seed').value = Math.floor(Math.random() * 99998) + 1; };
window.tog = el => { el.classList.toggle('on'); const m = el.dataset.m; el.classList.contains('on') ? disabled.delete(m) : disabled.add(m); };
window.onStyleChange = () => {
  const style = document.getElementById('p-style').value;
  // B3 di PLAN37: forma, BPM e umanizzazione si leggono da Styles.js, che è la
  // fonte. Prima erano tre mappe copiate a mano qui dentro — allineate per caso
  // al momento del controllo, ma tenute in sincronia da nessuno. Le stesse tre
  // verità erano scritte in altri due punti di questo file (randomAll,
  // smRandomAll) e una di quelle copie era già divergente.
  const def = STYLES[style] ?? STYLES['unplugged'];
  const bpm = def.defaultBpm.preferred;
  const hum = Math.round((def.humanize ?? 0.35) * 100);
  document.getElementById('p-form').value = def.defaultForm;
  document.getElementById('p-bpm').value = bpm;
  document.getElementById('bpm-v').textContent = bpm;
  document.getElementById('p-hum').value = hum;
  document.getElementById('hum-v').textContent = hum + '%';
};

window.randomAll = () => {
  // B3 di PLAN37: niente più liste hardcoded qui dentro. Gli stili, le forme e
  // il range di BPM vengono da Styles.js; tonalità ed ensemble dalle option
  // realmente presenti nelle select, che è la regola già adottata da
  // smRandomAll ("mai da liste duplicate hardcoded, per evitare che tornino a
  // disallinearsi"). Prima questa funzione conteneva la terza copia della
  // tabella BPM — divergente dalle altre due su classical (60-80 contro
  // 60-100) — e l'unica copia che elencava folk_short fra le forme di folk,
  // che Styles.js non prevede.
  const r = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo;
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const optionsDi = id => Array.from(document.getElementById(id)?.options ?? []).map(o => o.value);

  const style = pick(Object.keys(STYLES));
  const def = STYLES[style];
  const bpm = r(def.defaultBpm.min, def.defaultBpm.max);

  document.getElementById('p-style').value = style;
  document.getElementById('p-key').value = pick(optionsDi('p-key'));
  document.getElementById('p-bpm').value = bpm;
  document.getElementById('bpm-v').textContent = bpm;
  document.getElementById('p-form').value = pick(def.availableForms ?? [def.defaultForm]);
  document.getElementById('p-ens').value = pick(optionsDi('p-ens'));
  document.getElementById('p-seed').value = r(1, 99998);
  document.getElementById('gen-btn').click();
};

// Legge i controlli del pannello Classic (p-*) e costruisce l'input di
// gen(). Se il seed non è bloccato, ne pesca uno nuovo e lo scrive nel
// campo p-seed (comportamento invariato: prima viveva dentro gen()).
function _readClassicParams() {
  const seedLocked = !!window._seedLocked;
  if (!seedLocked) {
    const newSeed = Math.floor(Math.random() * 99999) + 1;
    document.getElementById('p-seed').value = newSeed;
  }
  const params = {
    style: document.getElementById('p-style').value,
    key: document.getElementById('p-key').value,
    bpm: parseInt(document.getElementById('p-bpm').value),
    // `|| undefined` come per guitarStyle/drumLine sotto: se il select
    // resta vuoto (valore non presente fra le sue option), buildSong deve
    // ricadere sul default dello stile. Passare '' non lo fa: produce una
    // struttura da ballad qualunque sia lo stile.
    form: document.getElementById('p-form').value || undefined,
    ensemble: document.getElementById('p-ens').value || undefined,
    guitarStyle: document.getElementById('p-guitar').value || undefined,
    drumLine: document.getElementById('p-drumline').value || undefined,
    seed: parseInt(document.getElementById('p-seed').value),
  };
  const humAmt = parseInt(document.getElementById('p-hum').value) / 100;
  const isFlat = document.getElementById('p-flat').checked;
  return { params, humAmt, isFlat };
}

document.getElementById('gen-btn')?.addEventListener('click', () => {
  const { params, humAmt, isFlat } = _readClassicParams();
  gen(params, humAmt, disabled, isFlat);
});

// ── Export Markdown ──────────────────────────────────────────────
// Gli eventi sono salvati durante la generazione nelle variabili AppState.preview.guitarEvts e AppState.preview.bassEvts
window.exportMarkdown = () => {
  if (!AppState.preview.lastBP) {
    alert('Genera prima una canzone!');
    return;
  }
  const md = exportMarkdown(AppState.preview.lastBP, AppState.preview.guitarEvts, AppState.preview.bassEvts);
  const fname = `sumidi_${AppState.preview.lastBP.meta.style}_${AppState.preview.lastBP.meta.key}_${AppState.preview.lastBP.meta.bpm}bpm_s${AppState.preview.lastBP.meta.seed}.md`;
  downloadMarkdown(fname, md);
  smBumpSupportCounter('download');
};

// ── Sessione 3 (lab.html) — vetrina per le 8 feature ereditate ────
// Wiring nuovo su codice esistente: buildGuitarTab/buildBassTab/renderChordChart
// sono già importate e già pronte, mancava solo chi le chiamasse.
// Nulla di questo blocco è raggiungibile da index.html: nessun bottone in
// quella pagina punta a queste funzioni.
function _labDownloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

window.labDownloadMidi = () => {
  if (!AppState.preview.lastBlob) { alert('Genera prima una canzone!'); return; }
  _labDownloadBlob(AppState.preview.lastBlob, AppState.preview.lastFilename);
};

window.labRenderGuitarTab = () => {
  const bp = AppState.preview.lastBP;
  if (!bp) { alert('Genera prima una canzone!'); return; }
  document.getElementById('lab-output').innerHTML =
    buildGuitarTab(AppState.preview.guitarEvts ?? [], bp.sections, bp.meta.ppq, bp.meta.barTicks);
};

window.labRenderBassTab = () => {
  const bp = AppState.preview.lastBP;
  if (!bp) { alert('Genera prima una canzone!'); return; }
  document.getElementById('lab-output').innerHTML =
    buildBassTab(AppState.preview.bassEvts ?? [], bp.sections, bp.meta.ppq, bp.meta.barTicks);
};

window.labRenderChordChart = () => {
  const bp = AppState.preview.lastBP;
  if (!bp) { alert('Genera prima una canzone!'); return; }
  document.getElementById('lab-output').innerHTML =
    renderChordChart(bp.sections, bp.meta.totalBars);
};

// Confronto A/B a parità di seed: la feature più prioritaria da giudicare
// (MIDI Flat, tabella priorità PLAN.md) è anche l'unica con un flag binario
// netto — le altre 7 si confrontano già a mano col pannello ora esposto
// (seed fisso, si cambia un parametro alla volta e si rigenera).
window.labCompareFlat = async () => {
  const seedEl = document.getElementById('p-seed');
  const flatEl = document.getElementById('p-flat');
  const btn = document.getElementById('lab-ab-btn');
  const prevLocked = window._seedLocked;
  const prevFlat = flatEl.checked;
  const fixedSeed = seedEl.value;
  btn.disabled = true;
  window._seedLocked = true; // gen() non deve rigenerare il seed fra le due chiamate
  try {
    seedEl.value = fixedSeed;
    flatEl.checked = true; // A = flat ON, nessuna dinamica CC
    { const { params, humAmt, isFlat } = _readClassicParams(); await gen(params, humAmt, disabled, isFlat); }
    _labDownloadBlob(AppState.preview.lastBlob, AppState.preview.lastFilename.replace('.mid', '_flatON.mid'));

    seedEl.value = fixedSeed;
    flatEl.checked = false; // B = flat OFF, dinamica CC7/CC11 scritta
    { const { params, humAmt, isFlat } = _readClassicParams(); await gen(params, humAmt, disabled, isFlat); }
    _labDownloadBlob(AppState.preview.lastBlob, AppState.preview.lastFilename.replace('.mid', '_flatOFF.mid'));
  } finally {
    flatEl.checked = prevFlat;
    window._seedLocked = prevLocked;
    btn.disabled = false;
  }
};

// p-seed-lock non era mai letto da nessuno (dead UI, verificato via grep):
// gen() guarda solo window._seedLocked, impostato altrove dal tasto lucchetto
// di Session Mode. Ricollegato qui perché nel pannello esposto in lab.html
// una checkbox "Lock seed" che non fa nulla confonderebbe chi la usa.
document.getElementById('p-seed-lock')?.addEventListener('change', e => {
  window._seedLocked = e.target.checked;
});
