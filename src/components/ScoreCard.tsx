// End-of-song practice report card.
import { X, RotateCcw, Trophy } from 'lucide-react';

export interface ScoreReport {
  songTitle: string;
  score: number; // 0-100
  pctInTune: number;
  avgCents: number;
  voicedSeconds: number;
  bestNote: string | null;
  worstNote: string | null;
  isBest: boolean;
}

function grade(score: number): string {
  if (score >= 90) return 'S';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

const GRADE_COLOR: Record<string, string> = {
  S: 'text-amber-300 border-amber-400',
  A: 'text-emerald-300 border-emerald-400',
  B: 'text-cyan-300 border-cyan-400',
  C: 'text-yellow-300 border-yellow-400',
  D: 'text-orange-300 border-orange-400',
  F: 'text-red-300 border-red-400',
};

export default function ScoreCard({ report, onRetry, onClose }: { report: ScoreReport; onRetry: () => void; onClose: () => void }) {
  const g = grade(report.score);
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3" onClick={onClose}>
      <div
        className="w-full max-w-md bg-[#141821] border border-slate-700 rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-black text-white">Practice Report</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-5 flex flex-col items-center text-center">
          <div className={`w-20 h-20 rounded-2xl border-2 ${GRADE_COLOR[g]} flex items-center justify-center text-4xl font-black bg-slate-900`}>
            {g}
          </div>
          <div className="mt-2 text-2xl font-black text-white">{report.score}<span className="text-sm text-slate-400">/100</span></div>
          <div className="text-xs text-slate-400">{report.songTitle}</div>
          {report.isBest && (
            <div className="mt-2 px-2.5 py-1 rounded-full bg-amber-950 border border-amber-800/60 text-amber-300 text-xs font-bold flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5" /> New personal best
            </div>
          )}
          <div className="mt-4 w-full grid grid-cols-2 gap-2 text-left">
            <div className="bg-[#171c26] border border-slate-800 rounded-xl p-3">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Time in tune</div>
              <div className="text-xl font-black text-emerald-300">{report.pctInTune}%</div>
            </div>
            <div className="bg-[#171c26] border border-slate-800 rounded-xl p-3">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Avg pitch drift</div>
              <div className="text-xl font-black text-cyan-300">±{report.avgCents}¢</div>
            </div>
            <div className="bg-[#171c26] border border-slate-800 rounded-xl p-3">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Strongest note</div>
              <div className="text-xl font-black text-white">{report.bestNote ?? '—'}</div>
            </div>
            <div className="bg-[#171c26] border border-slate-800 rounded-xl p-3">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Work on</div>
              <div className="text-xl font-black text-white">{report.worstNote ?? '—'}</div>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            Scored on your raw voice against the target notes. The tuner still held you on pitch the whole way.
          </p>
        </div>
        <div className="px-5 py-4 border-t border-slate-800 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-bold text-slate-200">
            Done
          </button>
          <button onClick={onRetry} className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-sm font-bold text-white flex items-center gap-1.5">
            <RotateCcw className="w-4 h-4" /> Practice again
          </button>
        </div>
      </div>
    </div>
  );
}
