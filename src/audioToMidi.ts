// Turn a recorded vocal (wav/m4a/mp3) into MIDI notes.
// Monophonic pitch tracking with the YIN algorithm, tuned for solo voice.
// Works best on solo vocal recordings; full mixed songs confuse it.
import type { KaraokeSongNote } from './types';

export interface TranscribedAudio {
  notes: KaraokeSongNote[];
  duration: number;
}

const ANALYSIS_RATE = 8000;
const WIN = 512; // 64 ms at 8 kHz
const HOP = 160; // 20 ms hop
const MIN_FREQ = 70;
const MAX_FREQ = 900;

/** YIN pitch estimate for one window. Returns null when unvoiced. */
function yinPitch(frame: Float32Array, sampleRate: number): number | null {
  const n = frame.length;
  const maxTau = Math.floor(sampleRate / MIN_FREQ);
  const minTau = Math.max(2, Math.floor(sampleRate / MAX_FREQ));

  // Difference function
  const diff = new Float32Array(maxTau + 1);
  for (let tau = 0; tau <= maxTau; tau++) {
    let s = 0;
    for (let i = 0; i + tau < n; i++) {
      const d = frame[i] - frame[i + tau];
      s += d * d;
    }
    diff[tau] = s;
  }
  // Cumulative mean normalized difference, computed in a single pass.
  const cmnd = new Float32Array(maxTau + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let t = 1; t <= maxTau; t++) {
    running += diff[t];
    cmnd[t] = running > 0 ? diff[t] / (running / t) : 1;
  }
  // First dip below threshold, then descend to the local minimum.
  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (cmnd[t] < 0.18) {
      let m = t;
      while (m + 1 <= maxTau && cmnd[m + 1] < cmnd[m]) m++;
      tau = m;
      break;
    }
  }
  if (tau < 0) return null;

  // Parabolic interpolation around the minimum for sub-sample accuracy.
  let better = tau;
  if (tau > 0 && tau < maxTau) {
    const a = cmnd[tau - 1];
    const b = cmnd[tau];
    const c = cmnd[tau + 1];
    const denom = a - 2 * b + c;
    if (denom !== 0) better = tau + (0.5 * (a - c)) / denom;
  }
  const freq = sampleRate / better;
  return freq >= MIN_FREQ && freq <= MAX_FREQ ? freq : null;
}

