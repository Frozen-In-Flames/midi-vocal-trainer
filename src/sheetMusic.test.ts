// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseMusicXmlText, songTitleFromSheetFile } from './sheetMusic';

const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <movement-title>Test Song</movement-title>
  <part-list>
    <score-part id="P1"><part-name>Voice</part-name></score-part>
    <score-part id="P2"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>2</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <direction><sound tempo="100"/></direction>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>4</duration><type>quarter</type>
        <lyric><syllabic>begin</syllabic><text>Hel</text></lyric>
        <tie type="start"/><notations><tied type="start"/></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>4</duration><type>quarter</type>
        <tie type="stop"/><notations><tied type="stop"/></notations>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>8</duration><type>half</type>
        <lyric><syllabic>single</syllabic><text>day</text></lyric>
      </note>
      <note>
        <chord/>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>8</duration><type>half</type>
      </note>
    </measure>
    <measure number="2">
      <attributes><key><fifths>1</fifths></key></attributes>
      <note>
        <pitch><step>B</step><octave>4</octave></pitch>
        <duration>16</duration><type>whole</type>
      </note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>2</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>D</step><octave>3</octave></pitch>
        <duration>16</duration><type>whole</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

describe('parseMusicXmlText', () => {
  it('lists parts, title, and tempo', () => {
    const p = parseMusicXmlText(FIXTURE, 'test.musicxml');
    expect(p.title).toBe('Test Song');
    expect(p.bpm).toBe(100);
    expect(p.parts.map((x) => x.name)).toEqual(['Voice', 'Piano']);
    expect(p.parts.find((x) => x.id === 'P1')?.noteCount).toBe(3);
    expect(p.suggestedPart).toBe('P1'); // most notes wins
  });

  it('merges tied notes, keeps chord top note, survives key change', () => {
    const p = parseMusicXmlText(FIXTURE, 'test.musicxml');
    const notes = p.getNotes('P1');
    expect(notes).toHaveLength(3);
    // Tied D4 quarters -> one half note at 100bpm (quarter = 0.6s)
    expect(notes[0].midi).toBe(62);
    expect(notes[0].start).toBeCloseTo(0, 6);
    expect(notes[0].duration).toBeCloseTo(1.2, 6);
    expect(notes[0].lyric).toBe('Hel-');
    // E4 + chord G4 -> top note G4 keeps the lyric
    expect(notes[1].midi).toBe(67);
    expect(notes[1].start).toBeCloseTo(1.2, 6);
    expect(notes[1].lyric).toBe('day');
    // After the key change to G major, absolute pitch still parses
    expect(notes[2].midi).toBe(71);
    expect(notes[2].start).toBeCloseTo(2.4, 6);
    expect(notes[2].duration).toBeCloseTo(2.4, 6);
  });

  it('parses the second part independently', () => {
    const p = parseMusicXmlText(FIXTURE, 'test.musicxml');
    const notes = p.getNotes('P2');
    expect(notes).toHaveLength(1);
    expect(notes[0].midi).toBe(50); // D3
    expect(notes[0].duration).toBeCloseTo(2.4, 6);
  });

  it('rejects invalid XML and non-partwise scores', () => {
    expect(() => parseMusicXmlText('not xml at all', 'x.musicxml')).toThrow();
    expect(() => parseMusicXmlText('<score-timewise></score-timewise>', 'x.musicxml')).toThrow(
      /score-partwise/,
    );
  });

  it('rejects a file with no notes', () => {
    const empty = `<?xml version="1.0"?><score-partwise><part id="P1"><measure number="1"></measure></part></score-partwise>`;
    expect(() => parseMusicXmlText(empty, 'x.musicxml')).toThrow(/No notes/);
  });
});

describe('songTitleFromSheetFile', () => {
  it('strips extensions and cleans separators', () => {
    expect(songTitleFromSheetFile('my-song_v2.musicxml')).toBe('my song v2');
    expect(songTitleFromSheetFile('NoExt')).toBe('NoExt');
  });
});
