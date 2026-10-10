# MIDI Vocal Trainer

A live MIDI auto-tune and vocal doubler practice rig. Sing into the mic (or use the
demo voice) and the engine snaps your voice to the target MIDI notes in real time,
while your natural voice runs underneath as a stereo doubler.

## Practice your own songs

- **Upload MIDI** (.mid): pick the melody track, then add lyrics per section in the
  song editor. Chords are reduced to the top note so the guide stays singable.
- **Upload vocal audio** (WAV / M4A / MP3): the app extracts your vocal melody into
  MIDI notes with on-device pitch tracking, and can draft the lyrics with on-device
  Whisper transcription. Works best on solo vocal recordings, not mixed songs.
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

## Run it

```bash
npm install
npm run dev      # local dev server
npm run build    # production build in dist/
```

Rebuilt from the flowmusic.app demo space into a standalone Vite + React + TypeScript
app. The audio engine (autocorrelation pitch detection, granular pitch shifting,
Haas-effect doubler) is unchanged from the original.
