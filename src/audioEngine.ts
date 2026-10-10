import { EngineConfig, PitchAnalysisFrame } from "./types";
export function midiToFreq(midi: number): number {
return 440 * Math.pow(2, (midi - 69) / 12);
}
export function freqToMidi(freq: number): { midi: number; noteName: string; cents: number } {
if (freq < 20 || isNaN(freq)) {
return { midi: 60, noteName: "--", cents: 0 };
}
const noteNum = 12 * (Math.log2(freq / 440)) + 69;
const roundedMidi = Math.round(noteNum);
const cents = Math.round((noteNum - roundedMidi) * 100);
const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const octave = Math.floor(roundedMidi / 12) - 1;
const noteIndex = ((roundedMidi % 12) + 12) % 12;
const noteName = `${noteNames[noteIndex]}${octave}`;
return { midi: roundedMidi, noteName, cents };
}
const workletCode = `
class MidiAutoTuneProcessor extends AudioWorkletProcessor {
constructor() {
super();
this.bufferSize = 16384;
this.inputBuffer = new Float32Array(this.bufferSize);
this.writeIndex = 0;
this.grainSize = 1024;
this.phase0 = 0.0;
this.currentRatio = 1.0;
this.targetRatio = 1.0;
this.doublerSize = 4096;
this.doublerBuffer = new Float32Array(this.doublerSize);
this.doublerWrite = 0;
this.detectedFreq = 220.0;
this.isVoiced = false;
this.blockCounter = 0;
this.targetMidi = 60;
this.targetFreq = 261.63;
this.leadGain = 0.85;
this.doubleGain = 0.65;
this.retuneSpeedCoeff = 0.4;
this.doubleDelaySamples = 660;
this.haasOffsetSamples = 350;
this.doubleStereoWidth = 0.8;
this.port.onmessage = (e) => {
const data = e.data;
if (data.type === "set_midi_note") {
this.targetMidi = data.midi;
if (this.targetMidi > 0) {
this.targetFreq = 440 * Math.pow(2, (this.targetMidi - 69) / 12);
}
} else if (data.type === "set_config") {
if (data.leadGain !== undefined) this.leadGain = data.leadGain;
if (data.doubleGain !== undefined) this.doubleGain = data.doubleGain;
if (data.retuneSpeedMs !== undefined) {
const ms = Math.max(0, data.retuneSpeedMs);
this.retuneSpeedCoeff = Math.exp(-1.0 / (Math.max(1, ms) * 0.441));
this.retuneSpeedCoeff = Math.min(1.0, Math.max(0.015, 1.0 - this.retuneSpeedCoeff));
}
if (data.doubleDelayMs !== undefined) {
this.doubleDelaySamples = Math.floor((data.doubleDelayMs / 1000) * sampleRate);
}
if (data.doubleStereoWidth !== undefined) {
this.doubleStereoWidth = data.doubleStereoWidth;
}
}
};
}
detectPitch(buf, writeIdx) {
const N = 1024;
const minPeriod = Math.floor(sampleRate / 800);
const maxPeriod = Math.floor(sampleRate / 70);
let energy = 0;
for (let i = 0; i < N; i++) {
const idx = (writeIdx - N + i + this.bufferSize) % this.bufferSize;
const s = buf[idx];
energy += s * s;
}
if (energy < 0.005) {
this.isVoiced = false;
return;
}
let bestR = 0;
let bestPeriod = -1;
for (let tau = minPeriod; tau <= maxPeriod; tau += 2) {
let sum = 0;
let norm1 = 0;
let norm2 = 0;
for (let i = 0; i < N - tau; i += 2) {
const idx1 = (writeIdx - N + i + this.bufferSize) % this.bufferSize;
const idx2 = (idx1 + tau) % this.bufferSize;
const s1 = buf[idx1];
const s2 = buf[idx2];
sum += s1 * s2;
norm1 += s1 * s1;
norm2 += s2 * s2;
}
const denom = Math.sqrt(norm1 * norm2) + 0.00001;
const r = sum / denom;
if (r > bestR && r > 0.42) {
bestR = r;
bestPeriod = tau;
}
}
if (bestPeriod > 0) {
this.isVoiced = true;
const rawFreq = sampleRate / bestPeriod;
this.detectedFreq = this.detectedFreq * 0.7 + rawFreq * 0.3;
} else {
this.isVoiced = false;
}
}
process(inputs, outputs) {
const input = inputs[0];
const output = outputs[0];
if (!output || output.length === 0) return true;
const outL = output[0];
const outR = output.length > 1 ? output[1] : output[0];
const inChan = (input && input.length > 0) ? input[0] : null;
const numSamples = outL.length;
let inRmsSum = 0;
let tunedRmsSum = 0;
let doubleRmsSum = 0;
for (let i = 0; i < numSamples; i++) {
const inSample = inChan ? inChan[i] : 0.0;
inRmsSum += inSample * inSample;
this.inputBuffer[this.writeIndex] = inSample;
this.doublerBuffer[this.doublerWrite] = inSample;
if (this.targetMidi > 0 && this.isVoiced && this.detectedFreq > 40) {
let r = this.targetFreq / this.detectedFreq;
r = Math.min(2.2, Math.max(0.45, r));
this.targetRatio = r;
} else {
this.targetRatio = 1.0;
}
this.currentRatio += (this.targetRatio - this.currentRatio) * this.retuneSpeedCoeff;
const ph0 = this.phase0;
const ph1 = (ph0 + 0.5) % 1.0;
const w0 = 0.5 * (1.0 - Math.cos(2.0 * Math.PI * ph0));
const w1 = 0.5 * (1.0 - Math.cos(2.0 * Math.PI * ph1));
const delay0 = ph0 * this.grainSize;
const delay1 = ph1 * this.grainSize;
const idx0 = (this.writeIndex - Math.floor(delay0) + this.bufferSize) % this.bufferSize;
const idx1 = (this.writeIndex - Math.floor(delay1) + this.bufferSize) % this.bufferSize;
const tunedSample = (this.inputBuffer[idx0] * w0 + this.inputBuffer[idx1] * w1);
this.phase0 += (1.0 - this.currentRatio) / this.grainSize;
if (this.phase0 >= 1.0) this.phase0 -= 1.0;
else if (this.phase0 < 0.0) this.phase0 += 1.0;
const dIdxL = (this.doublerWrite - this.doubleDelaySamples + this.doublerSize) % this.doublerSize;
const dIdxR = (this.doublerWrite - (this.doubleDelaySamples + this.haasOffsetSamples) + this.doublerSize)
% this.doublerSize;
const natL = this.doublerBuffer[dIdxL];
const natR = this.doublerBuffer[dIdxR];
const mid = 0.5 * (natL + natR);
const side = 0.5 * (natL - natR) * (1.0 + this.doubleStereoWidth);
const doubleOutL = mid + side;
const doubleOutR = mid - side;
const finalL = (tunedSample * this.leadGain) + (doubleOutL * this.doubleGain);
const finalR = (tunedSample * this.leadGain) + (doubleOutR * this.doubleGain);
outL[i] = Math.max(-1.0, Math.min(1.0, finalL));
if (output.length > 1) {
outR[i] = Math.max(-1.0, Math.min(1.0, finalR));
}
tunedRmsSum += tunedSample * tunedSample;
doubleRmsSum += doubleOutL * doubleOutL;
this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
this.doublerWrite = (this.doublerWrite + 1) % this.doublerSize;
}
this.blockCounter++;
if (this.blockCounter % 4 === 0) {
this.detectPitch(this.inputBuffer, this.writeIndex);
}
if (this.blockCounter >= 12) {
this.blockCounter = 0;
const inRms = Math.sqrt(inRmsSum / numSamples);
const tunedRms = Math.sqrt(tunedRmsSum / numSamples);
const doubleRms = Math.sqrt(doubleRmsSum / numSamples);
this.port.postMessage({
type: "analysis",
detectedFreq: this.detectedFreq,
targetFreq: this.targetFreq,
targetMidi: this.targetMidi,
isVoiced: this.isVoiced,
inputRms: inRms,
tunedRms: tunedRms,
doubleRms: doubleRms,
});
}
return true;
}
}
registerProcessor("midi-autotune-processor", MidiAutoTuneProcessor);
`;
export class MidiAutoTuneEngine {
private ctx: AudioContext | null = null;
private workletNode: AudioWorkletNode | null = null;
private micStream: MediaStream | null = null;
private micSourceNode: MediaStreamAudioSourceNode | null = null;
private inputGainNode: GainNode | null = null;
private masterGainNode: GainNode | null = null;
private demoOsc: OscillatorNode | null = null;
private demoVibrato: OscillatorNode | null = null;
private demoVibratoGain: GainNode | null = null;
private demoFormant1: BiquadFilterNode | null = null;
private demoFormant2: BiquadFilterNode | null = null;
private demoMasterGain: GainNode | null = null;
private isDemoRunning = false;
private activeMidiNote = 60;
private currentConfig: EngineConfig = {
leadGain: 0.85,
doubleGain: 0.65,
retuneSpeedMs: 5,
doubleDelayMs: 18,
doubleDetuneCents: 0,
doubleStereoWidth: 0.8,
inputGain: 1.0,
inputSource: "demo",
demoVocalWobble: 0.7,
};
private onAnalysisCallback: ((frame: PitchAnalysisFrame) => void) | null = null;
async init(onAnalysis: (frame: PitchAnalysisFrame) => void): Promise<void> {
this.onAnalysisCallback = onAnalysis;
this.ctx = new AudioContext();
const blob = new Blob([workletCode], { type: "application/javascript" });
const url = URL.createObjectURL(blob);
await this.ctx.audioWorklet.addModule(url);
URL.revokeObjectURL(url);
this.workletNode = new AudioWorkletNode(this.ctx, "midi-autotune-processor", {
outputChannelCount: [2],
});
this.inputGainNode = this.ctx.createGain();
this.masterGainNode = this.ctx.createGain();
this.inputGainNode.connect(this.workletNode);
this.workletNode.connect(this.masterGainNode);
this.masterGainNode.connect(this.ctx.destination);
this.workletNode.port.onmessage = (event) => {
const d = event.data;
if (d.type === "analysis" && this.onAnalysisCallback) {
const detectedMidiInfo = freqToMidi(d.detectedFreq);
const centsOff = d.isVoiced && d.targetMidi > 0
? Math.round(1200 * Math.log2(d.detectedFreq / d.targetFreq))
: 0;
this.onAnalysisCallback({
timestamp: performance.now(),
detectedFreq: d.detectedFreq,
targetFreq: d.targetFreq,
detectedMidi: detectedMidiInfo.midi,
targetMidi: d.targetMidi,
centsOff,
isVoiced: d.isVoiced,
inputRms: d.inputRms,
tunedRms: d.tunedRms,
doubleRms: d.doubleRms,
});
}
};
this.applyConfig(this.currentConfig);
this.setMidiNote(this.activeMidiNote);
this.startDemoVocal();
}
setMidiNote(midi: number): void {
this.activeMidiNote = midi;
if (this.workletNode) {
this.workletNode.port.postMessage({ type: "set_midi_note", midi });
}
}
applyConfig(cfg: Partial<EngineConfig>): void {
this.currentConfig = { ...this.currentConfig, ...cfg };
if (this.workletNode) {
this.workletNode.port.postMessage({ type: "set_config", ...this.currentConfig });
}
if (this.inputGainNode && cfg.inputGain !== undefined) {
this.inputGainNode.gain.setTargetAtTime(cfg.inputGain, this.ctx?.currentTime || 0, 0.02);
}
if (cfg.demoVocalWobble !== undefined && this.demoVibratoGain && this.ctx) {
const depth = cfg.demoVocalWobble * 35;
this.demoVibratoGain.gain.setTargetAtTime(depth, this.ctx.currentTime, 0.05);
}
}
async setInputSource(source: "mic" | "demo"): Promise<void> {
this.currentConfig.inputSource = source;
if (!this.ctx || !this.inputGainNode) return;
if (source === "mic") {
this.stopDemoVocal();
await this.startMicrophone();
} else {
this.stopMicrophone();
this.startDemoVocal();
}
}
private async startMicrophone(): Promise<void> {
if (!this.ctx || !this.inputGainNode) return;
try {
if (this.ctx.state === "suspended") {
await this.ctx.resume();
}
this.micStream = await navigator.mediaDevices.getUserMedia({
audio: {
echoCancellation: false,
noiseSuppression: false,
autoGainControl: false,
},
});
this.micSourceNode = this.ctx.createMediaStreamSource(this.micStream);
this.micSourceNode.connect(this.inputGainNode);
} catch (err) {
this.startDemoVocal();
}
}
private stopMicrophone(): void {
if (this.micSourceNode) {
this.micSourceNode.disconnect();
this.micSourceNode = null;
}
if (this.micStream) {
this.micStream.getTracks().forEach((track) => track.stop());
this.micStream = null;
}
}
private startDemoVocal(): void {
if (!this.ctx || !this.inputGainNode || this.isDemoRunning) return;
if (this.ctx.state === "suspended") {
this.ctx.resume();
}
const t = this.ctx.currentTime;
this.demoOsc = this.ctx.createOscillator();
this.demoOsc.type = "sawtooth";
this.demoOsc.frequency.setValueAtTime(228, t);
this.demoVibrato = this.ctx.createOscillator();
this.demoVibrato.frequency.setValueAtTime(5.4, t);
this.demoVibratoGain = this.ctx.createGain();
const wobbleDepth = (this.currentConfig.demoVocalWobble || 0.7) * 35;
this.demoVibratoGain.gain.setValueAtTime(wobbleDepth, t);
this.demoVibrato.connect(this.demoVibratoGain);
this.demoVibratoGain.connect(this.demoOsc.frequency);
this.demoFormant1 = this.ctx.createBiquadFilter();
this.demoFormant1.type = "bandpass";
this.demoFormant1.frequency.setValueAtTime(750, t);
this.demoFormant1.Q.setValueAtTime(3.8, t);
this.demoFormant2 = this.ctx.createBiquadFilter();
this.demoFormant2.type = "bandpass";
this.demoFormant2.frequency.setValueAtTime(1250, t);
this.demoFormant2.Q.setValueAtTime(4.2, t);
this.demoMasterGain = this.ctx.createGain();
this.demoMasterGain.gain.setValueAtTime(0.35, t);
this.demoOsc.connect(this.demoFormant1);
this.demoOsc.connect(this.demoFormant2);
this.demoFormant1.connect(this.demoMasterGain);
this.demoFormant2.connect(this.demoMasterGain);
this.demoMasterGain.connect(this.inputGainNode);
this.demoOsc.start(t);
this.demoVibrato.start(t);
this.isDemoRunning = true;
}
private stopDemoVocal(): void {
if (!this.isDemoRunning) return;
try {
this.demoOsc?.stop();
this.demoVibrato?.stop();
this.demoOsc?.disconnect();
this.demoVibrato?.disconnect();
this.demoFormant1?.disconnect();
this.demoFormant2?.disconnect();
this.demoMasterGain?.disconnect();
} catch {}
this.demoOsc = null;
this.demoVibrato = null;
this.demoFormant1 = null;
this.demoFormant2 = null;
this.demoMasterGain = null;
this.isDemoRunning = false;
}
setMasterVolume(vol: number): void {
if (this.masterGainNode && this.ctx) {
this.masterGainNode.gain.setTargetAtTime(Math.max(0, Math.min(1, vol)), this.ctx.currentTime, 0.02);
}
}
resume(): void {
if (this.ctx && this.ctx.state === "suspended") {
this.ctx.resume();
}
}
destroy(): void {
this.stopMicrophone();
this.stopDemoVocal();
if (this.ctx) {
this.ctx.close();
this.ctx = null;
}
}
}
