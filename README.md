# MIDI Vocal Trainer

A live MIDI auto-tune and vocal doubler. The auto-tune is the core: sing into
the mic (or use the demo voice) and the engine snaps your voice to the target
notes in real time, while your natural voice runs underneath as a stereo
doubler. The tuned output is production-usable, so this is a learning tool and
a production tool in one: learn with it, produce with it.

## Practice your own songs

- **Upload MIDI** (.mid): pick the melody track, then add lyrics per section in the
  song editor. Chords are reduced to the top note so the guide stays singable.
- **Upload vocal audio** (WAV / M4A / MP3): the app extracts your vocal melody into
  MIDI notes with on-device pitch tracking, and can draft the lyrics with on-device
  Whisper transcription. Works best on solo vocal recordings, not mixed songs.
- **Sheet music**: no MIDI and no recording? A MusicXML file (.musicxml / .xml)
  becomes the pitch guide. Multi-part scores get a part picker (mirroring the MIDI
  track picker), lyrics come along when the file has them, tied notes are merged,
  and chords reduce to the top note. You can also paste ABC notation straight in
  (key/meter headers, note letters, rests, chords, w: lyric lines). This is what
  makes it a real learning tool for singers: practice against the written melody
  with pitch guidance and scoring, even when you have nothing recorded.
- **Song editor**: lyrics auto-split into sections on musical gaps, word-by-word
  mapping onto notes, plus full manual note editing (pitch, timing, lyrics, add,
  delete, transpose) for when transcription glitches.
- **Library**: songs save in the browser, with JSON export/import to move them
  between devices.

## Pitch-match scoring

While a song plays, the app measures your raw voice against the target notes and
shows a live MATCH % meter. At the end you get a report card: score, time in tune,
average pitch drift, strongest note, and what to work on. Personal bests are kept
per song. The three preset examples (Neon Horizon, Soul Fire, Midnight Echoes)
stay as the built-in baseline.

## Supported sheet music formats

- **MusicXML, uncompressed** (.musicxml / .xml, score-partwise). Parsed with the
  browser's native DOMParser, no extra libraries. Handles parts, divisions,
  tempo (sound/metronome directions, first tempo wins), ties (merged across
  barlines), lyrics with syllables, grace notes (skipped), and backup/forward
  positioning. Repeats are not expanded. Zipped .mxl is not supported: export
  uncompressed MusicXML from your notation app.
- **ABC notation** (pasted text, common subset). Headers X/T/M/L/Q/K, key
  signature accidentals with bar-scoped explicit overrides, octave marks,
  note lengths, rests (z, Z), chords (top note kept), and w: lyric lines
  mapped onto notes in order. First voice only; no broken rhythm, tuplets,
  decorations, or mid-tune meter changes.

## Explicit non-goal: photo/scan OMR

Optical music recognition from photos or scans of sheet music is deliberately
not included. There is no reliable in-browser OMR library, and bad note data
would mistrain singers, which is worse than no data. Type it as ABC or export
MusicXML instead.

## Run it

```bash
npm install
npm run dev      # local dev server
npm run build    # production build in dist/
npm test         # unit tests (vitest)
```

Rebuilt from the flowmusic.app demo space into a standalone Vite + React + TypeScript
app. The audio engine (autocorrelation pitch detection, granular pitch shifting,
Haas-effect doubler) is unchanged from the original.
