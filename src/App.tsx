import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
Mic2,
Volume2,
VolumeX,
Play,
Pause,
RotateCcw,
Sliders,
Music,
Radio,
Zap,
Headphones,
FileMusic,
AudioLines,
Pencil,
Download,
Trash2,
FolderOpen,
ListMusic,
} from "lucide-react";
import { EngineConfig, KaraokeSong, PitchAnalysisFrame } from "./types";
import { MidiAutoTuneEngine, freqToMidi, midiToFreq } from "./audioEngine";
import { parseMidiFile, songTitleFromFile, type ParsedMidi } from "./midi";
import { transcribeBuffer, decodeAudioToMono } from "./audioToMidi";
import {
loadUserSongs,
saveUserSongs,
makeSongId,
exportSong,
importSongFile,
loadBestScores,
saveBestScore,
} from "./library";
import { midiToName } from "./musicUtil";
import SongEditor from "./components/SongEditor";
import ScoreCard, { type ScoreReport } from "./components/ScoreCard";
const KARAOKE_SONGS: KaraokeSong[] = [
{
id: "neon-horizon",
title: "Neon Horizon",
genre: "Synthpop Anthem",
bpm: 120,
totalDuration: 18,
notes: [
{ midi: 60, start: 0.0, duration: 1.2, lyric: "Hold" },
{ midi: 62, start: 1.3, duration: 1.1, lyric: "on" },
{ midi: 64, start: 2.5, duration: 1.5, lyric: "to" },
{ midi: 67, start: 4.1, duration: 2.0, lyric: "the light," },
{ midi: 65, start: 6.3, duration: 1.2, lyric: "through" },
{ midi: 64, start: 7.6, duration: 1.2, lyric: "the" },
{ midi: 62, start: 8.9, duration: 1.5, lyric: "darkest" },
{ midi: 60, start: 10.5, duration: 2.5, lyric: "night!" },
{ midi: 64, start: 13.2, duration: 1.8, lyric: "We will" },
{ midi: 67, start: 15.1, duration: 2.7, lyric: "SHINE!" },
],
},
{
id: "soul-fire",
title: "Soul Fire",
genre: "R&B / Soul Ballad",
bpm: 90,
totalDuration: 20,
notes: [
{ midi: 57, start: 0.0, duration: 1.6, lyric: "Take" },
{ midi: 60, start: 1.7, duration: 1.5, lyric: "me" },
{ midi: 62, start: 3.3, duration: 2.2, lyric: "higher," },
{ midi: 64, start: 5.7, duration: 1.5, lyric: "burn" },
{ midi: 62, start: 7.3, duration: 1.4, lyric: "like" },
{ midi: 60, start: 8.8, duration: 2.8, lyric: "fire!" },
{ midi: 65, start: 11.8, duration: 1.8, lyric: "Never" },
{ midi: 64, start: 13.7, duration: 1.6, lyric: "let" },
{ midi: 62, start: 15.4, duration: 1.8, lyric: "it" },
{ midi: 60, start: 17.3, duration: 2.5, lyric: "fade." },
],
},
{
id: "midnight-echoes",
title: "Midnight Echoes",
genre: "80s Dreamwave",
bpm: 105,
totalDuration: 16,
notes: [
{ midi: 65, start: 0.0, duration: 1.4, lyric: "Hear" },
{ midi: 67, start: 1.5, duration: 1.5, lyric: "the" },
{ midi: 69, start: 3.1, duration: 2.2, lyric: "echoes" },
{ midi: 67, start: 5.4, duration: 1.8, lyric: "in" },
{ midi: 65, start: 7.3, duration: 1.8, lyric: "the" },
{ midi: 64, start: 9.2, duration: 2.4, lyric: "sound," },
{ midi: 62, start: 11.8, duration: 1.8, lyric: "never" },
{ midi: 60, start: 13.7, duration: 2.2, lyric: "down." },
],
},
];
const KEYBOARD_KEYS = [
{ midi: 48, name: "C3", isBlack: false, keyLabel: "Z" },
{ midi: 49, name: "C#3", isBlack: true, keyLabel: "S" },
{ midi: 50, name: "D3", isBlack: false, keyLabel: "X" },
{ midi: 51, name: "D#3", isBlack: true, keyLabel: "D" },
{ midi: 52, name: "E3", isBlack: false, keyLabel: "C" },
{ midi: 53, name: "F3", isBlack: false, keyLabel: "V" },
{ midi: 54, name: "F#3", isBlack: true, keyLabel: "G" },
{ midi: 55, name: "G3", isBlack: false, keyLabel: "B" },
{ midi: 56, name: "G#3", isBlack: true, keyLabel: "H" },
{ midi: 57, name: "A3", isBlack: false, keyLabel: "N" },
{ midi: 58, name: "A#3", isBlack: true, keyLabel: "J" },
{ midi: 59, name: "B3", isBlack: false, keyLabel: "M" },
{ midi: 60, name: "C4", isBlack: false, keyLabel: "Q" },
{ midi: 61, name: "C#4", isBlack: true, keyLabel: "2" },
{ midi: 62, name: "D4", isBlack: false, keyLabel: "W" },
{ midi: 63, name: "D#4", isBlack: true, keyLabel: "3" },
{ midi: 64, name: "E4", isBlack: false, keyLabel: "E" },
{ midi: 65, name: "F4", isBlack: false, keyLabel: "R" },
{ midi: 66, name: "F#4", isBlack: true, keyLabel: "5" },
{ midi: 67, name: "G4", isBlack: false, keyLabel: "T" },
{ midi: 68, name: "G#4", isBlack: true, keyLabel: "6" },
{ midi: 69, name: "A4", isBlack: false, keyLabel: "Y" },
{ midi: 70, name: "A#4", isBlack: true, keyLabel: "7" },
{ midi: 71, name: "B4", isBlack: false, keyLabel: "U" },
{ midi: 72, name: "C5", isBlack: false, keyLabel: "I" },
];
export default function Component() {
const engineRef = useRef<MidiAutoTuneEngine | null>(null);
const canvasRef = useRef<HTMLCanvasElement | null>(null);
const [activeMidiNote, setActiveMidiNote] = useState<number>(60);
const [masterVolume, setMasterVolume] = useState<number>(0.85);
const [isMuted, setIsMuted] = useState<boolean>(false);
const [midiDeviceConnected, setMidiDeviceConnected] = useState<boolean>(false);
const [inputSource, setInputSource] = useState<"demo" | "mic">("demo");
const [config, setConfig] = useState<EngineConfig>({
leadGain: 0.85,
doubleGain: 0.70,
retuneSpeedMs: 5,
doubleDelayMs: 20,
doubleDetuneCents: 0,
doubleStereoWidth: 0.85,
inputGain: 1.0,
inputSource: "demo",
demoVocalWobble: 0.75,
});
const [selectedSongIndex, setSelectedSongIndex] = useState<number>(0);
const [isKaraokePlaying, setIsKaraokePlaying] = useState<boolean>(false);
const [karaokeProgress, setKaraokeProgress] = useState<number>(0);
const [currentLyric, setCurrentLyric] = useState<string>("Ready to Sing");
// User songs (presets stay as the built-in baseline)
const [userSongs, setUserSongs] = useState<KaraokeSong[]>(() => loadUserSongs());
const allSongs = useMemo(() => [...KARAOKE_SONGS, ...userSongs], [userSongs]);
const songsRef = useRef(allSongs);
songsRef.current = allSongs;
const playingRef = useRef(false);
playingRef.current = isKaraokePlaying;
const [bestScores, setBestScores] = useState<Record<string, number>>(() => loadBestScores());
// Pitch-match scoring
const scoreRef = useRef({
frames: [] as number[],
rolling: [] as number[],
perNote: new Map<number, { frames: number; inTune: number; midi: number }>(),
});
const [matchPct, setMatchPct] = useState<number | null>(null);
const [report, setReport] = useState<ScoreReport | null>(null);
// Song studio: imports, editor, track picker
const [editing, setEditing] = useState<{ song: KaraokeSong; audio: { data: Float32Array; sampleRate: number } | null } | null>(null);
const [importing, setImporting] = useState<string | null>(null);
const [importError, setImportError] = useState<string | null>(null);
const [trackPicker, setTrackPicker] = useState<{ parsed: ParsedMidi; title: string } | null>(null);
const midiInputRef = useRef<HTMLInputElement>(null);
const audioInputRef = useRef<HTMLInputElement>(null);
const jsonInputRef = useRef<HTMLInputElement>(null);
const karaokeStartTimeRef = useRef<number>(0);
const karaokePauseOffsetRef = useRef<number>(0);
const latestAnalysisRef = useRef<PitchAnalysisFrame>({
timestamp: 0,
detectedFreq: 228,
targetFreq: 261.63,
detectedMidi: 57,
targetMidi: 60,
centsOff: -23,
isVoiced: true,
inputRms: 0.2,
tunedRms: 0.2,
doubleRms: 0.18,
});
const pitchHistoryRef = useRef<
Array<{
detectedMidi: number;
targetMidi: number;
isVoiced: boolean;
inputRms: number;
}>
>([]);
const [displayInfo, setDisplayInfo] = useState({
detectedNote: "A3",
targetNote: "C4",
centsOff: -23,
isVoiced: true,
});
useEffect(() => {
const engine = new MidiAutoTuneEngine();
engineRef.current = engine;
engine
.init((frame) => {
latestAnalysisRef.current = frame;
const hist = pitchHistoryRef.current;
hist.push({
detectedMidi: frame.detectedMidi + frame.centsOff / 100,
targetMidi: frame.targetMidi,
isVoiced: frame.isVoiced,
inputRms: frame.inputRms,
});
if (hist.length > 350) {
hist.shift();
}
})
.catch((err) => console.error(err));
if (typeof navigator !== "undefined" && "requestMIDIAccess" in navigator) {
navigator.requestMIDIAccess().then((midiAccess) => {
let hasInputs = false;
midiAccess.inputs.forEach((input) => {
hasInputs = true;
input.onmidimessage = (msg) => {
if (!msg.data) return;
const [status, note, velocity] = msg.data;
if ((status >> 4) === 9 && velocity > 0) {
handleSetMidiNote(note);
}
};
});
setMidiDeviceConnected(hasInputs);
}).catch(() => {});
}
const labelTimer = setInterval(() => {
const cur = latestAnalysisRef.current;
const detInfo = freqToMidi(cur.detectedFreq);
const tarInfo = freqToMidi(cur.targetFreq);
setDisplayInfo({
detectedNote: cur.isVoiced ? detInfo.noteName : "--",
targetNote: tarInfo.noteName,
centsOff: cur.centsOff,
isVoiced: cur.isVoiced,
});
// Live pitch-match meter (rolling ~3s window while a song plays)
if (playingRef.current) {
const roll = scoreRef.current.rolling;
if (roll.length >= 5) {
const pct = Math.round((roll.reduce((a, b) => a + b, 0) / roll.length) * 100);
setMatchPct((prev) => (prev === pct ? prev : pct));
}
}
}, 180);
return () => {
clearInterval(labelTimer);
engine.destroy();
};
}, []);
const handleSetMidiNote = useCallback((midi: number) => {
setActiveMidiNote(midi);
engineRef.current?.setMidiNote(midi);
}, []);
const updateConfig = useCallback(
(newCfg: Partial<EngineConfig>) => {
const merged = { ...config, ...newCfg };
setConfig(merged);
engineRef.current?.applyConfig(newCfg);
},
[config]
);
const handleToggleInputSource = async (src: "demo" | "mic") => {
setInputSource(src);
updateConfig({ inputSource: src });
await engineRef.current?.setInputSource(src);
};
const handleVolumeChange = (val: number) => {
setMasterVolume(val);
engineRef.current?.setMasterVolume(isMuted ? 0 : val);
};
const handleToggleMute = () => {
const nextMute = !isMuted;
setIsMuted(nextMute);
engineRef.current?.setMasterVolume(nextMute ? 0 : masterVolume);
};
const IN_TUNE_CENTS = 35;

// Build the end-of-song practice report from the collected pitch frames.
const finishSong = useCallback((song: KaraokeSong) => {
const s = scoreRef.current;
const n = s.frames.length;
setMatchPct(null);
if (n < 10) return; // barely sang; no score
const inTune = s.frames.filter((c) => c <= IN_TUNE_CENTS).length;
const pctInTune = Math.round((inTune / n) * 100);
const avgCents = Math.round(s.frames.reduce((a, b) => a + b, 0) / n);
const extremes: { best: { midi: number; pct: number } | null; worst: { midi: number; pct: number } | null } = { best: null, worst: null };
s.perNote.forEach((pn) => {
if (pn.frames < 5) return;
const p = (pn.inTune / pn.frames) * 100;
if (!extremes.best || p > extremes.best.pct) extremes.best = { midi: pn.midi, pct: p };
if (!extremes.worst || p < extremes.worst.pct) extremes.worst = { midi: pn.midi, pct: p };
});
const prev = loadBestScores()[song.id] || 0;
const isBest = pctInTune > prev;
saveBestScore(song.id, pctInTune);
setBestScores(loadBestScores());
const bestMidi = extremes.best?.midi ?? null;
const worstMidi = extremes.worst && extremes.worst.midi !== extremes.best?.midi ? extremes.worst.midi : null;
setReport({
songTitle: song.title,
score: pctInTune,
pctInTune,
avgCents,
voicedSeconds: Math.round(n * 0.04 * 10) / 10,
bestNote: bestMidi !== null ? midiToName(bestMidi) : null,
worstNote: worstMidi !== null ? midiToName(worstMidi) : null,
isBest,
});
}, []);

const resetScore = useCallback(() => {
scoreRef.current = { frames: [], rolling: [], perNote: new Map() };
setMatchPct(null);
}, []);

// ---- Song studio: uploads, library ----

const openEditorForNotes = (
notes: KaraokeSong["notes"],
duration: number,
title: string,
audio: { data: Float32Array; sampleRate: number } | null,
) => {
const totalDuration = notes.length > 0 ? Math.max(...notes.map((x) => x.start + x.duration)) : duration;
setEditing({
song: { id: makeSongId(), title, genre: "My Songs", bpm: 120, totalDuration, notes },
audio,
});
};

const handleMidiFile = async (file: File) => {
setImportError(null);
setImporting(`Reading ${file.name}...`);
try {
const parsed = await parseMidiFile(file);
const title = songTitleFromFile(file.name);
const usable = parsed.tracks.filter((t) => t.noteCount > 0);
if (usable.length === 0) throw new Error("No notes found in that MIDI file.");
if (usable.length > 1) {
setTrackPicker({ parsed, title });
} else {
const notes = parsed.getNotes(usable[0].index);
openEditorForNotes(notes, parsed.duration, title, null);
}
} catch (e) {
setImportError(e instanceof Error ? e.message : "Could not read that MIDI file.");
} finally {
setImporting(null);
}
};

const pickMidiTrack = (trackIndex: number) => {
if (!trackPicker) return;
const notes = trackPicker.parsed.getNotes(trackIndex);
setTrackPicker(null);
if (notes.length === 0) {
setImportError("That track has no usable notes.");
return;
}
openEditorForNotes(notes, trackPicker.parsed.duration, trackPicker.title, null);
};

const handleAudioFile = async (file: File) => {
setImportError(null);
setImporting(`Decoding ${file.name}...`);
try {
const { mono, sampleRate, duration } = await decodeAudioToMono(file);
const notes = await transcribeBuffer(mono, sampleRate, (p) =>
setImporting(`Extracting vocal melody... ${Math.round(p * 100)}%`),
);
if (notes.length === 0) {
setImportError("No clear vocal line found. This works best on a solo vocal recording, not a mixed song.");
return;
}
openEditorForNotes(notes, duration, songTitleFromFile(file.name), { data: mono, sampleRate });
} catch (e) {
setImportError("Could not read that audio file. Try WAV, M4A, or MP3.");
} finally {
setImporting(null);
}
};

const handleJsonFile = async (file: File) => {
setImportError(null);
try {
const song = await importSongFile(file);
persistUserSongs([...userSongs, song]);
setSelectedSongIndex(KARAOKE_SONGS.length + userSongs.length);
resetKaraokeSong();
} catch {
setImportError("That file is not a valid song.");
}
};

const persistUserSongs = (next: KaraokeSong[]) => {
setUserSongs(next);
saveUserSongs(next);
};

const saveEditedSong = (song: KaraokeSong) => {
const i = userSongs.findIndex((s) => s.id === song.id);
const next = i >= 0 ? userSongs.map((s, j) => (j === i ? song : s)) : [...userSongs, song];
persistUserSongs(next);
setSelectedSongIndex(KARAOKE_SONGS.length + (i >= 0 ? i : userSongs.length));
resetKaraokeSong();
setEditing(null);
};

const deleteUserSong = (id: string) => {
const delIdx = userSongs.findIndex((s) => s.id === id);
const next = userSongs.filter((s) => s.id !== id);
persistUserSongs(next);
const selUserIdx = selectedSongIndex - KARAOKE_SONGS.length;
if (selUserIdx < 0) return;
if (selUserIdx === delIdx || selectedSongIndex >= KARAOKE_SONGS.length + next.length) {
setSelectedSongIndex(0);
resetKaraokeSong();
} else if (selUserIdx > delIdx) {
setSelectedSongIndex(selectedSongIndex - 1);
}
};

useEffect(() => {
if (!isKaraokePlaying) return;
const currentSong = songsRef.current[selectedSongIndex];
if (!currentSong) return;
resetScore();
const startTime = performance.now() - karaokePauseOffsetRef.current * 1000;
karaokeStartTimeRef.current = startTime;
const interval = setInterval(() => {
const elapsed = (performance.now() - startTime) / 1000;
if (elapsed >= currentSong.totalDuration) {
karaokePauseOffsetRef.current = 0;
setKaraokeProgress(1);
setIsKaraokePlaying(false);
finishSong(currentSong);
return;
}
setKaraokeProgress(elapsed / currentSong.totalDuration);
const noteIdx = currentSong.notes.findIndex(
(n) => elapsed >= n.start && elapsed < n.start + n.duration
);
const activeNote = noteIdx >= 0 ? currentSong.notes[noteIdx] : undefined;
if (activeNote) {
handleSetMidiNote(activeNote.midi);
setCurrentLyric(activeNote.lyric || "♪");
const fr = latestAnalysisRef.current;
if (fr.isVoiced && fr.targetMidi > 0) {
const sc = scoreRef.current;
const off = Math.abs(fr.centsOff);
sc.frames.push(off);
sc.rolling.push(off <= IN_TUNE_CENTS ? 1 : 0);
if (sc.rolling.length > 75) sc.rolling.shift();
let pn = sc.perNote.get(noteIdx);
if (!pn) {
pn = { frames: 0, inTune: 0, midi: activeNote.midi };
sc.perNote.set(noteIdx, pn);
}
pn.frames++;
if (off <= IN_TUNE_CENTS) pn.inTune++;
}
} else {
setCurrentLyric("♪ ♪ ♪");
}
}, 40);
return () => clearInterval(interval);
}, [isKaraokePlaying, selectedSongIndex, handleSetMidiNote, finishSong, resetScore]);
const toggleKaraokePlay = () => {
if (isKaraokePlaying) {
const currentSong = songsRef.current[selectedSongIndex];
if (currentSong) karaokePauseOffsetRef.current = karaokeProgress * currentSong.totalDuration;
setIsKaraokePlaying(false);
} else {
setReport(null);
engineRef.current?.resume();
setIsKaraokePlaying(true);
}
};
const resetKaraokeSong = () => {
setIsKaraokePlaying(false);
karaokePauseOffsetRef.current = 0;
setKaraokeProgress(0);
setCurrentLyric("Ready to Sing");
setMatchPct(null);
resetScore();
};
useEffect(() => {
const canvas = canvasRef.current;
if (!canvas) return;
const ctx = canvas.getContext("2d");
if (!ctx) return;
let animId: number;
const render = () => {
const dpr = window.devicePixelRatio || 1;
const width = canvas.clientWidth;
const height = canvas.clientHeight;
if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
canvas.width = width * dpr;
canvas.height = height * dpr;
}
ctx.save();
ctx.scale(dpr, dpr);
ctx.fillStyle = "#0f131a";
ctx.fillRect(0, 0, width, height);
const minMidi = 48;
const maxMidi = 72;
const midiRange = maxMidi - minMidi;
const midiToY = (m: number) => height - ((m - minMidi) / midiRange) * height;
for (let m = minMidi; m <= maxMidi; m++) {
const y = midiToY(m);
const isC = m % 12 === 0;
ctx.strokeStyle = isC ? "rgba(6, 182, 212, 0.28)" : "rgba(255, 255, 255, 0.04)";
ctx.lineWidth = isC ? 1.5 : 1;
ctx.beginPath();
ctx.moveTo(0, y);
ctx.lineTo(width, y);
ctx.stroke();
}
const currentTargetMidi = latestAnalysisRef.current.targetMidi;
if (currentTargetMidi >= minMidi && currentTargetMidi <= maxMidi) {
const targetY = midiToY(currentTargetMidi);
ctx.fillStyle = "rgba(6, 182, 212, 0.2)";
ctx.fillRect(0, targetY - 7, width, 14);
ctx.strokeStyle = "#22d3ee";
ctx.lineWidth = 2.5;
ctx.beginPath();
ctx.moveTo(0, targetY);
ctx.lineTo(width, targetY);
ctx.stroke();
}
const history = pitchHistoryRef.current;
if (history.length > 1) {
const xStep = (width - 40) / 320;
ctx.lineWidth = 2;
ctx.strokeStyle = "rgba(245, 158, 11, 0.85)";
ctx.beginPath();
let started = false;
for (let i = 0; i < history.length; i++) {
const pt = history[i];
const x = 40 + i * xStep;
if (pt.isVoiced && pt.detectedMidi >= minMidi && pt.detectedMidi <= maxMidi) {
const y = midiToY(pt.detectedMidi);
if (!started) { ctx.moveTo(x, y); started = true; }
else { ctx.lineTo(x, y); }
} else { started = false; }
}
ctx.stroke();
ctx.lineWidth = 3.5;
ctx.strokeStyle = "#06b6d4";
ctx.beginPath();
started = false;
for (let i = 0; i < history.length; i++) {
const pt = history[i];
const x = 40 + i * xStep;
if (pt.isVoiced && pt.targetMidi > 0) {
const y = midiToY(pt.targetMidi);
if (!started) { ctx.moveTo(x, y); started = true; }
else { ctx.lineTo(x, y); }
} else { started = false; }
}
ctx.stroke();
}
ctx.restore();
animId = requestAnimationFrame(render);
};
animId = requestAnimationFrame(render);
return () => cancelAnimationFrame(animId);
}, []);
return (
<div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#0d0f14] text-slate-100 p-3 md:p-6 font-sans select-none">
<div className="w-full max-w-5xl bg-[#141821] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
<header className="px-5 py-3.5 bg-[#171c26] border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
<div className="flex items-center gap-3">
<div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
<Zap className="w-5 h-5 text-white" />
</div>
<div>
<h1 className="text-base md:text-lg font-bold tracking-tight text-white flex items-center gap-2">
MIDI AUTO-TUNE & VOCAL DOUBLER
<span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/60">
Live Show Rig
</span>
</h1>
<p className="text-xs text-slate-400">
Corrects vocal pitch to target MIDI notes while doubling natural voice
</p>
</div>
</div>
<div className="flex items-center gap-3 ml-auto">
<div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300">
<Radio className={`w-3.5 h-3.5 ${midiDeviceConnected ? "text-emerald-400" : "text-cyan-400"}`} />
<span>{midiDeviceConnected ? "USB MIDI Active" : "Virtual MIDI"}</span>
</div>
<div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1 rounded-lg">
<button onClick={handleToggleMute} className="text-slate-400 hover:text-white transition">
{isMuted || masterVolume === 0 ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2
className="w-4 h-4 text-cyan-400" />}
</button>
<input
type="range" min="0" max="1" step="0.01"
value={isMuted ? 0 : masterVolume}
onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
className="w-16 md:w-24 h-1.5 bg-slate-800 accent-cyan-400 rounded-lg cursor-pointer"
/>
</div>
</div>
</header>
<div className="p-4 md:p-5 flex flex-col gap-4">
<div className="relative rounded-xl overflow-hidden border border-slate-800 bg-[#0f131a]">
<canvas ref={canvasRef} className="w-full h-48 md:h-56 block cursor-crosshair" />
<div className="absolute top-2.5 left-3 flex items-center gap-2 pointer-events-none">
<div className="bg-slate-900/90 border border-slate-800 px-2.5 py-1 rounded-md text-xs font-bold text-amber-400">
RAW: {displayInfo.detectedNote}
</div>
<div className="bg-slate-900/90 border border-cyan-800 px-2.5 py-1 rounded-md text-xs font-bold text-cyan-400">
TARGET: {displayInfo.targetNote}
</div>
<div className="bg-slate-900/90 border border-slate-800 px-2.5 py-1 rounded-md text-xs font-bold text-slate-300">
OFFSET: {displayInfo.centsOff} cents
</div>
</div>
</div>
<div className="bg-[#171c26] border border-slate-800 rounded-xl p-3.5 flex flex-col md:flex-row items-center justify-between gap-4">
<div className="flex items-center gap-3">
<button
onClick={toggleKaraokePlay}
className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-white transition ${
isKaraokePlaying ? "bg-amber-600 hover:bg-amber-500" : "bg-cyan-600 hover:bg-cyan-500"
}`}
>
{isKaraokePlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
</button>
<button onClick={resetKaraokeSong} className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center">
<RotateCcw className="w-4 h-4" />
</button>
<select
value={selectedSongIndex}
onChange={(e) => { setSelectedSongIndex(parseInt(e.target.value)); resetKaraokeSong(); }}
className="bg-slate-900 border border-slate-700 text-xs font-semibold text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none max-w-[12rem]"
>
<optgroup label="Preset examples">
{KARAOKE_SONGS.map((song, idx) => (
<option key={song.id} value={idx}>{song.title} ({song.genre}){bestScores[song.id] ? ` — best ${bestScores[song.id]}` : ""}</option>
))}
</optgroup>
{userSongs.length > 0 && (
<optgroup label="My songs">
{userSongs.map((song, i) => (
<option key={song.id} value={KARAOKE_SONGS.length + i}>{song.title}{bestScores[song.id] ? ` — best ${bestScores[song.id]}` : ""}</option>
))}
</optgroup>
)}
</select>
{matchPct !== null && (
<span className={`text-xs font-black px-2.5 py-1.5 rounded-lg border ${
matchPct >= 80 ? "bg-emerald-950 border-emerald-800 text-emerald-300"
: matchPct >= 60 ? "bg-amber-950 border-amber-800 text-amber-300"
: "bg-red-950 border-red-800 text-red-300"
}`}>
MATCH {matchPct}%
</span>
)}
</div>
<div className="text-base md:text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-white to-amber-300">
&ldquo;{currentLyric}&rdquo;
</div>
</div>
<div className="bg-[#141821] border border-slate-800 rounded-2xl p-4 space-y-3">
<div className="flex flex-wrap items-center justify-between gap-2">
<div className="flex items-center gap-2">
<ListMusic className="w-4 h-4 text-cyan-300" />
<span className="text-sm font-black text-white">Song Studio</span>
<span className="text-[11px] text-slate-500">practice your own songs</span>
</div>
<div className="flex flex-wrap gap-2">
<button onClick={() => midiInputRef.current?.click()} className="px-3 py-1.5 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-bold flex items-center gap-1.5">
<FileMusic className="w-3.5 h-3.5" /> Upload MIDI
</button>
<button onClick={() => audioInputRef.current?.click()} className="px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-600 text-white text-xs font-bold flex items-center gap-1.5">
<AudioLines className="w-3.5 h-3.5" /> Upload vocal audio
</button>
<button onClick={() => jsonInputRef.current?.click()} className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold flex items-center gap-1.5">
<FolderOpen className="w-3.5 h-3.5" /> Import song
</button>
</div>
</div>
<p className="text-[11px] text-slate-500">
Upload a MIDI of a song you wrote, or a WAV / M4A / MP3 of you singing it. The app pulls the melody into notes and drafts the lyrics, then you fix anything by hand in the editor and save it to your library. Audio works best on solo vocal recordings, not mixed songs.
</p>
{importing && <div className="text-xs text-cyan-300 font-semibold">{importing}</div>}
{importError && <div className="text-xs text-red-400 font-semibold">{importError}</div>}
{userSongs.length > 0 && (
<div className="space-y-1.5">
{userSongs.map((s) => (
<div key={s.id} className="flex items-center gap-2 bg-[#171c26] border border-slate-800 rounded-lg px-3 py-2">
<Music className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
<button
onClick={() => {
const i = userSongs.findIndex((x) => x.id === s.id);
setSelectedSongIndex(KARAOKE_SONGS.length + i);
resetKaraokeSong();
}}
className="text-sm font-bold text-white hover:text-cyan-300 text-left flex-1 truncate"
>
{s.title}
</button>
<span className="text-[11px] text-slate-500 shrink-0">{s.notes.length} notes{bestScores[s.id] ? ` · best ${bestScores[s.id]}` : ""}</span>
<button title="Edit song" onClick={() => setEditing({ song: s, audio: null })} className="w-7 h-7 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center shrink-0">
<Pencil className="w-3.5 h-3.5" />
</button>
<button title="Export song file" onClick={() => exportSong(s)} className="w-7 h-7 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center shrink-0">
<Download className="w-3.5 h-3.5" />
</button>
<button title="Delete song" onClick={() => deleteUserSong(s.id)} className="w-7 h-7 rounded-md bg-slate-800 hover:bg-red-900 text-slate-300 hover:text-red-300 flex items-center justify-center shrink-0">
<Trash2 className="w-3.5 h-3.5" />
</button>
</div>
))}
</div>
)}
<input ref={midiInputRef} type="file" accept=".mid,.midi" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleMidiFile(f); e.target.value = ""; }} />
<input ref={audioInputRef} type="file" accept=".wav,.m4a,.mp3,audio/wav,audio/mp4,audio/mpeg" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleAudioFile(f); e.target.value = ""; }} />
<input ref={jsonInputRef} type="file" accept=".json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleJsonFile(f); e.target.value = ""; }} />
</div>
{trackPicker && (
<div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3" onClick={() => setTrackPicker(null)}>
<div className="w-full max-w-md bg-[#141821] border border-slate-700 rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
<h3 className="text-base font-black text-white mb-1">Which track is the melody?</h3>
<p className="text-xs text-slate-400 mb-3">&ldquo;{trackPicker.title}&rdquo; has {trackPicker.parsed.tracks.filter((t) => t.noteCount > 0).length} tracks with notes. Pick the one carrying the vocal line.</p>
<div className="space-y-2 max-h-64 overflow-y-auto">
{trackPicker.parsed.tracks.filter((t) => t.noteCount > 0).map((t) => (
<button key={t.index} onClick={() => pickMidiTrack(t.index)} className={`w-full text-left px-3 py-2 rounded-lg border text-sm ${t.index === trackPicker.parsed.suggestedTrack ? "border-cyan-600 bg-cyan-950/40" : "border-slate-800 bg-[#171c26] hover:border-slate-600"}`}>
<div className="font-bold text-white">{t.name}{t.index === trackPicker.parsed.suggestedTrack && <span className="ml-2 text-[10px] text-cyan-300 font-bold">SUGGESTED</span>}</div>
<div className="text-[11px] text-slate-400">{t.noteCount} notes{t.isDrum ? " · drums" : ""}</div>
</button>
))}
</div>
<button onClick={() => setTrackPicker(null)} className="mt-3 w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-bold text-slate-200">Cancel</button>
</div>
</div>
)}
{editing && (
<SongEditor
initial={editing.song}
transcribeAudio={editing.audio}
onSave={saveEditedSong}
onClose={() => setEditing(null)}
/>
)}
{report && (
<ScoreCard
report={report}
onClose={() => setReport(null)}
onRetry={() => { setReport(null); resetKaraokeSong(); setIsKaraokePlaying(true); }}
/>
)}
<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
<div className="bg-[#171c26] border border-cyan-900/60 rounded-xl p-3.5 space-y-3">
<span className="text-xs font-bold uppercase tracking-wider text-cyan-300">Lead Tuned
Vocal</span>
<div>
<div className="flex justify-between text-xs text-slate-300 mb-1">
<span>Level</span><span>{Math.round(config.leadGain * 100)}%</span>
</div>
<input
type="range" min="0" max="1" step="0.01" value={config.leadGain}
onChange={(e) => updateConfig({ leadGain: parseFloat(e.target.value) })}
className="w-full h-1.5 bg-slate-800 accent-cyan-400 rounded-lg"
/>
</div>
<div>
<div className="flex justify-between text-xs text-slate-300 mb-1">
<span>Retune Speed</span><span>{config.retuneSpeedMs} ms</span>
</div>
<input
type="range" min="0" max="50" step="1" value={config.retuneSpeedMs}
onChange={(e) => updateConfig({ retuneSpeedMs: parseInt(e.target.value) })}
className="w-full h-1.5 bg-slate-800 accent-cyan-400 rounded-lg"
/>
</div>
</div>
<div className="bg-[#171c26] border border-amber-900/60 rounded-xl p-3.5 space-y-3">
<span className="text-xs font-bold uppercase tracking-wider text-amber-300">Natural Vocal
Doubler</span>
<div>
<div className="flex justify-between text-xs text-slate-300 mb-1">
<span>Doubler Level</span><span>{Math.round(config.doubleGain * 100)}%</span>
</div>
<input
type="range" min="0" max="1" step="0.01" value={config.doubleGain}
onChange={(e) => updateConfig({ doubleGain: parseFloat(e.target.value) })}
className="w-full h-1.5 bg-slate-800 accent-amber-400 rounded-lg"
/>
</div>
<div>
<div className="flex justify-between text-xs text-slate-300 mb-1">
<span>Stereo Width (Haas)</span><span>{config.doubleDelayMs} ms</span>
</div>
<input
type="range" min="8" max="35" step="1" value={config.doubleDelayMs}
onChange={(e) => updateConfig({ doubleDelayMs: parseInt(e.target.value) })}
className="w-full h-1.5 bg-slate-800 accent-amber-400 rounded-lg"
/>
</div>
</div>
<div className="bg-[#171c26] border border-slate-800 rounded-xl p-3.5 space-y-3">
<span className="text-xs font-bold uppercase tracking-wider text-slate-300">Vocal Input
Source</span>
<div className="grid grid-cols-2 gap-2">
<button
onClick={() => handleToggleInputSource("demo")}
className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${
inputSource === "demo" ? "bg-cyan-600 text-white" : "bg-slate-900 text-slate-400 border border-slate-800"
}`}
>
<Headphones className="w-3.5 h-3.5" /> Demo Voice
</button>
<button
onClick={() => handleToggleInputSource("mic")}
className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${
inputSource === "mic" ? "bg-emerald-600 text-white" : "bg-slate-900 text-slate-400 border border-slate-800"
}`}
>
<Mic2 className="w-3.5 h-3.5" /> Live Mic
</button>
</div>
<div>
<div className="flex justify-between text-xs text-slate-300 mb-1">
<span>{inputSource === "demo" ? "Wobble Depth" : "Mic Gain"}</span>
<span>{inputSource === "demo" ? `${Math.round(config.demoVocalWobble * 100)}%` :
`${Math.round(config.inputGain * 100)}%`}</span>
</div>
<input
type="range"
min={inputSource === "demo" ? 0.1 : 0.2}
max={inputSource === "demo" ? 1.0 : 2.0}
step={0.05}
value={inputSource === "demo" ? config.demoVocalWobble : config.inputGain}
onChange={(e) => {
const val = parseFloat(e.target.value);
if (inputSource === "demo") updateConfig({ demoVocalWobble: val });
else updateConfig({ inputGain: val });
}}
className="w-full h-1.5 bg-slate-800 accent-cyan-400 rounded-lg"
/>
</div>
</div>
</div>
<div className="bg-[#171c26] border border-slate-800 rounded-xl p-3.5 flex flex-col gap-2">
<span className="text-xs font-bold uppercase tracking-wider text-slate-200">Interactive Piano
Roll</span>
<div className="relative h-28 w-full flex bg-slate-950 rounded-lg p-1 border border-slate-800 select-none">
{KEYBOARD_KEYS.map((k) => (
<button
key={k.midi}
onClick={() => handleSetMidiNote(k.midi)}
className={
k.isBlack
? `w-6 md:w-8 h-16 -mx-3 md:-mx-4 rounded-b-md border border-slate-900 flex flex-col
justify-end items-center pb-1 relative z-10 ${
activeMidiNote === k.midi ? "bg-cyan-400 text-slate-950 font-bold" : "bg-slate-900 text-slate-300"
}`
: `flex-1 h-full rounded-b-md border border-slate-700/60 flex flex-col justify-end items-center pb-2
relative z-0 ${
activeMidiNote === k.midi ? "bg-cyan-500 text-slate-950 font-bold" : "bg-slate-200 text-slate-700"
}`
}
>
<span className="text-[10px]">{k.name}</span>
</button>
))}
</div>
</div>
</div>
</div>
</div>
);
}
