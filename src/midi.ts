// Parse a user-uploaded Standard MIDI File into karaoke notes.
// Uses @tonejs/midi (handles tempo maps, so note times come out in seconds).
import { Midi } from '@tonejs/midi';
import type { KaraokeSongNote } from './types';

export interface MidiTrackInfo {
  index: number;
  name: string;
  noteCount: number;
  isDrum: boolean;
}

export interface ParsedMidi {
  tracks: MidiTrackInfo[];
  duration: number;
  suggestedTrack: number;
  getNotes(trackIndex: number): KaraokeSongNote[];
}

export async function parseMidiFile(file: File): Promise<ParsedMidi> {
  const buf = await file.arrayBuffer();
  const midi = new Midi(buf);

  const tracks: MidiTrackInfo[] = midi.tracks.map((t, i) => ({
    index: i,
    name: t.name || (t.instrument?.name ? String(t.instrument.name) : `Track ${i + 1}`),
    noteCount: t.notes.length,
    isDrum: (t as unknown as { channel?: number }).channel === 9,
  }));

  const withNotes = tracks.filter((t) => t.noteCount > 0);
  const melodic = withNotes.filter((t) => !t.isDrum);
  const pool = melodic.length > 0 ? melodic : withNotes;
  const suggestedTrack = pool.length > 0 ? pool.reduce((a, b) => (b.noteCount > a.noteCount ? b : a)).index : 0;

  const getNotes = (trackIndex: number): KaraokeSongNote[] => {
    const raw = [...midi.tracks[trackIndex].notes]
      .filter((n) => n.duration > 0.03 && n.midi >= 0 && n.midi <= 127)
      .sort((a, b) => a.time - b.time || b.midi - a.midi);

    // Reduce chords to the top note so the guide stays singable.
    const out: KaraokeSongNote[] = [];
    for (const n of raw) {
      const last = out[out.length - 1];
      if (last && n.time < last.start + last.duration - 0.03) {
        if (n.midi > last.midi) {
          out[out.length - 1] = { midi: Math.round(n.midi), start: n.time, duration: n.duration, lyric: '' };
        }
        continue;
      }
      out.push({ midi: Math.round(n.midi), start: n.time, duration: n.duration, lyric: '' });
    }
    return out;
  };

  return { tracks, duration: midi.duration, suggestedTrack, getNotes };
}

export function songTitleFromFile(name: string): string {
  return name.replace(/\.(mid|midi)$/i, '').replace(/[_-]+/g, ' ').trim() || 'My Song';
}
