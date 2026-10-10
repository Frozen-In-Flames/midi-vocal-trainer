// User song library persisted in localStorage, plus JSON export/import.
import type { KaraokeSong } from './types';

const KEY = 'mvt.userSongs.v1';
const BEST_KEY = 'mvt.bestScores.v1';

function isValidNote(n: unknown): boolean {
  const o = n as Record<string, unknown>;
  return (
    !!o &&
    typeof o.midi === 'number' &&
    typeof o.start === 'number' &&
    typeof o.duration === 'number' &&
    typeof o.lyric === 'string'
  );
}

export function isValidSong(s: unknown): s is KaraokeSong {
  const o = s as Record<string, unknown>;
  return (
    !!o &&
    typeof o.id === 'string' &&
    typeof o.title === 'string' &&
    typeof o.totalDuration === 'number' &&
    Array.isArray(o.notes) &&
    o.notes.length > 0 &&
    o.notes.every(isValidNote)
  );
}

export function loadUserSongs(): KaraokeSong[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(isValidSong);
  } catch {
    return [];
  }
}

export function saveUserSongs(songs: KaraokeSong[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(songs));
  } catch {
    // storage full or unavailable; the songs still work for this session
  }
}

export function makeSongId(): string {
  return 'user-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export function exportSong(song: KaraokeSong): void {
  const blob = new Blob([JSON.stringify(song, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = song.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '.song.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function importSongFile(file: File): Promise<KaraokeSong> {
  const text = await file.text();
  const parsed: unknown = JSON.parse(text);
  if (!isValidSong(parsed)) throw new Error('That file is not a valid song.');
  return { ...parsed, id: makeSongId(), genre: parsed.genre || 'My Songs', bpm: parsed.bpm || 120 };
}

// Best practice scores per song id.
export function loadBestScores(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) || '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

export function saveBestScore(songId: string, score: number): void {
  try {
    const all = loadBestScores();
    if (score > (all[songId] || 0)) {
      all[songId] = score;
      localStorage.setItem(BEST_KEY, JSON.stringify(all));
    }
  } catch {
    // non-fatal
  }
}
