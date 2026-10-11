import { describe, it, expect } from 'vitest';
import { parseAbcText, abcTitleFromText } from './abc';

describe('parseAbcText', () => {
  it('parses notes, octaves, and key signature accidentals', () => {
    const abc = `X:1
T:Key Test
M:3/4
L:1/4
Q:120
K:D
F2 A2 | =F2 A2 |
`;
    const p = parseAbcText(abc);
    expect(p.title).toBe('Key Test');
    expect(p.bpm).toBe(120);
    expect(p.notes).toHaveLength(4);
    // K:D -> F# and C#. L:1/4 at 120bpm -> 0.5s per unit.
    expect(p.notes[0].midi).toBe(66); // F#
    expect(p.notes[0].duration).toBeCloseTo(1.0, 6);
    expect(p.notes[1].midi).toBe(69); // A
    expect(p.notes[2].midi).toBe(65); // explicit natural resets the sharp
    expect(p.notes[3].midi).toBe(69);
    expect(p.notes[2].start).toBeCloseTo(2.0, 6);
  });

  it('maps lowercase to the higher octave and handles octave marks', () => {
    const abc = `X:1
T:Octaves
M:4/4
L:1/8
K:C
C c C, c' |
`;
    const p = parseAbcText(abc);
    expect(p.notes.map((n) => n.midi)).toEqual([60, 72, 48, 84]);
  });

  it('keeps the top note of chords and advances past rests', () => {
    const abc = `X:2
T:Chord Test
M:4/4
L:1/8
Q:1/4=90
K:C
[CEG]2 z2 |
`;
    const p = parseAbcText(abc);
    expect(p.notes).toHaveLength(1);
    expect(p.notes[0].midi).toBe(67); // G, top of C-E-G
    // 90bpm quarter -> eighth unit = 1/3s; chord is 2 units
    expect(p.notes[0].duration).toBeCloseTo(2 / 3, 6);
  });

  it('maps w: lyric lines onto notes in order', () => {
    const abc = `X:3
T:Lyrics
M:4/4
L:1/8
Q:1/4=120
K:G
G2 AB c2 | d4 |
w: Hel-lo world how
`;
    const p = parseAbcText(abc);
    // Bar 1: G(2u) A(1u) B(1u) c(2u) = 4 notes; bar 2: d(4u) = 1 note
    expect(p.notes).toHaveLength(5);
    expect(p.notes.map((n) => n.lyric)).toEqual(['Hel', 'lo', 'world', 'how', '']);
  });

  it('applies bar-scoped explicit accidentals', () => {
    const abc = `X:4
T:Bar Accidentals
M:4/4
L:1/4
K:C
^F F | F F |
`;
    const p = parseAbcText(abc);
    expect(p.notes.map((n) => n.midi)).toEqual([66, 66, 65, 65]);
  });

  it('throws nothing useful on empty input, returns no notes', () => {
    const p = parseAbcText('X:9\nT:Empty\nK:C\n');
    expect(p.notes).toHaveLength(0);
    expect(p.duration).toBe(0);
  });
});

describe('abcTitleFromText', () => {
  it('reads the T: header', () => {
    expect(abcTitleFromText('X:1\nT:My Tune\nK:C\n')).toBe('My Tune');
    expect(abcTitleFromText('X:1\nK:C\n')).toBe('ABC Tune');
  });
});
