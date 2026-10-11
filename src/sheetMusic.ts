// Parse uncompressed MusicXML (.musicxml / .xml) into karaoke notes.
// Browser-native DOMParser only, no dependencies. Score-partwise only.
// Zipped .mxl is intentionally unsupported (see README).
import type { KaraokeSongNote } from './types';

export interface MusicXmlPartInfo {
  id: string;
  name: string;
  noteCount: number;
}

export interface ParsedSheetMusic {
  parts: MusicXmlPartInfo[];
  title: string;
  bpm: number;
  duration: number;
  suggestedPart: string;
  getNotes(partId: string): KaraokeSongNote[];
}

const STEP_BASE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// Quarter-note type fallback when a <duration> element is missing.
const TYPE_BEATS: Record<string, number> = {
  maxima: 8, longa: 4, breve: 2, whole: 4, half: 2, quarter: 1,
  eighth: 0.5, '16th': 0.25, '32nd': 0.125, '64th': 0.0625,
};

function childText(el: Element, tag: string): string | null {
  for (const c of Array.from(el.children)) {
    if (c.tagName === tag) return c.textContent?.trim() ?? '';
  }
  return null;
}

function hasChild(el: Element, tag: string): boolean {
  return Array.from(el.children).some((c) => c.tagName === tag);
}

function pitchToMidi(step: string, octave: number, alter: number): number {
  const base = STEP_BASE[step.toUpperCase()] ?? 0;
  return (octave + 1) * 12 + base + alter; // C4 (middle C) = 60
}

function lyricSyllable(noteEl: Element): { text: string; syllabic: string } | null {
  for (const c of Array.from(noteEl.children)) {
    if (c.tagName !== 'lyric') continue;
    const text = childText(c, 'text') ?? '';
    if (!text) return null;
    const syllabic = childText(c, 'syllabic') ?? 'single';
    return { text, syllabic };
  }
  return null;
}

function hasTie(noteEl: Element, kind: 'start' | 'stop'): boolean {
  for (const c of Array.from(noteEl.children)) {
    if (c.tagName === 'tie' && c.getAttribute('type') === kind) return true;
    if (c.tagName === 'notations') {
      for (const n of Array.from(c.children)) {
        if (n.tagName === 'tied' && n.getAttribute('type') === kind) return true;
      }
    }
  }
  return false;
}

interface RawNote {
  start: number;
  duration: number;
  midi: number;
  lyric: string;
}

interface BuiltPart {
  info: MusicXmlPartInfo;
  notes: RawNote[];
}

