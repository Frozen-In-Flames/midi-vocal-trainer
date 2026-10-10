// Song editor: lyrics per section, full manual note editing, AI lyric draft.
import { useMemo, useState } from 'react';
import { X, Plus, Trash2, Save, Sparkles, ArrowUp, ArrowDown } from 'lucide-react';
import type { KaraokeSong, KaraokeSongNote } from '../types';
import { midiToName, clampMidi } from '../musicUtil';
import { transcribeWords, mapWordsToNotes } from '../lyrics';

interface Props {
  initial: KaraokeSong;
  transcribeAudio: { data: Float32Array; sampleRate: number } | null;
  onSave: (song: KaraokeSong) => void;
  onClose: () => void;
}

interface Section {
  name: string;
  from: number; // note index
  to: number; // note index
}

function splitSections(notes: KaraokeSongNote[]): Section[] {
  if (notes.length === 0) return [];
  const out: Section[] = [];
  let start = 0;
  for (let i = 1; i < notes.length; i++) {
    const gap = notes[i].start - (notes[i - 1].start + notes[i - 1].duration);
    if (gap > 1.5) {
      out.push({ name: `Section ${out.length + 1}`, from: start, to: i - 1 });
      start = i;
    }
  }
  out.push({ name: `Section ${out.length + 1}`, from: start, to: notes.length - 1 });
  return out;
}

