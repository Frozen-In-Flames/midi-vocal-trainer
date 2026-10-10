export interface MidiNoteInfo {
midi: number;
name: string;
freq: number;
}
export interface KaraokeSongNote {
midi: number;
start: number; // in seconds
duration: number; // in seconds
lyric: string;
}
export interface KaraokeSong {
id: string;
title: string;
genre: string;
bpm: number;
totalDuration: number;
notes: KaraokeSongNote[];
}
export interface PitchAnalysisFrame {
timestamp: number;
detectedFreq: number;
targetFreq: number;
detectedMidi: number;
targetMidi: number;
centsOff: number;
isVoiced: boolean;
inputRms: number;
tunedRms: number;
doubleRms: number;
}
export interface EngineConfig {
leadGain: number;
// 0 to 1
doubleGain: number;
// 0 to 1
retuneSpeedMs: number; // 0ms (robotic) to 60ms (natural)
doubleDelayMs: number; // 10ms to 40ms Haas spread
doubleDetuneCents: number; // -15 to +15 cents
doubleStereoWidth: number; // 0 (mono) to 1 (full wide)
inputGain: number;
// 0 to 2
inputSource: "mic" | "demo";
demoVocalWobble: number; // 0 to 1 amount of pitch error in demo vocal
}
