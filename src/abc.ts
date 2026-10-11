// Parse ABC notation (common subset) into karaoke notes. No dependencies.
// Supported: X/T/M/L/Q/K headers, notes with octave marks and accidentals,
// rests, chords (top note kept), bar lines, key-signature accidentals with
// bar-scoped explicit overrides, simple w: lyric lines.
// Not supported: multiple voices (first voice only), broken rhythm > <,
// tuplets, decorations, mid-tune meter changes, modes beyond major/minor.
import type { KaraokeSongNote } from './types';

export interface ParsedAbc {
  title: string;
  bpm: number; // quarter-note bpm
  duration: number; // seconds
  notes: KaraokeSongNote[];
}

const STEP_BASE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

// Normalized key name -> fifths.
const KEY_FIFTHS: Record<string, number> = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7,
  F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7,
  Am: 0, Em: 1, Bm: 2, 'F#m': 3, 'C#m': 4, 'G#m': 5, 'D#m': 6, 'A#m': 7,
  Dm: -1, Gm: -2, Cm: -3, Fm: -4, Bbm: -5, Ebm: -6, Abm: -7,
};

function keyToFifths(key: string): number {
  const k = key.trim();
  const m = /^([A-Ga-g])([#b♯♭]*)\s*(m|min|maj|major)?$/i.exec(k);
  if (!m) return 0;
  const tonic = m[1].toUpperCase() + m[2].replace(/♯/g, '#').replace(/♭/g, 'b');
  const minor = /^(m|min)$/i.test(m[3] ?? '');
  const name = tonic + (minor ? 'm' : '');
  return KEY_FIFTHS[name] ?? KEY_FIFTHS[tonic] ?? 0;
}

function fifthsToAccidentals(fifths: number): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < Math.min(7, fifths); i++) map.set(SHARP_ORDER[i], 1);
  for (let i = 0; i < Math.min(7, -fifths); i++) map.set(FLAT_ORDER[i], -1);
  return map;
}

function parseFraction(s: string): number {
  // "1/4", "3/2", "120" (bpm, not a fraction but tolerated)
  const parts = s.trim().split('/');
  if (parts.length === 1) return parseFloat(parts[0]);
  const n = parseFloat(parts[0]);
  const d = parseFloat(parts[1]);
  return d !== 0 ? n / d : NaN;
}

interface Header {
  title: string;
  meterNum: number;
  meterDen: number;
  unit: number; // unit note length as fraction of a whole note
  tempoUnit: number; // note value the Q bpm applies to, as fraction of whole
  tempoBpm: number;
  key: string;
}

function defaultHeader(): Header {
  return { title: '', meterNum: 4, meterDen: 4, unit: 1 / 8, tempoUnit: 1 / 4, tempoBpm: 120, key: 'C' };
}

