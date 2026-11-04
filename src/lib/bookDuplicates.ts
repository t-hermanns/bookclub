import { getDb, sqliteUtcToIso } from './db';
import { normalizeLink } from './bookLinks';
import { compareBooks, type MatchLevel, type MatchResult } from './bookMatch';
import type { Book, Round } from './round';

/**
 * Duplicate check for a submission against (a) the other books of the current suggestion round
 * and (b) the winners of finished rounds (books already read). Never reveals who submitted what.
 */

export interface DuplicateCandidate {
  title: string;
  author: string;
  link: string;
  isbn: string | null;
  workKey: string | null;
}

export interface DuplicateHit {
  level: MatchLevel;
  scope: 'current_round' | 'past_winner';
  reason: MatchResult['reason'] | 'same_link' | 'same_work';
  /** Matched book; omitted for the current round while its suggestions are still hidden. */
  title?: string;
  author?: string;
  /** When a past winner's round finished (ISO). */
  finishedAt?: string | null;
  message: string;
}

function identityMatch(c: DuplicateCandidate, b: Book): DuplicateHit['reason'] | null {
  const cn = normalizeLink(c.link);
  const bn = normalizeLink(b.link);
  if (cn && bn) {
    const ck = cn.key ?? cn.link;
    const bk = bn.key ?? bn.link;
    if (ck === bk) return 'same_link';
  }
  const cIsbn = c.isbn ?? cn?.isbn ?? null;
  const bIsbn = b.isbn ?? bn?.isbn ?? null;
  if (cIsbn && bIsbn && cIsbn === bIsbn) return 'same_link';
  if (c.workKey && b.work_key && c.workKey === b.work_key) return 'same_work';
  return null;
}

function rank(h: { level: MatchLevel; scope: DuplicateHit['scope'] }): number {
  return (h.level === 'block' ? 10 : 0) + (h.scope === 'current_round' ? 1 : 0);
}

function monthYear(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}

function message(h: Omit<DuplicateHit, 'message'>): string {
  const book = h.title ? `„${h.title}“${h.author ? ` von ${h.author}` : ''}` : null;
  if (h.scope === 'past_winner') {
    const when = monthYear(h.finishedAt);
    if (h.level === 'block')
      return `${book ?? 'Dieses Buch'} hat schon einmal gewonnen${when ? ` (${when})` : ''} – ihr habt es also schon gelesen. Bitte schlag ein anderes Buch vor.`;
    if (h.reason === 'same_author')
      return `Von ${h.author} habt ihr schon „${h.title}“ gelesen${when ? ` (${when})` : ''}. Ist das vielleicht dasselbe Buch in einer anderen Sprache oder Ausgabe?`;
    return `Meintest du ${book}? Das hat schon einmal gewonnen${when ? ` (${when})` : ''}.`;
  }
  if (h.level === 'block')
    return `${book ?? 'Dieses Buch'} wurde in dieser Runde schon vorgeschlagen. Bitte wähle ein anderes Buch.`;
  if (h.reason === 'same_author')
    return book
      ? `In dieser Runde wurde schon ${book} vorgeschlagen. Ist das vielleicht dasselbe Buch in einer anderen Sprache oder Ausgabe?`
      : 'In dieser Runde wurde schon ein Buch derselben Autorin bzw. desselben Autors vorgeschlagen. Ist das vielleicht dasselbe Buch in einer anderen Sprache oder Ausgabe?';
  return book
    ? `Meintest du ${book}? Ein sehr ähnliches Buch wurde in dieser Runde schon vorgeschlagen.`
    : 'Ein sehr ähnliches Buch wurde in dieser Runde schon vorgeschlagen.';
}

export function findDuplicate(
  c: DuplicateCandidate,
  round: Round,
  submissionRoundId: number,
  ownBookId: number | null
): DuplicateHit | null {
  const db = getDb();
  const current = db
    .prepare('SELECT * FROM books WHERE round_id=? AND id<>?')
    .all(submissionRoundId, ownBookId ?? -1) as Book[];
  const winners = db
    .prepare(
      `SELECT b.*, r.closed_at AS finished_at FROM rounds r JOIN books b ON b.id = r.winner_book_id
       WHERE r.status='finished' AND r.runoff_parent_id IS NULL AND r.id<>?`
    )
    .all(submissionRoundId) as (Book & { finished_at: string | null })[];

  // Suggestions of the current round stay hidden while it is open (see buildState).
  const revealCurrent = round.status !== 'suggestions_open';
  let best: Omit<DuplicateHit, 'message'> | null = null;
  const consider = (b: Book & { finished_at?: string | null }, scope: DuplicateHit['scope']) => {
    const id = identityMatch(c, b);
    const fuzzy = id ? null : compareBooks(c, b);
    const level: MatchLevel | null = id ? 'block' : fuzzy?.level ?? null;
    if (!level) return;
    const reveal = scope === 'past_winner' || revealCurrent;
    const hit: Omit<DuplicateHit, 'message'> = {
      level,
      scope,
      reason: id ?? fuzzy!.reason,
      ...(reveal ? { title: b.title, author: b.author } : {}),
      ...(scope === 'past_winner' ? { finishedAt: sqliteUtcToIso(b.finished_at ?? null) } : {})
    };
    // Same author / other title is the weakest signal; prefer any real title match.
    const weight = (h: Omit<DuplicateHit, 'message'>) => rank(h) * 2 + (h.reason === 'same_author' ? 0 : 1);
    if (!best || weight(hit) > weight(best)) best = hit;
  };
  for (const b of current) consider(b, 'current_round');
  for (const b of winners) consider(b, 'past_winner');
  if (!best) return null;
  const hit: Omit<DuplicateHit, 'message'> = best;
  return { ...hit, message: message(hit) };
}
