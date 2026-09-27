'use client';
import { useEffect, useRef, useState } from 'react';
import type { PublicBook, StateDTO } from '@/lib/state';
import type { BallotEntry } from '@/lib/voting';
import { Countdown } from './Countdown';

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
  refresh
}: {
  state: NonNullable<StateDTO['round']>;
  refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ownBookId = state.ownBook?.id ?? null;
  const isRunoff = state.isRunoff;
  const ownInRunoff = isRunoff && ownBookId !== null && state.runoffBookIds.includes(ownBookId);

  async function submit(ballot: BallotEntry[]): Promise<boolean> {
    setBusy(true);
    setError(null);
    let saved = false;
    try {
      const res = await fetch('/api/votes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // The round this card shows: if the admin has moved on (e.g. straight into a run-off),
        // the server rejects the vote instead of counting it for a round not seen yet.
        body: JSON.stringify({ roundId: state.id, ballot })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Stimme nicht gespeichert');
      saved = true;
    } catch (e: any) {
      setError(e.message);
    }
    // The selection is read back from the server (no local copy that could outlive the round);
    // after a rejected vote this also brings up the round that is open now.
    await refresh().catch(() => {});
    setBusy(false);
    return saved;
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
      {state.votesPerVoter > 1 ? (
        // Keyed by round so an unsaved allocation never carries over into another round.
        <PointsBallot key={state.id} state={state} onSave={submit} />
      ) : (
        <ul className="space-y-2">
          {state.books.map((b) => {
            const disallowOwn = b.id === ownBookId && !isRunoff;
            const selected = state.ownBallot.some((e) => e.bookId === b.id);
            return (
              <VoteRow
                key={b.id}
                book={b}
                highlighted={selected}
                dimmed={disallowOwn}
                note={disallowOwn ? 'Eigenes Buch — nicht wählbar' : null}
              >
                {!disallowOwn &&
                  (selected ? (
                    <span className="flex items-center justify-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow sm:shrink-0 sm:py-1.5">
                      ✓ Deine Stimme
                    </span>
                  ) : (
                    <button
                      className="btn-primary justify-center sm:shrink-0"
                      disabled={busy}
                      onClick={() => submit([{ bookId: b.id, points: 1 }])}
                    >
                      Abstimmen
                    </button>
                  ))}
              </VoteRow>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const SAVE_DELAY_MS = 400;

/**
 * Ballot for systems with several votes per person: +/- per book, saved automatically shortly
 * after the last click. Only a complete ballot counts, so taking a vote away again withdraws the
 * saved one until all votes are placed; moving a vote (- then +) within the delay saves once.
 */
function PointsBallot({
  state,
  onSave
}: {
  state: NonNullable<StateDTO['round']>;
  onSave: (ballot: BallotEntry[]) => Promise<boolean>;
}) {
  const total = state.votesPerVoter;
  const ownBookId = state.ownBook?.id ?? null;
  const saved = new Map(state.ownBallot.map((e) => [e.bookId, e.points]));
  // The allocation on screen while it differs from the server (unsaved or incomplete);
  // null shows the saved ballot.
  const [draft, setDraft] = useState<Map<number, number> | null>(null);
  const [pending, setPending] = useState(false);
  const current = draft ?? saved;
  const left = total - pointsOf(current);

  // The debounced save runs after renders its closure didn't see, so it works on refs.
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const latest = useRef<Map<number, number> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function change(bookId: number, delta: number) {
    const next = new Map(current);
    const n = (next.get(bookId) ?? 0) + delta;
    if (n > 0) next.set(bookId, n);
    else next.delete(bookId);
    setDraft(next);
    latest.current = next;
    setPending(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  }

  async function flush(): Promise<void> {
    timer.current = null;
    if (saving.current) return; // the running save picks up the latest change afterwards
    const next = latest.current;
    latest.current = null;
    if (!next) return setPending(false);
    const complete = pointsOf(next) === total;
    const onServer = savedRef.current;
    const unchanged = complete ? sameBallot(next, onServer) : onServer.size === 0;
    if (!unchanged) {
      saving.current = true;
      const ok = await onSave(complete ? Array.from(next, ([bookId, points]) => ({ bookId, points })) : []);
      saving.current = false;
      if (!ok) {
        latest.current = null;
        setDraft(null);
        return setPending(false);
      }
    }
    if (latest.current) return flush();
    setPending(false);
    // The server now holds this ballot: show it from there again (an incomplete one stays local).
    if (complete) setDraft((d) => (d && sameBallot(d, next) ? null : d));
  }

  return (
    <>
      <div className="banner-info">
        Du hast {total} Stimmen. Verteile sie auf die Bücher – gerne auch mehrere auf dasselbe.
        Deine Auswahl wird automatisch gespeichert.
      </div>
      <ul className="space-y-2">
        {state.books.map((b) => {
          const disallowOwn = b.id === ownBookId && !state.isRunoff;
          const n = current.get(b.id) ?? 0;
          return (
            <VoteRow
              key={b.id}
              book={b}
              highlighted={n > 0}
              dimmed={disallowOwn}
              note={disallowOwn ? 'Eigenes Buch — nicht wählbar' : null}
            >
              {!disallowOwn && (
                <div className="flex items-center gap-2 self-start sm:shrink-0 sm:self-center">
                  <button
                    className="btn-secondary h-9 w-9 px-0 py-0 text-lg"
                    aria-label={`Eine Stimme weniger für ${b.title}`}
                    disabled={n === 0}
                    onClick={() => change(b.id, -1)}
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-lg font-semibold tabular-nums">{n}</span>
                  <button
                    className="btn-secondary h-9 w-9 px-0 py-0 text-lg"
                    aria-label={`Eine Stimme mehr für ${b.title}`}
                    disabled={left === 0}
                    onClick={() => change(b.id, 1)}
                  >
                    +
                  </button>
                </div>
              )}
            </VoteRow>
          );
        })}
      </ul>
      <BallotStatus total={total} left={left} saving={pending} />
    </>
  );
}

// TEMPORARY: three looks for the status to compare (?variante=a|b|c); one stays.
function BallotStatus({ total, left, saving }: { total: number; left: number; saving: boolean }) {
  const variant =
    (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('variante')) || 'a';
  const done = left === 0;
  const text = done
    ? saving
      ? `Alle ${total} Stimmen vergeben – wird gespeichert …`
      : `Alle ${total} Stimmen vergeben`
    : `Noch ${left} ${left === 1 ? 'Stimme' : 'Stimmen'} zu vergeben`;
  const hint = done ? null : `Deine Stimmen zählen, sobald alle ${total} verteilt sind.`;
  const ok = done && !saving;

  if (variant === 'b') {
    return (
      <div
        className={
          ok
            ? 'rounded-xl border border-emerald-300/80 bg-emerald-50/90 p-3 text-sm text-emerald-900 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100'
            : 'banner-warn'
        }
      >
        <div className="font-medium">{ok ? `✓ ${text}` : text}</div>
        {hint && <div>{hint}</div>}
      </div>
    );
  }
  if (variant === 'c') {
    return (
      <div
        className={`sticky bottom-3 z-10 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur ${
          ok
            ? 'border-emerald-300 bg-emerald-50/95 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/90 dark:text-emerald-100'
            : 'border-slate-200 bg-white/95 text-slate-700 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200'
        }`}
      >
        <div className="flex shrink-0 gap-1.5" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={`h-3.5 w-3.5 rounded-full border-2 ${
                i < total - left
                  ? ok
                    ? 'border-emerald-600 bg-emerald-600'
                    : 'border-brand-600 bg-brand-600'
                  : 'border-slate-300 dark:border-slate-600'
              }`}
            />
          ))}
        </div>
        <div>
          <div className="font-medium">{ok ? `✓ ${text}` : text}</div>
          {hint && <div className="text-xs opacity-80">{hint}</div>}
        </div>
      </div>
    );
  }
  return (
    <p className={ok ? 'text-sm font-medium text-emerald-700 dark:text-emerald-400' : 'text-sm text-slate-500'}>
      {ok ? `✓ ${text}` : text}
      {hint && <span className="block text-xs">{hint}</span>}
    </p>
  );
}

function pointsOf(ballot: Map<number, number>): number {
  return Array.from(ballot.values()).reduce((sum, n) => sum + n, 0);
}

function sameBallot(a: Map<number, number>, b: Map<number, number>): boolean {
  return a.size === b.size && Array.from(a).every(([id, n]) => b.get(id) === n);
}

function VoteRow({
  book,
  highlighted,
  dimmed,
  note,
  children
}: {
  book: PublicBook;
  highlighted: boolean;
  dimmed: boolean;
  note: string | null;
  children: React.ReactNode;
}) {
  return (
    <li>
      <div
        className={`rounded-xl border p-3 transition ${
          highlighted
            ? 'border-brand-500 bg-gradient-to-br from-brand-50 to-brand-100 ring-2 ring-brand-400/40 dark:from-brand-700/30 dark:to-brand-700/10'
            : 'border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-900/50'
        } ${dimmed ? 'opacity-50' : ''}`}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <div className="font-medium">{book.title}</div>
            <div className="text-sm text-slate-500">von {book.author}</div>
            <a
              className="block break-words text-sm text-brand-600 hover:underline"
              href={book.link}
              target="_blank"
              rel="noreferrer"
            >
              {book.link}
            </a>
            {note && <div className="text-xs text-slate-500">{note}</div>}
          </div>
          {children}
        </div>
      </div>
    </li>
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
