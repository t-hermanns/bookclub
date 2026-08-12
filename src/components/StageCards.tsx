'use client';
import { useState } from 'react';
import type { StateDTO } from '@/lib/state';
import { Countdown, fmtDate } from './Countdown';

export function SubmissionCard({
  state,
  refresh
}: {
  state: NonNullable<StateDTO['round']>;
  refresh: () => void;
}) {
  const [title, setTitle] = useState(state.ownBook?.title ?? '');
  const [author, setAuthor] = useState(state.ownBook?.author ?? '');
  const [link, setLink] = useState(state.ownBook?.link ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const editable =
    state.status === 'suggestions_open' || state.status === 'suggestions_closed';

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/books', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, author, link })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Speichern fehlgeschlagen');
      setSavedAt(Date.now());
      refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="text-lg font-semibold">Dein Buchvorschlag</h2>
        <span className="text-sm text-slate-500">
          {state.suggestionsDeadline && state.status === 'suggestions_open' && (
            <Countdown deadline={state.suggestionsDeadline} />
          )}
        </span>
      </div>
      {state.status === 'suggestions_closed' && (
        <div className="banner-info">
          Vorschläge sind geschlossen. Du kannst deinen Vorschlag aber noch korrigieren,
          bis die Abstimmung startet.
        </div>
      )}
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Titel</label>
          <input className="input" value={title} disabled={!editable} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Autor:in</label>
          <input className="input" value={author} disabled={!editable} onChange={(e) => setAuthor(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Link</label>
          <input
            className="input"
            type="url"
            placeholder="https://…"
            value={link}
            disabled={!editable}
            onChange={(e) => setLink(e.target.value)}
          />
        </div>
        {error && <div className="banner-warn">{error}</div>}
        {editable && (
          <div className="flex items-center gap-3">
            <button className="btn-primary" onClick={save} disabled={busy || !title || !author || !link}>
              {state.ownBook ? 'Aktualisieren' : 'Einreichen'}
            </button>
            {savedAt && <span className="text-sm text-slate-500">Gespeichert ✓</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export function BooksList({
  state,
  showVotes
}: {
  state: NonNullable<StateDTO['round']>;
  showVotes: boolean;
}) {
  if (state.books.length === 0) return null;
  return (
    <div className="card animate-pop space-y-3">
      <h2 className="text-lg font-semibold">
        {state.isRunoff ? 'Bücher in der Stichwahl' : 'Eingereichte Bücher'}
      </h2>
      <ul className="divide-y divide-slate-200 dark:divide-slate-800">
        {state.books.map((b) => (
          <li key={b.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <div className="min-w-0">
              <div className="font-medium">{b.title}</div>
              <div className="text-sm text-slate-500">von {b.author}</div>
              <a
                className="block break-words text-sm text-brand-600 hover:underline"
                href={b.link}
                target="_blank"
                rel="noreferrer"
              >
                {b.link}
              </a>
              {b.submitter && (
                <div className="text-xs text-slate-500">Vorgeschlagen von {b.submitter}</div>
              )}
            </div>
            {showVotes && typeof b.votes === 'number' && (
              <span className="self-start rounded-full bg-brand-100 px-3 py-1 text-sm font-semibold text-brand-700 dark:bg-brand-700/30 dark:text-brand-100">
                {b.votes} {b.votes === 1 ? 'Stimme' : 'Stimmen'}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function VotingCard({
  state,
  userName,
  refresh
}: {
  state: NonNullable<StateDTO['round']>;
  userName: string;
  refresh: () => void;
}) {
  const [chosen, setChosen] = useState<number | null>(state.ownVoteBookId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ownBookId = state.ownBook?.id ?? null;
  const isRunoff = state.isRunoff;
  const ownInRunoff = isRunoff && ownBookId !== null && state.runoffBookIds.includes(ownBookId);

  async function vote(bookId: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/votes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bookId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Stimme nicht gespeichert');
      setChosen(bookId);
      refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="text-lg font-semibold">{isRunoff ? 'Stichwahl' : 'Abstimmung'}</h2>
        <span className="text-sm text-slate-500">
          {state.votingDeadline && <Countdown deadline={state.votingDeadline} />}
        </span>
      </div>
      {isRunoff && ownInRunoff && (
        <div className="banner-info">
          In der Stichwahl darfst du auch für dein eigenes Buch stimmen.
        </div>
      )}
      {error && <div className="banner-warn">{error}</div>}
      <ul className="space-y-2">
        {state.books.map((b) => {
          const isOwn = b.id === ownBookId;
          const disallowOwn = isOwn && !isRunoff;
          const selected = chosen === b.id;
          return (
            <li key={b.id}>
              <div
                className={`rounded-xl border p-3 transition ${
                  selected
                    ? 'border-brand-500 bg-gradient-to-br from-brand-50 to-brand-100 ring-2 ring-brand-400/40 dark:from-brand-700/30 dark:to-brand-700/10'
                    : 'border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-900/50'
                } ${disallowOwn ? 'opacity-50' : ''}`}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{b.title}</div>
                    <div className="text-sm text-slate-500">von {b.author}</div>
                    <a
                      className="block break-words text-sm text-brand-600 hover:underline"
                      href={b.link}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {b.link}
                    </a>
                    {disallowOwn && (
                      <div className="text-xs text-slate-500">
                        Eigenes Buch — nicht wählbar (außer in Stichwahl)
                      </div>
                    )}
                  </div>
                  {!disallowOwn &&
                    (selected ? (
                      <span className="flex items-center justify-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow sm:shrink-0 sm:py-1.5">
                        ✓ Deine Stimme
                      </span>
                    ) : (
                      <button
                        className="btn-primary justify-center sm:shrink-0"
                        disabled={busy}
                        onClick={() => vote(b.id)}
                      >
                        Abstimmen
                      </button>
                    ))}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ResultCard({ state }: { state: NonNullable<StateDTO['round']> }) {
  if (state.winner) {
    return (
      <div className="card animate-pop overflow-hidden border-brand-200 bg-gradient-to-br from-brand-500/10 via-pink-500/5 to-transparent dark:border-brand-700/40">
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-200">
          🏆 Gewinner
        </div>
        <div className="mt-2 text-2xl font-bold">{state.winner.title}</div>
        <div className="text-slate-500">von {state.winner.author}</div>
        <a className="mt-1 block break-words text-brand-600 hover:underline" href={state.winner.link} target="_blank" rel="noreferrer">
          {state.winner.link}
        </a>
        {typeof state.winner.votes === 'number' && (
          <div className="mt-2 text-sm text-slate-500">
            mit {state.winner.votes} {state.winner.votes === 1 ? 'Stimme' : 'Stimmen'}
          </div>
        )}
        {state.winner.submitter && (
          <div className="text-sm text-slate-500">Vorgeschlagen von {state.winner.submitter}</div>
        )}
      </div>
    );
  }
  if (state.tied.length > 0) {
    return (
      <div className="card animate-pop space-y-2 border-amber-300 bg-amber-50/70 dark:border-amber-700/50 dark:bg-amber-950/30">
        <h2 className="text-lg font-semibold">⚖️ Gleichstand</h2>
        <p className="text-sm text-amber-900 dark:text-amber-200">
          {state.tied.length} Bücher haben gleich viele Stimmen. Der Diktator entscheidet, ob eine
          Stichwahl gestartet oder zufällig ausgewählt wird.
        </p>
        <ul className="list-inside list-disc text-sm">
          {state.tied.map((b) => (
            <li key={b.id}>
              <strong>{b.title}</strong> — {b.votes} Stimmen
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return null;
}