/** Pure function: MusicXML text -> parsed sheet music. Works in node with a DOMParser (jsdom). */
export function parseMusicXmlText(xmlText: string, fileName: string): ParsedSheetMusic {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('That file is not valid XML.');
  const root = doc.documentElement;
  if (root.tagName !== 'score-partwise') {
    throw new Error('Only score-partwise MusicXML is supported.');
  }

  const title =
    childText(root, 'movement-title') ||
    (() => {
      const work = root.querySelector('work > work-title');
      return work?.textContent?.trim() || '';
    })() ||
    songTitleFromSheetFile(fileName);

  const partNames = new Map<string, string>();
  const partList = root.querySelector('part-list');
  if (partList) {
    for (const sp of Array.from(partList.querySelectorAll('score-part'))) {
      const id = sp.getAttribute('id') ?? '';
      const name = sp.querySelector('part-name')?.textContent?.trim() || `Part ${id}`;
      if (id) partNames.set(id, name);
    }
  }

  const built: BuiltPart[] = [];
  let bpm = 0;

  for (const partEl of Array.from(root.querySelectorAll(':scope > part'))) {
    const partId = partEl.getAttribute('id') ?? `P${built.length + 1}`;
    const cursors = new Map<string, number>(); // voice -> time in quarter notes
    let divisions = 1;
    let lastOnset = 0; // onset of the most recent non-chord note/rest, in quarters
    const raw: RawNote[] = [];
    interface OpenTie { start: number; midi: number; lyric: string; quarters: number }
    let openTie: OpenTie | null = null;

    const closeTie = () => {
      if (openTie) {
        raw.push({ start: openTie.start, duration: openTie.quarters, midi: openTie.midi, lyric: openTie.lyric });
        openTie = null;
      }
    };

    for (const measure of Array.from(partEl.children).filter((c) => c.tagName === 'measure')) {
      for (const el of Array.from(measure.children)) {
        if (el.tagName === 'attributes') {
          const div = childText(el, 'divisions');
          if (div) divisions = Math.max(1, parseInt(div, 10) || 1);
          continue;
        }
        if (el.tagName === 'direction') {
          const sound = el.querySelector('sound[tempo]');
          if (sound && bpm === 0) {
            const t = parseFloat(sound.getAttribute('tempo') ?? '');
            if (t > 0) bpm = t;
          }
          const metro = el.querySelector('direction-type > metronome > per-minute');
          if (metro && bpm === 0) {
            const t = parseFloat(metro.textContent ?? '');
            if (t > 0) bpm = t;
          }
          continue;
        }
        if (el.tagName === 'backup' || el.tagName === 'forward') {
          const dur = childText(el, 'duration');
          const q = dur ? parseFloat(dur) / divisions : 0;
          const voice = '1';
          const cur = cursors.get(voice) ?? 0;
          cursors.set(voice, cur + (el.tagName === 'backup' ? -q : q));
          continue;
        }
        if (el.tagName !== 'note') continue;
        if (hasChild(el, 'grace')) continue; // grace notes carry no time

        const voice = childText(el, 'voice') ?? '1';
        const isChord = hasChild(el, 'chord');
        const isRest = hasChild(el, 'rest');
        // A chord tone shares the previous note's onset; the cursor has
        // already been advanced past it, so reuse the last onset.
        const start = isChord ? lastOnset : (cursors.get(voice) ?? 0);
        const durEl = childText(el, 'duration');
        let quarters: number;
        if (durEl) {
          quarters = parseFloat(durEl) / divisions;
        } else {
          const type = childText(el, 'type') ?? 'quarter';
          const dots = Array.from(el.children).filter((c) => c.tagName === 'dot').length;
          quarters = (TYPE_BEATS[type] ?? 1) * (2 - Math.pow(0.5, dots));
        }

        if (!isChord) {
          cursors.set(voice, start + quarters);
          lastOnset = start;
        }

        if (isRest) {
          closeTie();
          continue;
        }

        const pitchEl = Array.from(el.children).find((c) => c.tagName === 'pitch');
        if (!pitchEl) continue; // unpitched percussion etc.
        const step = childText(pitchEl, 'step') ?? 'C';
        const octave = parseInt(childText(pitchEl, 'octave') ?? '4', 10);
        const alter = parseInt(childText(pitchEl, 'alter') ?? '0', 10);
        const midi = Math.max(0, Math.min(127, pitchToMidi(step, octave, alter)));

        const syl = lyricSyllable(el);
        let lyric = '';
        if (syl) {
          lyric = syl.syllabic === 'begin' || syl.syllabic === 'middle' ? syl.text + '-' : syl.text;
        }

        const tieStart = hasTie(el, 'start');
        const tieStop = hasTie(el, 'stop');

        if (isChord) {
          // Chord tone: keep the top note so the guide stays singable (mirrors midi.ts).
          const last = raw[raw.length - 1];
          if (last && Math.abs(last.start - start) < 1e-9 && midi > last.midi) {
            last.midi = midi;
          }
          continue;
        }

        if (tieStop && openTie && openTie.midi === midi) {
          openTie.quarters += quarters;
          if (!tieStart) closeTie();
          else if (lyric && !openTie.lyric) openTie.lyric = lyric;
          continue;
        }
        if (tieStop && openTie) closeTie(); // mismatched tie; fall through as a fresh note

        if (tieStart) {
          openTie = { start, midi, lyric, quarters };
          continue;
        }
        raw.push({ start, duration: quarters, midi, lyric });
      }
    }
    closeTie();

    raw.sort((a, b) => a.start - b.start || b.midi - a.midi);
    built.push({
      info: { id: partId, name: partNames.get(partId) ?? `Part ${partId}`, noteCount: raw.length },
      notes: raw,
    });
  }

  if (built.length === 0) throw new Error('No parts with notes found in that file.');
  const usable = built.filter((b) => b.notes.length > 0);
  if (usable.length === 0) throw new Error('No notes found in that file.');

  const finalBpm = bpm > 0 ? bpm : 120;
  const secPerQuarter = 60 / finalBpm;
  const toNotes = (raw: RawNote[]): KaraokeSongNote[] =>
    raw
      .filter((n) => n.duration * secPerQuarter > 0.03)
      .map((n) => ({
        midi: n.midi,
        start: n.start * secPerQuarter,
        duration: n.duration * secPerQuarter,
        lyric: n.lyric,
      }));

  const suggested = usable.reduce((a, b) => (b.notes.length > a.notes.length ? b : a));
  const duration = Math.max(
    ...usable.map((b) => {
      const last = b.notes[b.notes.length - 1];
      return (last.start + last.duration) * secPerQuarter;
    }),
  );

  const cache = new Map<string, KaraokeSongNote[]>();
  return {
    parts: built.map((b) => b.info),
    title,
    bpm: finalBpm,
    duration,
    suggestedPart: suggested.info.id,
    getNotes: (partId: string) => {
      let hit = cache.get(partId);
      if (!hit) {
        const part = built.find((b) => b.info.id === partId);
        if (!part) throw new Error('Unknown part.');
        hit = toNotes(part.notes);
        cache.set(partId, hit);
      }
      return hit;
    },
  };
}

export async function parseMusicXmlFile(file: File): Promise<ParsedSheetMusic> {
  const text = await file.text();
  return parseMusicXmlText(text, file.name);
}

export function songTitleFromSheetFile(name: string): string {
  return name.replace(/\.(musicxml|xml|mxl)$/i, '').replace(/[_-]+/g, ' ').trim() || 'Sheet Music';
}