function median(vals: number[]): number {
  const s = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Pure function: mono PCM -> MIDI notes. Testable in node. */
export async function transcribeBuffer(
  mono: Float32Array,
  sampleRate: number,
  onProgress?: (p: number) => void,
): Promise<KaraokeSongNote[]> {
  // Resample to 8 kHz mono for speed (linear interpolation is fine here).
  const ratio = sampleRate / ANALYSIS_RATE;
  const len = Math.floor(mono.length / ratio);
  const data = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const frac = src - i0;
    data[i] = mono[i0] * (1 - frac) + (mono[Math.min(i0 + 1, mono.length - 1)] || 0) * frac;
  }

  let peak = 0;
  for (let i = 0; i < data.length; i += 7) {
    const a = Math.abs(data[i]);
    if (a > peak) peak = a;
  }
  if (peak < 1e-6) return [];

  const total = Math.max(0, Math.floor((data.length - WIN) / HOP));
  const frameMidi: (number | null)[] = new Array(total);
  const frameT: number[] = new Array(total);
  const win = new Float32Array(WIN);

  for (let f = 0; f < total; f++) {
    const off = f * HOP;
    let rms = 0;
    for (let i = 0; i < WIN; i++) {
      const v = data[off + i];
      win[i] = v;
      rms += v * v;
    }
    rms = Math.sqrt(rms / WIN);
    let m: number | null = null;
    if (rms > peak * 0.05) {
      const freq = yinPitch(win, ANALYSIS_RATE);
      if (freq) m = 69 + 12 * Math.log2(freq / 440);
    }
    frameMidi[f] = m;
    frameT[f] = off / ANALYSIS_RATE;
    if (onProgress && f % 500 === 0) {
      onProgress((f / total) * 0.85);
      await new Promise((r) => setTimeout(r, 0)); // keep UI alive
    }
  }

  // Median-smooth the pitch track (5-frame window) to kill jitter.
  const smooth: (number | null)[] = new Array(total);
  for (let f = 0; f < total; f++) {
    const vals: number[] = [];
    for (let k = -2; k <= 2; k++) {
      const v = frameMidi[f + k];
      if (v != null) vals.push(v);
    }
    smooth[f] = vals.length >= 3 ? median(vals) : frameMidi[f];
  }

  // Segment into notes: group frames with stable pitch.
  interface OpenNote {
    start: number;
    vals: number[];
  }
  const notes: KaraokeSongNote[] = [];
  let open: OpenNote | null = null;
  const flush = (endT: number) => {
    if (!open) return;
    const dur = endT - open.start;
    if (dur >= 0.09 && open.vals.length >= 3) {
      notes.push({
        midi: Math.max(0, Math.min(127, Math.round(median(open.vals)))),
        start: open.start,
        duration: dur,
        lyric: '',
      });
    }
    open = null;
  };

  for (let f = 0; f < total; f++) {
    const m = smooth[f];
    const t = frameT[f];
    if (m == null) {
      if (open) flush(t);
      continue;
    }
    if (!open) {
      open = { start: t, vals: [m] };
    } else {
      const ref = median(open.vals.slice(-8));
      if (Math.abs(m - ref) < 0.7) {
        open.vals.push(m);
      } else {
        flush(t);
        open = { start: t, vals: [m] };
      }
    }
  }
  if (open) flush(frameT[total - 1] + HOP / ANALYSIS_RATE);

  // Merge notes split by tiny gaps when the pitch is the same.
  const merged: KaraokeSongNote[] = [];
  for (const nt of notes) {
    const last = merged[merged.length - 1];
    if (last && nt.midi === last.midi && nt.start - (last.start + last.duration) < 0.08) {
      last.duration = nt.start + nt.duration - last.start;
    } else {
      merged.push({ ...nt });
    }
  }

  onProgress?.(1);
  return merged;
}

/** Browser helper: decode an audio file to mono PCM. */
export async function decodeAudioToMono(
  file: File,
): Promise<{ mono: Float32Array; sampleRate: number; duration: number }> {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  try {
    const raw = await file.arrayBuffer();
    const decoded = await ctx.decodeAudioData(raw);
    const n = decoded.length;
    const mono = new Float32Array(n);
    for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
      const d = decoded.getChannelData(ch);
      for (let i = 0; i < n; i++) mono[i] += d[i] / decoded.numberOfChannels;
    }
    return { mono, sampleRate: decoded.sampleRate, duration: decoded.duration };
  } finally {
    void ctx.close();
  }
}

/** Browser wrapper: decode an audio file, mix to mono, transcribe. */
export async function audioFileToNotes(
  file: File,
  onProgress?: (p: number) => void,
): Promise<TranscribedAudio> {
  onProgress?.(0.02);
  const { mono, sampleRate, duration } = await decodeAudioToMono(file);
  const notes = await transcribeBuffer(mono, sampleRate, (p) => onProgress?.(0.05 + p * 0.95));
  return { notes, duration };
}

/** Resample mono PCM to 16 kHz for the speech recognizer. */
export function resample16k(mono: Float32Array, sampleRate: number): Float32Array {
  if (sampleRate === 16000) return mono;
  const ratio = sampleRate / 16000;
  const len = Math.floor(mono.length / ratio);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const frac = src - i0;
    out[i] = mono[i0] * (1 - frac) + (mono[Math.min(i0 + 1, mono.length - 1)] || 0) * frac;
  }
  return out;
}
