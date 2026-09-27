'use client';
import type { Decision } from '@/lib/state';

/** Pill saying how the winner was determined; nothing for a plain vote. */
export function DecisionNote({ decision }: { decision: Decision }) {
  const n = decision.runoffs.length;
  let text: string | null = null;
  const after = n > 1 ? `Nach ${n} Stichwahlen` : 'Nach Stichwahl';
  if (decision.decidedBy === 'runoff') text = n > 1 ? `${after} entschieden` : 'Per Stichwahl entschieden';
  else if (decision.decidedBy === 'random')
    text = n > 0 ? `${after} per Zufall ausgewählt` : 'Gleichstand – per Zufall ausgewählt';
  if (!text) return null;
  return (
    <span className="pill mt-1 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
      {text}
    </span>
  );
}

/** Collapsible results of each run-off, shown below the first vote's results. */
export function RunoffDetails({ decision, winnerId }: { decision: Decision; winnerId: number | null }) {
  const { runoffs } = decision;
  if (runoffs.length === 0) return null;
  return (
    <div className="space-y-2">
      {runoffs.map((r, i) => (
        <details key={r.id} className="group rounded-lg border border-slate-200 dark:border-slate-800">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <span className="text-slate-400 transition-transform group-open:rotate-90">▸</span>
            {runoffs.length > 1 ? `${i + 1}. Stichwahl` : 'Stichwahl'}
            <span className="font-normal text-slate-500">({r.books.length} Bücher)</span>
          </summary>
          <ul className="divide-y divide-slate-200 border-t border-slate-200 px-3 dark:divide-slate-800 dark:border-slate-800">
            {r.books.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0 text-sm">
                  <div className="font-medium">
                    {b.title} {b.id === winnerId && <span className="text-brand-600">🏆</span>}
                  </div>
                  <div className="text-slate-500">von {b.author}</div>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {b.votes} {b.votes === 1 ? 'Stimme' : 'Stimmen'}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