export default function SongEditor({ initial, transcribeAudio, onSave, onClose }: Props) {
  const [title, setTitle] = useState(initial.title);
  const [notes, setNotes] = useState<KaraokeSongNote[]>(() => [...initial.notes].sort((a, b) => a.start - b.start));
  const [tab, setTab] = useState<'lyrics' | 'notes'>('lyrics');
  const [sectionNames, setSectionNames] = useState<Record<number, string>>({});
  const [txState, setTxState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [txMsg, setTxMsg] = useState('');

  const sections = useMemo(() => splitSections(notes), [notes]);

  const setNote = (idx: number, patch: Partial<KaraokeSongNote>) => {
    setNotes((ns) => {
      const next = ns.map((n, i) => (i === idx ? { ...n, ...patch } : n));
      next.sort((a, b) => a.start - b.start);
      return next;
    });
  };

  const deleteNote = (idx: number) => setNotes((ns) => ns.filter((_, i) => i !== idx));

  const addNote = () => {
    setNotes((ns) => {
      const last = ns[ns.length - 1];
      const start = last ? last.start + last.duration + 0.4 : 0;
      return [...ns, { midi: last ? last.midi : 60, start, duration: 0.5, lyric: '' }].sort((a, b) => a.start - b.start);
    });
  };

  const transposeAll = (semis: number) => {
    setNotes((ns) => ns.map((n) => ({ ...n, midi: clampMidi(n.midi + semis) })));
  };

  const applySectionLyrics = (sec: Section, text: string) => {
    const words = text.split(/\s+/).filter(Boolean);
    setNotes((ns) =>
      ns.map((n, i) => {
        if (i < sec.from || i > sec.to) return n;
        const wi = i - sec.from;
        if (wi < words.length) {
          // extra words beyond the note count pile onto the last note
          const extra = i === sec.to ? words.slice(wi + 1).join(' ') : '';
          return { ...n, lyric: extra ? words[wi] + ' ' + extra : words[wi] };
        }
        return { ...n, lyric: '' };
      }),
    );
  };

  const sectionText = (sec: Section) =>
    notes
      .slice(sec.from, sec.to + 1)
      .map((n) => n.lyric)
      .filter(Boolean)
      .join(' ');

  const runTranscription = async () => {
    if (!transcribeAudio) return;
    setTxState('working');
    setTxMsg('Loading voice model (one-time download)...');
    try {
      const words = await transcribeWords(transcribeAudio.data, transcribeAudio.sampleRate, (p) =>
        setTxMsg(`Transcribing... ${Math.round(p * 100)}%`),
      );
      if (words.length === 0) {
        setTxState('error');
        setTxMsg('No words detected. Try a clearer vocal recording, or type lyrics by hand.');
        return;
      }
      setNotes((ns) => mapWordsToNotes(words, ns));
      setTxState('done');
      setTxMsg(`Draft ready: ${words.length} words. Fix any mistakes below, singing is tricky for AI.`);
    } catch (e) {
      setTxState('error');
      setTxMsg('Transcription needs internet for the one-time model download. You can still type lyrics by hand.');
    }
  };

  const save = () => {
    const t = title.trim();
    if (!t || notes.length === 0) return;
    const sorted = [...notes].sort((a, b) => a.start - b.start);
    const totalDuration = Math.max(...sorted.map((n) => n.start + n.duration));
    onSave({ ...initial, title: t, notes: sorted, totalDuration });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-3 overflow-y-auto" onClick={onClose}>
      <div
        className="w-full max-w-3xl bg-[#141821] border border-slate-700 rounded-2xl shadow-2xl my-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-white">Song Editor</h2>
            <p className="text-xs text-slate-400">Fix anything the transcription got wrong. Nothing here is final until you save.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Song title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          {transcribeAudio && (
            <div className="bg-[#171c26] border border-violet-900/60 rounded-xl p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-slate-300">
                  <span className="font-bold text-violet-300">AI lyric draft.</span> Transcribes your recording on-device, then maps words to notes.
                </div>
                <button
                  onClick={runTranscription}
                  disabled={txState === 'working'}
                  className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" /> {txState === 'working' ? 'Working...' : 'Draft lyrics from audio'}
                </button>
              </div>
              {txMsg && (
                <p className={`mt-2 text-xs ${txState === 'error' ? 'text-red-400' : 'text-slate-400'}`}>{txMsg}</p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            {(['lyrics', 'notes'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize ${
                  tab === t ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {t === 'lyrics' ? 'Lyrics by section' : `Notes (${notes.length})`}
              </button>
            ))}
            <div className="flex-1" />
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <span className="mr-1">Transpose all:</span>
              {[-12, -1, 1, 12].map((s) => (
                <button
                  key={s}
                  onClick={() => transposeAll(s)}
                  className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
                >
                  {s > 0 ? `+${s}` : s}
                </button>
              ))}
            </div>
          </div>

          {tab === 'lyrics' && (
            <div className="space-y-3">
              {sections.map((sec, si) => (
                <div key={si} className="bg-[#171c26] border border-slate-800 rounded-xl p-3.5">
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      value={sectionNames[si] ?? sec.name}
                      onChange={(e) => setSectionNames((m) => ({ ...m, [si]: e.target.value }))}
                      className="bg-transparent text-sm font-bold text-cyan-300 focus:outline-none border-b border-transparent focus:border-cyan-600 w-40"
                    />
                    <span className="text-[11px] text-slate-500">
                      notes {sec.from + 1}-{sec.to + 1} · {notes[sec.from].start.toFixed(1)}s -{' '}
                      {(notes[sec.to].start + notes[sec.to].duration).toFixed(1)}s
                    </span>
                  </div>
                  <textarea
                    value={sectionText(sec)}
                    onChange={(e) => applySectionLyrics(sec, e.target.value)}
                    rows={2}
                    placeholder="Type the lyrics for this section. Words spread across its notes in order."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {notes.slice(sec.from, sec.to + 1).map((n, i) => (
                      <span
                        key={i}
                        className={`text-[11px] px-2 py-0.5 rounded-md border ${
                          n.lyric ? 'bg-cyan-950 border-cyan-800 text-cyan-200' : 'bg-slate-900 border-slate-800 text-slate-500'
                        }`}
                      >
                        {midiToName(n.midi)}: {n.lyric || '—'}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'notes' && (
            <div className="space-y-1.5">
              <div className="grid grid-cols-[2.2rem_1fr_4.5rem_4.5rem_1fr_2rem] gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 px-1">
                <span>#</span>
                <span>Pitch</span>
                <span>Start s</span>
                <span>Len s</span>
                <span>Lyric</span>
                <span />
              </div>
              {notes.map((n, i) => (
                <div key={i} className="grid grid-cols-[2.2rem_1fr_4.5rem_4.5rem_1fr_2rem] gap-2 items-center bg-[#171c26] border border-slate-800 rounded-lg px-1 py-1">
                  <span className="text-xs text-slate-500 text-center">{i + 1}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setNote(i, { midi: clampMidi(n.midi - 1) })} className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center">
                      <ArrowDown className="w-3 h-3" />
                    </button>
                    <span className="text-xs font-bold text-white w-10 text-center">{midiToName(n.midi)}</span>
                    <button onClick={() => setNote(i, { midi: clampMidi(n.midi + 1) })} className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center">
                      <ArrowUp className="w-3 h-3" />
                    </button>
                  </div>
                  <input
                    type="number" step="0.05" min="0" value={Number(n.start.toFixed(2))}
                    onChange={(e) => setNote(i, { start: Math.max(0, parseFloat(e.target.value) || 0) })}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs text-white"
                  />
                  <input
                    type="number" step="0.05" min="0.05" value={Number(n.duration.toFixed(2))}
                    onChange={(e) => setNote(i, { duration: Math.max(0.05, parseFloat(e.target.value) || 0.5) })}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs text-white"
                  />
                  <input
                    value={n.lyric}
                    onChange={(e) => setNote(i, { lyric: e.target.value })}
                    placeholder="lyric"
                    className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs text-white"
                  />
                  <button onClick={() => deleteNote(i)} className="w-6 h-6 rounded bg-slate-800 hover:bg-red-900 text-slate-400 hover:text-red-300 flex items-center justify-center">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <button
                onClick={addNote}
                className="mt-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Add note
              </button>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-800 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-bold text-slate-200">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!title.trim() || notes.length === 0}
            className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-sm font-bold text-white flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" /> Save song
          </button>
        </div>
      </div>
    </div>
  );
}
