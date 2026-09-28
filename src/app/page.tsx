'use client';
import { useCallback } from 'react';
import { Header } from '@/components/Header';
import { LoginScreen } from '@/components/LoginScreen';
import { useAppState } from '@/components/useAppState';
import { AdminBar } from '@/components/AdminBar';
import { BooksList, ResultCard, SubmissionCard, VotingCard } from '@/components/StageCards';
import { ParticipationRoster } from '@/components/ParticipationRoster';
import { DecisionNote, RunoffDetails } from '@/components/Decision';
import type { Decision } from '@/lib/state';
import { votingSystemLabel } from '@/lib/voting';

export default function Home() {
  const { state, refresh } = useAppState();

  const onLoggedIn = useCallback(() => {
    refresh();
  }, [refresh]);

  if (!state) {
    return <div className="p-8 text-center text-slate-500">Lädt …</div>;
  }

  if (!state.user.name) {
    return (
      <>
        <Header userName={null} isAdmin={false} />
        <LoginScreen onLoggedIn={onLoggedIn} />
      </>
    );
  }

  const round = state.round;
  const last = state.lastFinishedRound;
  return (
    <>
      <Header userName={state.user.name} isAdmin={state.user.isAdmin} />
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:py-8">
        <StatusBanner state={state} />

        {!round && last && (
          <>
            <div className="card">
              <div className="text-sm text-slate-500">
                Letzte abgeschlossene Runde · {votingSystemLabel(last.votingSystem)}
              </div>
              <ResultCardInline winner={last.winner} />
              <DecisionNote decision={last.decision} />
            </div>
            <BooksListInline books={last.books} winnerId={last.winner?.id ?? null} decision={last.decision} />
          </>
        )}

        {!round && !last && !state.user.isAdmin && (
          <div className="card">
            Aktuell läuft keine Runde. Sobald der Diktator eine startet, kannst du hier einreichen.
          </div>
        )}

        {round?.status === 'suggestions_open' && (
          <>
            <ThemeBanner theme={round.theme} />
            <SubmissionCard state={round} refresh={refresh} />
            <ParticipationRoster doneNames={round.submittedNames} title="Wer hat eingereicht?" />
          </>
        )}

        {round?.status === 'suggestions_closed' && (
          <>
            <ThemeBanner theme={round.theme} />
            <BooksList state={round} showVotes={false} />
            <SubmissionCard state={round} refresh={refresh} />
          </>
        )}

        {(round?.status === 'voting_open' || round?.status === 'runoff_open') && (
          <>
            <VotingCard state={round} refresh={refresh} />
            <ParticipationRoster doneNames={round.votedNames} title="Wer hat abgestimmt?" />
          </>
        )}

        {round?.status === 'voting_closed' && (
          <>
            <ResultCard state={round} />
            <BooksList state={round} showVotes />
          </>
        )}

        <AdminBar state={state} refresh={refresh} />
      </main>
    </>
  );
}

function ResultCardInline({ winner }: { winner: { title: string; author: string; link: string; submitter?: string; votes?: number } | null }) {
  if (!winner) return null;
  return (
    <div className="space-y-1">
      <h2 className="text-lg font-semibold">🏆 Gewinner</h2>
      <div className="text-xl font-bold">{winner.title}</div>
      <div className="text-slate-500">von {winner.author}</div>
      <a className="block break-words text-brand-600 hover:underline" href={winner.link} target="_blank" rel="noreferrer">
        {winner.link}
      </a>
      {winner.submitter && (
        <div className="text-sm text-slate-500">Vorgeschlagen von {winner.submitter}</div>
      )}
    </div>
  );
}

function BooksListInline({
  books,
  winnerId,
  decision
}: {
  books: { id: number; title: string; author: string; link: string; submitter?: string; votes?: number }[];
  winnerId: number | null;
  decision: Decision;
}) {
  if (books.length === 0) return null;
  return (
    <div className="card space-y-2">
      <h2 className="text-lg font-semibold">Alle Vorschläge der Runde</h2>
      {decision.runoffs.length > 0 && (
        <div className="text-sm font-medium text-slate-500">Erste Abstimmung</div>
      )}
      <ul className="divide-y divide-slate-200 dark:divide-slate-800">
        {books.map((b) => (
          <li key={b.id} className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0">
              <div className="font-medium">
                {b.title} {b.id === winnerId && <span className="text-brand-600">🏆</span>}
              </div>
              <div className="text-sm text-slate-500">
                von {b.author}
                {b.submitter && <> · vorgeschlagen von {b.submitter}</>}
              </div>
              <a className="block break-words text-sm text-brand-600 hover:underline" href={b.link} target="_blank" rel="noreferrer">
                {b.link}
              </a>
            </div>
            {typeof b.votes === 'number' && (
              <span className="shrink-0 rounded-full bg-brand-100 px-3 py-1 text-sm font-semibold text-brand-700 dark:bg-brand-700/30 dark:text-brand-100">
                {b.votes}
              </span>
            )}
          </li>
        ))}
      </ul>
      <RunoffDetails decision={decision} winnerId={winnerId} />
    </div>
  );
}

/** The round's theme for the suggestions, if the admin set one. */
function ThemeBanner({ theme }: { theme: string | null }) {
  if (!theme) return null;
  return (
    <div className="card">
      <div className="text-sm text-slate-500">Thema dieser Runde</div>
      <div className="mt-0.5 break-words text-xl font-semibold">{theme}</div>
    </div>
  );
}

function StatusBanner({ state }: { state: ReturnType<typeof useAppState>['state'] }) {
  if (!state || !state.round) return null;
  const r = state.round;
  const labels: Record<string, string> = {
    suggestions_open: 'Buchvorschläge laufen',
    suggestions_closed: 'Vorschläge abgeschlossen — warte auf Abstimmung',
    voting_open: 'Abstimmung läuft',
    runoff_open: 'Stichwahl läuft',
    voting_closed: 'Abstimmung beendet',
    finished: 'Runde beendet'
  };
  const dot: Record<string, string> = {
    suggestions_open: 'bg-blue-500',
    suggestions_closed: 'bg-indigo-500',
    voting_open: 'bg-emerald-500',
    runoff_open: 'bg-amber-500',
    voting_closed: 'bg-slate-500',
    finished: 'bg-emerald-600'
  };
  return (
    <div className="card animate-pop">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className={`stage-dot ${dot[r.status] ?? 'bg-slate-400'} shadow-[0_0_0_4px_rgba(0,0,0,0.04)]`} />
        {labels[r.status] ?? r.status}
      </div>
      {/* Aligned with the label above (dot 0.625rem + gap 0.5rem). */}
      <div className="mt-0.5 pl-[1.125rem] text-xs text-slate-500">
        {r.isRunoff ? 'Stichwahl · 1 Stimme pro Person' : votingSystemLabel(r.votingSystem)}
      </div>
    </div>
  );
}
