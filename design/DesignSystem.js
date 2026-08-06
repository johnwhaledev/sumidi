/**
 * DesignSystem.js — suMidi UI Components
 * ─────────────────────────────────────────────────────────────────
 * Componenti SVG per Session Mode.
 * Tutti i controlli sono SVG puro — scalabili, animabili, zero peso.
 * Ispirato all'estetica di img3 (knob grigi professionali).
 *
 * Export:
 *   createKnob(container, opts)      → knob circolare con drag
 *   createSlider(container, opts)    → slider verticale o orizzontale
 *   createPatternDots(container, opts) → 16 dots pattern clickabili
 *   createToggle(container, opts)    → toggle switch on/off
 *   createLevelMeter(container, opts) → LED meter bar (decorativo)
 * ─────────────────────────────────────────────────────────────────
 */

// ── Palette colori design system ─────────────────────────────────
const DS = {
  bg:         '#1e1e1e',
  surface:    '#2a2a2a',
  knob:       '#3a3a3a',
  knobRim:    '#505050',
  knobShadow: '#111111',
  indicator:  '#d0d0d0',
  track:      '#1a1a1a',
  active:     '#26A69A',   // teal suMidi
  activeGlow: 'rgba(38,166,154,0.35)',
  dot:        '#444444',
  dotActive:  '#26A69A',
  dotAccent:  '#FFD54F',   // gold per accenti forti
  text:       '#888888',
  textBright: '#cccccc',
  border:     '#404040',
};

// ── SVG namespace helper ──────────────────────────────────────────
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// ── Utility: angolo → punto su cerchio ───────────────────────────
function polarToXY(cx, cy, r, angleDeg) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// ─────────────────────────────────────────────────────────────────
// KNOB — Manopola circolare con drag
// ─────────────────────────────────────────────────────────────────
/**
 * @param {HTMLElement} container
 * @param {Object} opts
 *   label     string    — etichetta sotto il knob
 *   value     0–1       — valore iniziale
 *   min       number    — valore minimo reale (default 0)
 *   max       number    — valore massimo reale (default 1)
 *   decimals  number    — cifre decimali per display (default 2)
 *   unit      string    — unità display (default '')
 *   size      number    — diametro px (default 56)
 *   onChange  fn(v)     — callback con valore normalizzato 0–1
 */
