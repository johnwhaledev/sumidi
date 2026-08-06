/**
 * MarkdownExporter.js
 * ─────────────────────────────────────────────────────────────────
 * Esporta la struttura canzone, tablature e accordi in formato Markdown.
 * Utile per sessioni di studio, condivisione e archivio.
 */

// ── Tuning strings (note per corda a vuoto, dalla più bassa) ─────
const TUNINGS = {
  guitar: ['E', 'A', 'D', 'G', 'B', 'e'],  // E2 A2 D3 G3 B3 E4
  bass:   ['E', 'A', 'D', 'G'],             // E1 A1 D2 G2
};

// ── Map MIDI note → { string (0=lowest), fret } ─────────────────
function noteToTab(midiNote, instrument) {
  const openStrings = instrument === 'guitar'
    ? [40, 45, 50, 55, 59, 64]   // E2 A2 D3 G3 B3 E4
    : [28, 33, 38, 43];           // E1 A1 D2 G2

  const candidates = [];
  for (let s = 0; s < openStrings.length; s++) {
    const fret = midiNote - openStrings[s];
    if (fret >= 0 && fret <= 24) {
      // Prefer lower frets, prefer middle strings
      const midString = (openStrings.length - 1) / 2;
      const score = fret + Math.abs(s - midString) * 0.5;
      candidates.push({ string: s, fret, score });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0];
}

// ── Convert events → tab positions per bar ───────────────────────
function eventsToTabPositions(events, ppq, instrument, barTicks = ppq * 4) {
  const positions = [];
  for (const e of events) {
    if (e.note == null || e.velocity <= 0) continue;
    const tab = noteToTab(e.note, instrument);
    if (!tab) continue;
    const bar = Math.floor(e.tick / barTicks);
    const beat = Math.floor((e.tick % barTicks) / (ppq / 4)); // 16th note position
    positions.push({ bar, beat: Math.min(beat, 15), string: tab.string, fret: tab.fret });
  }
  // Deduplicate: keep only first note per bar/beat/string
  const seen = new Set();
  const deduped = [];
  for (const p of positions) {
    const key = `${p.bar}_${p.beat}_${p.string}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(p);
    }
  }
  deduped.sort((a, b) => a.bar - b.bar || a.beat - b.beat);
  return deduped;
}

// ── Build ASCII tab for a range of bars ──────────────────────────
function buildAsciiTab(positions, instrument, startBar, endBar) {
  const strings = TUNINGS[instrument];
  const numStrings = strings.length;
  const lines = Array(numStrings).fill('');

  // Group positions by bar
  const byBar = new Map();
  for (const p of positions) {
    if (p.bar < startBar || p.bar > endBar) continue;
    if (!byBar.has(p.bar)) byBar.set(p.bar, []);
    byBar.get(p.bar).push(p);
  }

  // Build each bar
  for (let bar = startBar; bar <= endBar; bar++) {
    const barPos = byBar.get(bar) || [];
    // 16 positions per bar
    const barLines = Array(numStrings).fill('');
    for (let i = 0; i < 16; i++) {
      const atPos = barPos.filter(p => p.beat === i);
      for (let s = 0; s < numStrings; s++) {
        const pos = atPos.find(p => p.string === s);
        if (pos) {
          barLines[s] += pos.fret < 10 ? '-' + pos.fret : String(pos.fret);
        } else {
          barLines[s] += '--';
        }
      }
    }
    // Add to main lines with bar separator
    for (let s = 0; s < numStrings; s++) {
      lines[s] += barLines[s] + '|';
    }
  }

  // Format with string names
  const result = [];
  for (let s = numStrings - 1; s >= 0; s--) { // High to low for display
    const label = strings[s].padStart(2, ' ');
    result.push(`${label}|${lines[s]}`);
  }
  return result.join('\n');
}

// ── Build chord progression text ─────────────────────────────────
function buildChordProgression(sections) {
  const lines = [];
  for (const sec of sections) {
    const chords = sec.progression.join(' | ');
    lines.push(`### ${sec.type}${sec.index > 0 ? ` ${sec.index + 1}` : ''} (${sec.bars} bars)`);
    lines.push(`\`${chords}\``);
    lines.push('');
  }
  return lines.join('\n');
}

// ── Build structure table ───────────────────────────────────────
function buildStructureTable(sections, bpm, beatsPerBar = 4) {
  const rows = [];
  let currentBar = 0;
  for (const sec of sections) {
    const startTime = (currentBar * beatsPerBar / bpm) * 60;
    const endTime = ((currentBar + sec.bars) * beatsPerBar / bpm) * 60;
    const formatTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    rows.push(`| ${sec.type}${sec.index > 0 ? ` ${sec.index + 1}` : ''} | ${sec.bars} | ${formatTime(startTime)} | ${formatTime(endTime)} | ${sec.progression.slice(0, 4).join(' ')}${sec.progression.length > 4 ? ' …' : ''} |`);
    currentBar += sec.bars;
  }
  return `| Section | Bars | Start | End | Chords |
|---------|------|-------|-----|--------|
${rows.join('\n')}`;
}

// ═══════════════════════════════════════════════════════════════════
export function exportMarkdown(bp, guitarEvents, bassEvents) {
  const { meta, sections } = bp;
  const beatsPerBar = meta.beatsPerBar ?? 4;
  const duration = (meta.totalBars * beatsPerBar / meta.bpm) * 60;
  const formatDur = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // Build tab positions
  const guitarPos = guitarEvents?.length
    ? eventsToTabPositions(guitarEvents, meta.ppq, 'guitar', meta.barTicks)
    : [];
  const bassPos = bassEvents?.length
    ? eventsToTabPositions(bassEvents, meta.ppq, 'bass', meta.barTicks)
    : [];

  // Build guitar tab (max 4 bars per section for readability)
  let guitarTabMd = '';
  if (guitarPos.length) {
    const chunks = [];
    for (let i = 0; i < meta.totalBars; i += 4) {
      const end = Math.min(i + 3, meta.totalBars - 1);
      const tab = buildAsciiTab(guitarPos, 'guitar', i, end);
      const sec = sections.find(s => s.startBar <= i && s.startBar + s.bars > i);
      const label = sec ? `${sec.type}${sec.index > 0 ? ` ${sec.index + 1}` : ''} (bars ${i + 1}-${end + 1})` : `Bars ${i + 1}-${end + 1}`;
      chunks.push(`#### ${label}\n\`\`\`\n${tab}\n\`\`\``);
    }
    guitarTabMd = `## 🎸 Guitar Tab\n\n${chunks.join('\n\n')}`;
  }

  // Build bass tab
  let bassTabMd = '';
  if (bassPos.length) {
    const chunks = [];
    for (let i = 0; i < meta.totalBars; i += 4) {
      const end = Math.min(i + 3, meta.totalBars - 1);
      const tab = buildAsciiTab(bassPos, 'bass', i, end);
      const sec = sections.find(s => s.startBar <= i && s.startBar + s.bars > i);
      const label = sec ? `${sec.type}${sec.index > 0 ? ` ${sec.index + 1}` : ''} (bars ${i + 1}-${end + 1})` : `Bars ${i + 1}-${end + 1}`;
      chunks.push(`#### ${label}\n\`\`\`\n${tab}\n\`\`\``);
    }
    bassTabMd = `## 🎵 Bass Tab\n\n${chunks.join('\n\n')}`;
  }

  // Build chord chart
  const chordChartMd = `## 🎹 Chord Chart\n\n${buildChordProgression(sections)}`;

  // Build CRD format (chords inline with lyrics placeholder)
  let crdMd = '';
  if (guitarPos.length) {
    const crdLines = [];
    for (const sec of sections) {
      crdLines.push(`[${sec.type.toUpperCase()}${sec.index > 0 ? ` ${sec.index + 1}` : ''}]`);
      for (const chord of sec.progression) {
        crdLines.push(`${chord} ...`);
      }
      crdLines.push('');
    }
    crdMd = `## 📝 CRD Format\n\n\`\`\`\n${crdLines.join('\n')}\n\`\`\``;
  }

  // Assemble full document
  const md = `# suMidi — ${meta.style} in ${meta.key}

## Info
- **Style:** ${meta.style}
- **Key:** ${meta.key}
- **BPM:** ${meta.bpm}
- **Duration:** ${formatDur(duration)}
- **Bars:** ${meta.totalBars}
- **Seed:** ${meta.seed}
- **Ensemble:** ${meta.ensemble.type}

## Structure
${buildStructureTable(sections, meta.bpm, beatsPerBar)}

${chordChartMd}

${guitarTabMd}

${bassTabMd}

${crdMd}

---
*Generated by suMidi v1.8*
`;

  return md;
}

// ── Download helper ──────────────────────────────────────────────
export function downloadMarkdown(filename, content) {
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