/** Pure function: ABC text -> parsed tune. */
export function parseAbcText(text: string): ParsedAbc {
  const lines = text.split(/\r?\n/);
  const header = defaultHeader();
  const bodyLines: string[] = [];
  const lyricLines: string[] = [];
  let inHeader = true;
  let firstVoice: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%')) continue;
    const field = /^([A-Za-z]):(.*)$/.exec(line);
    if (inHeader && field) {
      const key = field[1].toUpperCase();
      const val = field[2].trim();
      switch (key) {
        case 'T':
          if (!header.title) header.title = val;
          break;
        case 'M': {
          if (/^C$/i.test(val)) { header.meterNum = 4; header.meterDen = 4; }
          else if (/^C\|$/i.test(val)) { header.meterNum = 2; header.meterDen = 2; }
          else {
            const f = parseFraction(val);
            if (!isNaN(f)) { header.meterNum = parseFloat(val.split('/')[0]); header.meterDen = parseFloat(val.split('/')[1]) || 4; }
          }
          break;
        }
        case 'L': {
          const f = parseFraction(val);
          if (!isNaN(f) && f > 0) header.unit = f;
          break;
        }
        case 'Q': {
          const eq = val.indexOf('=');
          if (eq >= 0) {
            const unitPart = val.slice(0, eq).trim();
            const bpmPart = parseFloat(val.slice(eq + 1));
            const f = parseFraction(unitPart);
            if (!isNaN(f) && f > 0 && bpmPart > 0) { header.tempoUnit = f; header.tempoBpm = bpmPart; }
          } else {
            const bpmPart = parseFloat(val);
            if (bpmPart > 0) { header.tempoUnit = header.unit; header.tempoBpm = bpmPart; }
          }
          break;
        }
        case 'K':
          header.key = val.split(/\s+/)[0];
          inHeader = false; // K ends the header; body follows
          break;
        case 'V': {
          // Multiple voices: keep the first voice only.
          const idMatch = /^(\S+)/.exec(val);
          if (firstVoice === null && idMatch) firstVoice = idMatch[1];
          break;
        }
        default:
          break; // ignore other header fields
      }
      continue;
    }
    if (field && field[1].toLowerCase() === 'w') {
      lyricLines.push(field[2].trim());
      continue;
    }
    if (field && field[1].toUpperCase() === 'V') {
      // inline voice switch mid-tune; only the first voice is kept
      const idMatch = /^(\S+)/.exec(field[2].trim());
      if (firstVoice !== null && idMatch && idMatch[1] !== firstVoice) continue;
    }
    if (field && /^[A-Za-z]$/.test(field[1]) && field[1].toUpperCase() !== 'W') {
      // Any other field line mid-body ends music collection for simplicity.
      continue;
    }
    inHeader = false;
    // Strip inline voice markers like [V:2]
    const cleaned = line.replace(/\[V:[^\]]+\]/g, '');
    bodyLines.push(cleaned);
  }

  const keyAcc = fifthsToAccidentals(keyToFifths(header.key));
  const secPerUnit = (60 / header.tempoBpm) * (header.unit / header.tempoUnit);
  const barUnits = (header.meterNum / header.meterDen / header.unit) || (4 / header.unit / 4);

  interface RawNote { start: number; units: number; midi: number }
  const raw: RawNote[] = [];
  let time = 0; // in unit lengths
  let barAcc = new Map<string, number>();
  const music = bodyLines.join(' ').replace(/%.*$/gm, '');

  const noteRe = /(\^{1,2}|_{1,2}|=)?([A-Ga-g])([,']*)(\d*)\s*(\/*)(\d*)|([zZ])(\d*)|(\[([^\]]+)\])(\d*)\s*(\/*)(\d*)|(\|+|:?\|\||\|:|\]:)/y;
  let i = 0;
  const parseLen = (num: string, slashes: string, den: string): number => {
    let mult = num ? parseInt(num, 10) : 1;
    if (slashes) {
      const d = den ? parseInt(den, 10) : Math.pow(2, slashes.length);
      mult = mult / d;
    }
    return mult;
  };

  while (i < music.length) {
    const ch = music[i];
    if (/\s/.test(ch) || ch === '>' || ch === '<' || ch === '-' || ch === '(' || ch === ')') { i++; continue; }
    if (ch === '|') {
      barAcc = new Map(); // accidentals reset at the bar line
      while (i < music.length && music[i] === '|') i++;
      if (music[i] === ':' || music[i] === ']') i++;
      continue;
    }
    noteRe.lastIndex = i;
    const m = noteRe.exec(music);
    if (!m || m.index !== i) { i++; continue; }
    i = noteRe.lastIndex;

    if (m[14]) {
      // bar line matched by regex
      barAcc = new Map();
      continue;
    }
    if (m[7]) {
      // rest; Z = whole-bar rest
      const n = m[8] ? parseInt(m[8], 10) : 1;
      const units = m[7] === 'Z' ? n * barUnits : n;
      time += units;
      continue;
    }
    if (m[9]) {
      // chord: keep the top note so the guide stays singable (mirrors midi.ts)
      // groups: m[9]=[..] m[10]=inner m[11]=num m[12]=slashes m[13]=den
      const inner = m[10];
      const innerRe = /(\^{1,2}|_{1,2}|=)?([A-Ga-g])([,']*)/g;
      let best: number | null = null;
      let im: RegExpExecArray | null;
      while ((im = innerRe.exec(inner)) !== null) {
        const letter = im[2].toUpperCase();
        const acc = im[1] === undefined ? 0 : im[1].startsWith('^') ? im[1].length : im[1].startsWith('_') ? -im[1].length : 0;
        const oct = im[2] === im[2].toUpperCase() ? 4 : 5;
        const octShift = (im[3].match(/'/g) || []).length - (im[3].match(/,/g) || []).length;
        const midi = (oct + octShift + 1) * 12 + (STEP_BASE[letter] ?? 0) + acc;
        if (best === null || midi > best) best = midi;
      }
      const units = parseLen(m[11] ?? '', m[12] ?? '', m[13] ?? '');
      if (best !== null) {
        raw.push({ start: time, units, midi: Math.max(0, Math.min(127, best)) });
        // Explicit chord accidentals persist for the rest of the bar.
        const innerRe2 = /(\^{1,2}|_{1,2}|=)?([A-Ga-g])/g;
        let cm: RegExpExecArray | null;
        while ((cm = innerRe2.exec(inner)) !== null) {
          if (cm[1] !== undefined) {
            barAcc.set(cm[2].toUpperCase(), cm[1].startsWith('^') ? cm[1].length : cm[1].startsWith('_') ? -cm[1].length : 0);
          }
        }
      }
      time += units;
      continue;
    }
    // single note
    const accStr = m[1];
    const letter = m[2].toUpperCase();
    const octaveMarks = m[3] ?? '';
    const units = parseLen(m[4] ?? '', m[5] ?? '', m[6] ?? '');

    let acc: number;
    if (accStr !== undefined) {
      acc = accStr.startsWith('^') ? accStr.length : accStr.startsWith('_') ? -accStr.length : 0;
      barAcc.set(letter, acc);
    } else {
      acc = barAcc.has(letter) ? barAcc.get(letter)! : (keyAcc.get(letter) ?? 0);
    }
    const baseOct = m[2] === m[2].toUpperCase() ? 4 : 5; // C = middle C
    const octShift = (octaveMarks.match(/'/g) || []).length - (octaveMarks.match(/,/g) || []).length;
    const midi = (baseOct + octShift + 1) * 12 + (STEP_BASE[letter] ?? 0) + acc;
    raw.push({ start: time, units, midi: Math.max(0, Math.min(127, midi)) });
    time += units;
  }

  // Map w: lyric lines onto notes in order.
  const lyricFor = new Map<number, string>();
  {
    const tokens: string[] = [];
    for (const wl of lyricLines) tokens.push(...wl.split(/\s+/).filter(Boolean));
    let ni = 0;
    for (const tok of tokens) {
      if (tok === '*') { ni++; continue; }
      if (tok === '|') continue;
      const pieces = tok.split(/[-~]/).filter(Boolean);
      for (const p of pieces) {
        if (ni < raw.length) lyricFor.set(ni, p);
        ni++;
      }
    }
  }

  const notes: KaraokeSongNote[] = raw
    .filter((n) => n.units * secPerUnit > 0.03)
    .map((n, idx) => ({
      midi: n.midi,
      start: n.start * secPerUnit,
      duration: n.units * secPerUnit,
      lyric: lyricFor.get(idx) ?? '',
    }));

  const duration = notes.length > 0 ? Math.max(...notes.map((n) => n.start + n.duration)) : 0;
  return {
    title: header.title || 'ABC Tune',
    bpm: Math.round(header.tempoBpm * (header.tempoUnit / (1 / 4))),
    duration,
    notes,
  };
}

export function abcTitleFromText(text: string): string {
  const m = /^T:\s*(.+)$/m.exec(text);
  return m ? m[1].trim() : 'ABC Tune';
}
