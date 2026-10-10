// Draft lyric transcription for audio uploads, via on-device Whisper.
// Loaded from CDN at runtime so the main bundle stays lean; the model
// downloads once (~75 MB) and then runs fully in the browser.
// Singing is hard for speech models, so output is a DRAFT the user fixes
// in the song editor.
import type { KaraokeSongNote } from './types';
import { resample16k } from './audioToMidi';

export interface LyricWord {
  word: string;
  start: number;
  end: number;
}

type Transcriber = (audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text: string; chunks?: Array<{ text: string; timestamp: [number, number] }> }>;

let transcriberPromise: Promise<Transcriber> | null = null;

async function getTranscriber(onProgress?: (p: number) => void): Promise<Transcriber> {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const cdnUrl: string = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/+esm';
      const mod = (await import(/* @vite-ignore */ cdnUrl)) as {
        pipeline: (task: string, model: string, opts: Record<string, unknown>) => Promise<Transcriber>;
      };
      const pipe = await mod.pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
        progress_callback: (info: { status: string; progress?: number }) => {
          if (info.status === 'progress' && typeof info.progress === 'number') onProgress?.(info.progress * 0.8);
        },
      });
      return pipe;
    })();
  }
  return transcriberPromise;
}

export async function transcribeWords(
  mono: Float32Array,
  sampleRate: number,
  onProgress?: (p: number) => void,
): Promise<LyricWord[]> {
  const pipe = await getTranscriber(onProgress);
  const audio16 = resample16k(mono, sampleRate);
  const out = await pipe(audio16, {
    return_timestamps: 'word',
    chunk_length_s: 30,
    stride_length_s: 5,
  });
  onProgress?.(1);
  const chunks = out.chunks ?? [];
  return chunks
    .map((c) => ({
      word: String(c.text || '').trim(),
      start: Array.isArray(c.timestamp) ? c.timestamp[0] ?? 0 : 0,
      end: Array.isArray(c.timestamp) ? c.timestamp[1] ?? 0 : 0,
    }))
    .filter((w) => w.word.length > 0);
}

/** Greedy map: each note takes the nearest unused word overlapping it. */
export function mapWordsToNotes(words: LyricWord[], notes: KaraokeSongNote[]): KaraokeSongNote[] {
  const used = new Set<number>();
  return notes.map((n) => {
    const start = n.start;
    const end = n.start + n.duration;
    const mid = (start + end) / 2;
    let best = -1;
    let bestScore = Infinity;
    words.forEach((w, i) => {
      if (used.has(i)) return;
      const wMid = (w.start + w.end) / 2;
      const overlaps = w.start < end + 0.15 && w.end > start - 0.15;
      const score = Math.abs(wMid - mid) + (overlaps ? 0 : 10);
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best >= 0 && bestScore < 8) {
      used.add(best);
      return { ...n, lyric: words[best].word };
    }
    return { ...n };
  });
}
