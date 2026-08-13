'use client';
import { PARTICIPANTS } from '@/lib/participants';

/**
 * Standalone card listing every participant with a green check (has acted) or a
 * red cross (still outstanding). It never reveals *what* was submitted or *how*
 * someone voted — only who has participated.
 */
export function ParticipationRoster({
  doneNames,
  title
}: {
  doneNames: string[];
  title: string;
}) {
  const done = new Set(doneNames);
  return (
    <div className="card space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {PARTICIPANTS.map((n) => {
          const ok = done.has(n);
          return (
            <li
              key={n}
              className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800"
            >
              <span
                className={
                  ok
                    ? 'w-4 text-center font-semibold text-emerald-600 dark:text-emerald-400'
                    : 'w-4 text-center font-semibold text-red-500 dark:text-red-400'
                }
                aria-label={ok ? 'erledigt' : 'ausstehend'}
              >
                {ok ? '✓' : '✗'}
              </span>
              <span className={ok ? 'text-sm' : 'text-sm text-slate-500'}>{n}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