export function createKnob(container, opts = {}) {
  const {
    label    = '',
    value    = 0.5,
    min      = 0,
    max      = 1,
    decimals = 2,
    unit     = '',
    size     = 56,
    onChange = null,
  } = opts;

  const cx = size / 2, cy = size / 2, r = size / 2 - 4;
  const START_ANG = -135, END_ANG = 135;  // range 270°

  // Contenitore wrapper
  const wrap = document.createElement('div');
  wrap.className = 'ds-knob-wrap';
  wrap.style.cssText = `
    display:inline-flex; flex-direction:column; align-items:center;
    gap:4px; user-select:none;
  `;

  // SVG knob
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.style.cursor = 'ns-resize';
  svg.style.filter = 'drop-shadow(0 2px 4px #0008)';

  // Definizioni: gradiente radiale per effetto 3D
  const defs = svgEl('defs');
  const gId = `kg_${Math.random().toString(36).slice(2,7)}`;
  const grad = svgEl('radialGradient', {
    id: gId, cx: '35%', cy: '30%', r: '65%',
    fx: '35%', fy: '30%',
  });
  grad.appendChild(svgEl('stop', { offset: '0%',   'stop-color': '#555', 'stop-opacity': '1' }));
  grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': '#1a1a1a', 'stop-opacity': '1' }));
  defs.appendChild(grad);
  svg.appendChild(defs);

  // Track arc (sfondo grigio scuro)
  const trackPath = _arcPath(cx, cy, r - 3, START_ANG, END_ANG);
  const track = svgEl('path', {
    d: trackPath,
    fill: 'none',
    stroke: DS.track,
    'stroke-width': '3',
    'stroke-linecap': 'round',
  });
  svg.appendChild(track);

  // Active arc (teal — mostra il valore)
  const arcEl = svgEl('path', {
    fill: 'none',
    stroke: DS.active,
    'stroke-width': '3',
    'stroke-linecap': 'round',
    opacity: '0.9',
  });
  svg.appendChild(arcEl);

  // Corpo knob (cerchio principale)
  svg.appendChild(svgEl('circle', {
    cx, cy, r: r - 5,
    fill: `url(#${gId})`,
    stroke: DS.knobRim,
    'stroke-width': '1',
  }));

  // Indicatore (linea bianca)
  const indEl = svgEl('line', {
    stroke: DS.indicator,
    'stroke-width': '2',
    'stroke-linecap': 'round',
  });
  svg.appendChild(indEl);

  // Label sotto
  const labelEl = document.createElement('div');
  labelEl.style.cssText = `
    font-size:9px; color:${DS.text}; text-transform:uppercase;
    letter-spacing:.8px; text-align:center; line-height:1.2;
  `;
  labelEl.textContent = label;

  // Value display
  const valEl = document.createElement('div');
  valEl.style.cssText = `
    font-size:9px; color:${DS.textBright}; text-align:center;
    font-variant-numeric:tabular-nums; min-width:36px;
  `;

  wrap.appendChild(svg);
  wrap.appendChild(valEl);
  if (label) wrap.appendChild(labelEl);
  container.appendChild(wrap);

  // ── Stato interno ────────────────────────────────────────────
  let _val = Math.max(0, Math.min(1, value));

  function _update(v) {
    _val = Math.max(0, Math.min(1, v));
    const ang = START_ANG + _val * (END_ANG - START_ANG);

    // Active arc
    if (_val > 0.001) {
      arcEl.setAttribute('d', _arcPath(cx, cy, r - 3, START_ANG, ang));
      arcEl.setAttribute('opacity', '0.9');
    } else {
      arcEl.setAttribute('opacity', '0');
    }

    // Indicatore
    const inner = r - 10, outer = r - 5;
    const p1 = polarToXY(cx, cy, inner, ang);
    const p2 = polarToXY(cx, cy, outer, ang);
    indEl.setAttribute('x1', p1.x); indEl.setAttribute('y1', p1.y);
    indEl.setAttribute('x2', p2.x); indEl.setAttribute('y2', p2.y);

    // Value display
    const realVal = min + _val * (max - min);
    valEl.textContent = realVal.toFixed(decimals) + (unit ? ' ' + unit : '');

    onChange?.(_val);
  }

  _update(_val);

  // ── Drag interaction ─────────────────────────────────────────
  let dragStartY = null, dragStartVal = null;

  svg.addEventListener('mousedown', e => {
    e.preventDefault();
    dragStartY   = e.clientY;
    dragStartVal = _val;

    const onMove = e2 => {
      const dy = dragStartY - e2.clientY;  // su = aumenta
      _update(dragStartVal + dy / 150);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  // Touch support
  svg.addEventListener('touchstart', e => {
    e.preventDefault();
    dragStartY   = e.touches[0].clientY;
    dragStartVal = _val;
  }, { passive: false });
  svg.addEventListener('touchmove', e => {
    e.preventDefault();
    const dy = dragStartY - e.touches[0].clientY;
    _update(dragStartVal + dy / 150);
  }, { passive: false });

  // Double-click reset a 0.5
  svg.addEventListener('dblclick', () => _update(0.5));

  return {
    getValue: () => _val,
    setValue: v => _update(v),
    element:  wrap,
  };
}

// Helper: path arco SVG
function _arcPath(cx, cy, r, startAng, endAng) {
  const s = polarToXY(cx, cy, r, startAng);
  const e = polarToXY(cx, cy, r, endAng);
  const large = (endAng - startAng) > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

// ─────────────────────────────────────────────────────────────────
// SLIDER — Verticale o orizzontale
// ─────────────────────────────────────────────────────────────────
/**
 * @param {HTMLElement} container
 * @param {Object} opts
 *   value     0–1
 *   orient    'vertical' | 'horizontal'  (default 'vertical')
 *   length    number  px (default 80)
 *   label     string
 *   onChange  fn(v)
 */
export function createSlider(container, opts = {}) {
  const {
    value    = 0.5,
    orient   = 'vertical',
    length   = 80,
    label    = '',
    onChange = null,
  } = opts;

  const isV   = orient === 'vertical';
  const thick = 6;
  const svgW  = isV ? 24 : length;
  const svgH  = isV ? length : 24;

  const wrap = document.createElement('div');
  wrap.className = 'ds-slider-wrap';
  wrap.style.cssText = `
    display:inline-flex; flex-direction:${isV ? 'column' : 'row'};
    align-items:center; gap:4px; user-select:none;
  `;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', svgW);
  svg.setAttribute('height', svgH);
  svg.style.cursor = isV ? 'ns-resize' : 'ew-resize';
  svg.style.overflow = 'visible';

  // Track
  const trackX1 = isV ? svgW/2 : 6;
  const trackY1 = isV ? 6 : svgH/2;
  const trackX2 = isV ? svgW/2 : svgW - 6;
  const trackY2 = isV ? svgH - 6 : svgH/2;

  svg.appendChild(svgEl('line', {
    x1: trackX1, y1: trackY1, x2: trackX2, y2: trackY2,
    stroke: DS.track, 'stroke-width': thick, 'stroke-linecap': 'round',
  }));

  // Active fill
  const fillEl = svgEl('line', {
    stroke: DS.active, 'stroke-width': thick, 'stroke-linecap': 'round',
    opacity: '0.9',
  });
  svg.appendChild(fillEl);

  // Thumb
  const thumbEl = svgEl('rect', {
    width: isV ? 16 : 8, height: isV ? 8 : 16,
    rx: 3, fill: DS.textBright,
    filter: 'drop-shadow(0 1px 3px #0008)',
  });
  svg.appendChild(thumbEl);

  const labelEl = document.createElement('div');
  labelEl.style.cssText = `font-size:9px;color:${DS.text};text-transform:uppercase;letter-spacing:.6px;`;
  labelEl.textContent = label;
  if (label) wrap.appendChild(labelEl);
  wrap.appendChild(svg);
  container.appendChild(wrap);

  let _val = Math.max(0, Math.min(1, value));

  function _update(v) {
    _val = Math.max(0, Math.min(1, v));
    const range = (isV ? svgH : svgW) - 12;

    if (isV) {
      const y = 6 + (1 - _val) * range;  // invertito: alto = max
      fillEl.setAttribute('x1', svgW/2); fillEl.setAttribute('y1', y);
      fillEl.setAttribute('x2', svgW/2); fillEl.setAttribute('y2', svgH - 6);
      thumbEl.setAttribute('x', svgW/2 - 8);
      thumbEl.setAttribute('y', y - 4);
    } else {
      const x = 6 + _val * range;
      fillEl.setAttribute('x1', 6);      fillEl.setAttribute('y1', svgH/2);
      fillEl.setAttribute('x2', x);      fillEl.setAttribute('y2', svgH/2);
      thumbEl.setAttribute('x', x - 4);
      thumbEl.setAttribute('y', svgH/2 - 8);
    }
    onChange?.(_val);
  }

  _update(_val);

  // Drag
  let dragStart = null, dragStartVal = null;
  svg.addEventListener('mousedown', e => {
    e.preventDefault();
    dragStart    = isV ? e.clientY : e.clientX;
    dragStartVal = _val;
    const range  = (isV ? svgH : svgW) - 12;
    const onMove = e2 => {
      const d = isV ? dragStart - e2.clientY : e2.clientX - dragStart;
      _update(dragStartVal + d / range);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  return { getValue: () => _val, setValue: v => _update(v), element: wrap };
}

// ─────────────────────────────────────────────────────────────────
// PATTERN DOTS — 16 step clickabili (stile Logic)
// ─────────────────────────────────────────────────────────────────
/**
 * @param {HTMLElement} container
 * @param {Object} opts
 *   pattern   bool[16]   — stato iniziale (default tutti off)
 *   accents   bool[16]   — se true, dot è gold (accento forte)
 *   label     string
 *   onChange  fn(pattern: bool[16])
 */
export function createPatternDots(container, opts = {}) {
  const {
    pattern  = Array(16).fill(false),
    accents  = Array(16).fill(false),
    label    = '',
    rows     = 1,           // 1 = singola riga, 2 = kick+snare separati
    onChange = null,
  } = opts;

  const DOT_R = 5, GAP = 14, COLS = 16 / rows;
  const svgW  = COLS * GAP + 4;
  const svgH  = rows  * GAP + 4;

  const wrap = document.createElement('div');
  wrap.className = 'ds-dots-wrap';
  wrap.style.cssText = 'display:inline-flex;flex-direction:column;gap:4px;';

  if (label) {
    const lbl = document.createElement('div');
    lbl.style.cssText = `font-size:9px;color:${DS.text};text-transform:uppercase;letter-spacing:.6px;`;
    lbl.textContent = label;
    wrap.appendChild(lbl);
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', svgW);
  svg.setAttribute('height', svgH);
  svg.style.cursor = 'pointer';

  const _pat = [...pattern];
  const dots = [];

  for (let i = 0; i < 16; i++) {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    const cx  = 6 + col * GAP;
    const cy  = 6 + row * GAP;

    // Beat divider ogni 4 (linea sottile)
    if (col > 0 && col % 4 === 0) {
      svg.appendChild(svgEl('line', {
        x1: cx - GAP/2, y1: 0, x2: cx - GAP/2, y2: svgH,
        stroke: '#333', 'stroke-width': '1', opacity: '0.5',
      }));
    }

    const dot = svgEl('circle', { cx, cy, r: DOT_R, style: 'cursor:pointer' });
    dot.addEventListener('click', () => {
      _pat[i] = !_pat[i];
      _renderDot(dot, _pat[i], accents[i]);
      onChange?.([..._pat]);
    });
    _renderDot(dot, _pat[i], accents[i]);
    svg.appendChild(dot);
    dots.push(dot);
  }

  function _renderDot(dot, on, accent) {
    if (on) {
      dot.setAttribute('fill', accent ? DS.dotAccent : DS.active);
      dot.setAttribute('r', DOT_R + 1);
      dot.setAttribute('filter', `drop-shadow(0 0 3px ${accent ? DS.dotAccent : DS.activeGlow})`);
    } else {
      dot.setAttribute('fill', DS.dot);
      dot.setAttribute('r', DOT_R);
      dot.removeAttribute('filter');
    }
  }

  wrap.appendChild(svg);
  container.appendChild(wrap);

  return {
    getPattern: () => [..._pat],
    setPattern: p => p.forEach((v, i) => {
      _pat[i] = v;
      _renderDot(dots[i], v, accents[i]);
    }),
    element: wrap,
  };
}

// ─────────────────────────────────────────────────────────────────
// TOGGLE — Switch on/off
// ─────────────────────────────────────────────────────────────────
/**
 * @param {HTMLElement} container
 * @param {Object} opts
 *   value     bool       — stato iniziale
 *   label     string
 *   onChange  fn(bool)
 */
export function createToggle(container, opts = {}) {
  const {
    value    = false,
    label    = '',
    onChange = null,
  } = opts;

  const W = 36, H = 20;

  const wrap = document.createElement('div');
  wrap.className = 'ds-toggle-wrap';
  wrap.style.cssText = 'display:inline-flex;align-items:center;gap:8px;cursor:pointer;';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);

  // Track
  const track = svgEl('rect', {
    x: 0, y: 0, width: W, height: H, rx: H/2,
    stroke: DS.border, 'stroke-width': '1',
  });
  svg.appendChild(track);

  // Thumb
  const thumb = svgEl('circle', {
    cy: H/2, r: H/2 - 3,
    filter: 'drop-shadow(0 1px 2px #0006)',
  });
  svg.appendChild(thumb);

  const labelEl = document.createElement('div');
  labelEl.style.cssText = `font-size:10px;color:${DS.text};`;
  labelEl.textContent = label;

  wrap.appendChild(svg);
  if (label) wrap.appendChild(labelEl);
  container.appendChild(wrap);

  let _on = value;

  function _update(v) {
    _on = v;
    track.setAttribute('fill', _on ? DS.active : DS.surface);
    thumb.setAttribute('cx',   _on ? W - H/2 : H/2);
    thumb.setAttribute('fill', _on ? '#fff' : '#888');
    onChange?.(_on);
  }

  _update(_on);
  wrap.addEventListener('click', () => _update(!_on));

  return { getValue: () => _on, setValue: v => _update(v), element: wrap };
}

// ─────────────────────────────────────────────────────────────────
// LEVEL METER — Barra LED decorativa (stile img3)
// ─────────────────────────────────────────────────────────────────
/**
 * @param {HTMLElement} container
 * @param {Object} opts
 *   value     0–1       — livello corrente
 *   width     number    — px (default 120)
 *   height    number    — px (default 10)
 *   segments  number    — numero LED (default 20)
 */
export function createLevelMeter(container, opts = {}) {
  const {
    value    = 0,
    width    = 120,
    height   = 10,
    segments = 20,
  } = opts;

  const segW = (width - segments) / segments;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);

  const segs = [];
  for (let i = 0; i < segments; i++) {
    const x = i * (segW + 1);
    // Colore: verde→giallo→rosso
    const pct = i / segments;
    const fill = pct < 0.6 ? '#2a6' : pct < 0.85 ? '#ca4' : '#c33';
    const seg = svgEl('rect', {
      x, y: 0, width: segW, height,
      rx: 1, fill,
    });
    svg.appendChild(seg);
    segs.push(seg);
  }

  container.appendChild(svg);

  let _val = value;

  function _update(v) {
    _val = Math.max(0, Math.min(1, v));
    const active = Math.round(_val * segments);
    segs.forEach((s, i) => {
      s.setAttribute('opacity', i < active ? '1' : '0.12');
    });
  }

  _update(_val);

  return { getValue: () => _val, setValue: v => _update(v), element: svg };
}
