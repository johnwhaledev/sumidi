/**
 * TabRenderer.js
 * ─────────────────────────────────────────────────────────────────
 * Converts MIDI note events into SVG guitar/bass tablature.
 *
 * Supports:
 *   guitar — 6 strings, standard tuning (E A D G B e)
 *   bass   — 4 strings, standard tuning (E A D G)
 *
 * Output: SVG string — insert directly into DOM innerHTML.
 * ─────────────────────────────────────────────────────────────────
 */

// ── Instrument tunings (MIDI note per open string, low→high) ─────
const TUNINGS = {
  guitar: [40, 45, 50, 55, 59, 64],  // E2 A2 D3 G3 B3 E4
  bass:   [28, 33, 38, 43],           // E1 A1 D2 G2
};

const STRING_LABELS = {
  guitar: ['e','B','G','D','A','E'],  // high→low for display
  bass:   ['G','D','A','E'],
};

// ── Map MIDI note → { string (0=lowest), fret } ──────────────────
function noteToTab(midiNote, instrument) {
  const openStrings = TUNINGS[instrument];
  const candidates = [];

  for (let s = 0; s < openStrings.length; s++) {
    const fret = midiNote - openStrings[s];
    if (fret >= 0 && fret <= 24) {
      // Score: prefer lower frets, prefer middle strings
      const midString = (openStrings.length - 1) / 2;
      const score = fret + Math.abs(s - midString) * 0.5;
      candidates.push({ string: s, fret, score });
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0];
}

// ── Convert events array → tab positions ─────────────────────────
function eventsToTabPositions(events, ppq, instrument, barTicks = ppq * 4) {
  const s16         = ppq / 4;
  const stepsPerBar = Math.round(barTicks / s16);
  const positions   = [];

  for (const e of events) {
    // Only note_on events (skip CC, note_off)
    if (e.note == null || e.velocity <= 0) continue;

    const tab = noteToTab(e.note, instrument);
    if (!tab) continue;

    const bar     = Math.floor(e.tick / barTicks);
    const beat16  = Math.round((e.tick % barTicks) / s16);

    positions.push({
      tick:   e.tick,
      bar,
      beat16: Math.min(beat16, stepsPerBar - 1),
      string: tab.string,
      fret:   tab.fret,
      velocity: e.velocity,
    });
  }

  // Deduplicate same tick+string (keep lowest fret)
  const seen = new Map();
  const deduped = [];
  for (const p of positions) {
    const key = `${p.bar}_${p.beat16}_${p.string}`;
    if (!seen.has(key) || seen.get(key).fret > p.fret) {
      seen.set(key, p);
    }
  }
  seen.forEach(v => deduped.push(v));
  deduped.sort((a, b) => a.tick - b.tick);
  return deduped;
}

// ── SVG Layout constants ──────────────────────────────────────────
const LAYOUT = {
  barsPerRow:   4,
  barW:         220,    // px per bar
  leftMargin:   36,     // px for string labels
  rightMargin:  16,
  stringSpacing:14,     // px between strings
  topPad:       20,     // px above first string
  bottomPad:    24,     // px below last string (for bar numbers)
  rowGap:       36,     // px between rows
  fontSize:     11,     // fret number font size
  barLineColor: '#444466',
  stringColor:  '#555577',
  sectionColors: {
    intro:  '#1a2a3a',
    verse:  '#1a2e22',
    chorus: '#2e2510',
    bridge: '#221430',
    outro:  '#1e1e1e',
  },
  sectionTextColors: {
    intro:  '#9CDCFE',
    verse:  '#4EC9B0',
    chorus: '#DCDCAA',
    bridge: '#C586C0',
    outro:  '#888',
  },
};

/**
 * Render full tablature as SVG string.
 *
 * @param {Array}  tabPositions  Output of eventsToTabPositions()
 * @param {Array}  sections      SongBlueprint.sections
 * @param {number} ppq
 * @param {string} instrument    'guitar' | 'bass'
 * @param {string} title         Display title
 * @returns {string}  SVG markup
 */
export function renderTabSVG(tabPositions, sections, ppq, instrument, title = '') {
  const numStrings = TUNINGS[instrument].length;
  const labels     = STRING_LABELS[instrument];

  const rowH = LAYOUT.topPad
             + (numStrings - 1) * LAYOUT.stringSpacing
             + LAYOUT.bottomPad;

  const rowW = LAYOUT.leftMargin
             + LAYOUT.barsPerRow * LAYOUT.barW
             + LAYOUT.rightMargin;

  // Total bars from sections
  const totalBars = sections.reduce((s, sec) => s + sec.bars, 0);
  const numRows   = Math.ceil(totalBars / LAYOUT.barsPerRow);
  const svgH      = numRows * (rowH + LAYOUT.rowGap) + 40;

  // Build section bar-range map for shading
  const sectionByBar = new Map();
  for (const sec of sections) {
    for (let b = 0; b < sec.bars; b++) {
      sectionByBar.set(sec.startBar + b, sec);
    }
  }

  let svg = `<svg xmlns="http://www.w3.org/2000/svg"
    width="${rowW}" height="${svgH}"
    style="background:#0f0f1a;font-family:monospace;display:block">`;

  // Title
  if (title) {
    svg += `<text x="${rowW/2}" y="22" text-anchor="middle"
      fill="#26A69A" font-size="13" font-weight="bold">${esc(title)}</text>`;
  }

  // One row per barsPerRow bars
  for (let row = 0; row < numRows; row++) {
    const rowStartBar = row * LAYOUT.barsPerRow;
    const ry = (title ? 36 : 8) + row * (rowH + LAYOUT.rowGap);

    // ── Section shading behind bars ─────────────────────────
    for (let bi = 0; bi < LAYOUT.barsPerRow; bi++) {
      const bar = rowStartBar + bi;
      if (bar >= totalBars) break;
      const sec  = sectionByBar.get(bar);
      if (!sec) continue;
      const fill = LAYOUT.sectionColors[sec.type] ?? '#1a1a1a';
      const x    = LAYOUT.leftMargin + bi * LAYOUT.barW;
      svg += `<rect x="${x}" y="${ry}" width="${LAYOUT.barW}" height="${rowH - LAYOUT.bottomPad + 6}"
        fill="${fill}" rx="2"/>`;
    }

    // ── String lines ─────────────────────────────────────────
    const lineW = LAYOUT.barsPerRow * LAYOUT.barW;
    for (let si = 0; si < numStrings; si++) {
      const y = ry + LAYOUT.topPad + si * LAYOUT.stringSpacing;
      // String label (display: high string at top)
      const labelIdx = numStrings - 1 - si;  // flip for display
      svg += `<text x="${LAYOUT.leftMargin - 4}" y="${y + 4}"
        text-anchor="end" fill="#8888AA" font-size="10">${labels[labelIdx]}</text>`;
      // Line
      svg += `<line x1="${LAYOUT.leftMargin}" y1="${y}"
        x2="${LAYOUT.leftMargin + lineW}" y2="${y}"
        stroke="${LAYOUT.stringColor}" stroke-width="0.8"/>`;
    }

    // ── Bar lines + numbers ───────────────────────────────────
    for (let bi = 0; bi <= LAYOUT.barsPerRow; bi++) {
      const bar = rowStartBar + bi;
      const x   = LAYOUT.leftMargin + bi * LAYOUT.barW;
      const yTop = ry + LAYOUT.topPad;
      const yBot = ry + LAYOUT.topPad + (numStrings - 1) * LAYOUT.stringSpacing;

      svg += `<line x1="${x}" y1="${yTop}" x2="${x}" y2="${yBot}"
        stroke="${LAYOUT.barLineColor}" stroke-width="${bi === 0 ? 1.5 : 0.8}"/>`;

      if (bi < LAYOUT.barsPerRow && bar < totalBars) {
        // Bar number
        svg += `<text x="${x + 4}" y="${ry + rowH - 4}"
          fill="#555577" font-size="9">${bar + 1}</text>`;

        // Section label on first bar of section
        const sec = sectionByBar.get(bar);
        const prevSec = bar > 0 ? sectionByBar.get(bar - 1) : null;
        if (sec && (!prevSec || prevSec.type !== sec.type || sec.index !== prevSec?.index)) {
          const tc = LAYOUT.sectionTextColors[sec.type] ?? '#aaa';
          const label = sec.type + (sec.index > 0 ? ` ${sec.index + 1}` : '');
          svg += `<text x="${x + 3}" y="${ry + 13}"
            fill="${tc}" font-size="9" font-weight="bold">${label.toUpperCase()}</text>`;
        }
      }
    }

    // ── Fret numbers ─────────────────────────────────────────
    const rowPositions = tabPositions.filter(
      p => p.bar >= rowStartBar && p.bar < rowStartBar + LAYOUT.barsPerRow
    );

    for (const pos of rowPositions) {
      if (pos.bar >= totalBars) continue;

      const barOffset = pos.bar - rowStartBar;
      const s16W      = LAYOUT.barW / 16;
      const x         = LAYOUT.leftMargin + barOffset * LAYOUT.barW + pos.beat16 * s16W + 2;

      // Display string index: flip (string 0=lowest E → bottom of tab)
      const displayString = numStrings - 1 - pos.string;
      const y = ry + LAYOUT.topPad + displayString * LAYOUT.stringSpacing + 4;

      // Color by velocity (louder = brighter)
      const intensity = Math.round(100 + (pos.velocity / 127) * 100);
      const color     = `hsl(174,60%,${Math.min(75, Math.max(35, intensity * 0.4))}%)`;

      // Background rect for readability
      const fretStr = String(pos.fret);
      const tw = fretStr.length * 6.5 + 2;
      svg += `<rect x="${x - 2}" y="${y - 10}" width="${tw}" height="12"
        fill="#0f0f1a" rx="1"/>`;

      svg += `<text x="${x}" y="${y}"
        fill="${color}" font-size="${LAYOUT.fontSize}" font-weight="600">${fretStr}</text>`;
    }
  }

  svg += `</svg>`;
  return svg;
}

/**
 * Render a compact chord/rhythm chart for piano/ensemble.
 * Shows chord names per bar with section coloring.
 */
export function renderChordChart(sections, totalBars) {
  const barsPerRow = 8;
  const barW  = 110;
  const rowH  = 48;
  const rowW  = barsPerRow * barW + 8;
  const numRows = Math.ceil(totalBars / barsPerRow);
  const svgH  = numRows * (rowH + 12) + 32;

  // Build bar→chord map
  const chordByBar = new Map();
  for (const sec of sections) {
    for (let b = 0; b < sec.bars; b++) {
      const absBar = sec.startBar + b;
      chordByBar.set(absBar, {
        chord: sec.progression[b % sec.progression.length],
        type:  sec.type,
        index: sec.index,
        isFirst: b === 0,
      });
    }
  }

  let svg = `<svg xmlns="http://www.w3.org/2000/svg"
    width="${rowW}" height="${svgH}"
    style="background:#0f0f1a;font-family:sans-serif;display:block">`;

  svg += `<text x="4" y="16" fill="#26A69A" font-size="11" font-weight="bold">CHORD CHART</text>`;

  for (let row = 0; row < numRows; row++) {
    const ry = 24 + row * (rowH + 12);
    for (let bi = 0; bi < barsPerRow; bi++) {
      const bar = row * barsPerRow + bi;
      if (bar >= totalBars) break;
      const info = chordByBar.get(bar);
      if (!info) continue;

      const x    = 4 + bi * barW;
      const fill = LAYOUT.sectionColors[info.type] ?? '#1a1a1a';
      const tc   = LAYOUT.sectionTextColors[info.type] ?? '#aaa';

      svg += `<rect x="${x}" y="${ry}" width="${barW - 3}" height="${rowH}"
        fill="${fill}" rx="4" stroke="#33335a" stroke-width="0.5"/>`;

      // Bar number
      svg += `<text x="${x + 4}" y="${ry + 11}"
        fill="#444466" font-size="8">${bar + 1}</text>`;

      // Section label on section start
      if (info.isFirst) {
        const label = info.type + (info.index > 0 ? ` ${info.index+1}` : '');
        svg += `<text x="${x + barW/2}" y="${ry + 11}"
          text-anchor="middle" fill="${tc}" font-size="8" font-weight="bold">${label.toUpperCase()}</text>`;
      }

      // Chord name — centered, large
      svg += `<text x="${x + barW/2}" y="${ry + 32}"
        text-anchor="middle" fill="#E0E0E0" font-size="15" font-weight="bold">${esc(info.chord)}</text>`;
    }
  }

  svg += `</svg>`;
  return svg;
}

// ── Public API ────────────────────────────────────────────────────
export function buildGuitarTab(events, sections, ppq, barTicks = ppq * 4) {
  const positions = eventsToTabPositions(events, ppq, 'guitar', barTicks);
  return renderTabSVG(positions, sections, ppq, 'guitar', 'GUITAR TAB');
}

export function buildBassTab(events, sections, ppq, barTicks = ppq * 4) {
  const positions = eventsToTabPositions(events, ppq, 'bass', barTicks);
  return renderTabSVG(positions, sections, ppq, 'bass', 'BASS TAB');
}

// ── Helpers ───────────────────────────────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
