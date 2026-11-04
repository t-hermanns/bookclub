import { getDb, sqliteUtcToIso } from './db';
import { normalizeLink } from './bookLinks';
import { isExactlySameBook, isSameWork, isSimilarBook, type BookIdentity } from './bookMatch';
import type { Book } from './round';

/**
 * Duplicate check for a submission against (a) the other books of the current suggestion round
 * and (b) the winners of finished rounds (books already read). Certainly the same book → blocked,
 * without naming it. Possibly the same book → the user sees it with its link and decides, which
 * deliberately reveals that one book even while suggestions are hidden. The submitter of another
 * book is never revealed.
 */

export interface DuplicateCandidate {
  title: string;
  author: string;
  link: string;
  isbn: string | null;
  identity: BookIdentity | null;
}

export interface PossibleDuplicate {
  title: string;
  author: string;
  link: string;
  /** Where the book comes from, ready to show. */
  origin: string;
}

export type DuplicateCheck =
  | { level: 'block'; message: string }
  | { level: 'possible'; matches: PossibleDuplicate[] }
  | null;

const BLOCK_CURRENT_ROUND = 'Dieses Buch wurde in dieser Runde schon vorgeschlagen. Bitte wähle ein anderes Buch.';
const BLOCK_PAST_WINNER = 'Dieses Buch hat schon einmal gewonnen – ihr habt es also schon gelesen. Bitte schlag ein anderes Buch vor.';

export function parseIdentity(raw: string | null): BookIdentity | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BookIdentity;
  } catch {
    return null;
  }
}

function isCertainlySame(c: DuplicateCandidate, b: Book): boolean {
  const cn = normalizeLink(c.link);
  const bn = normalizeLink(b.link);
  if (cn && bn && (cn.key ?? cn.link) === (bn.key ?? bn.link)) return true;
  const cIsbn = c.isbn ?? cn?.isbn ?? null;
  const bIsbn = b.isbn ?? bn?.isbn ?? null;
  if (cIsbn && cIsbn === bIsbn) return true;
  return isExactlySameBook(c, b);
}

function monthYear(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}

export function findDuplicate(c: DuplicateCandidate, submissionRoundId: number, ownBookId: number | null): DuplicateCheck {
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

  if (current.some((b) => isCertainlySame(c, b))) return { level: 'block', message: BLOCK_CURRENT_ROUND };
  if (winners.some((b) => isCertainlySame(c, b))) return { level: 'block', message: BLOCK_PAST_WINNER };

  const possiblySame = (b: Book) =>
    isSimilarBook(c, b) || isSameWork(c, { title: b.title, author: b.author, identity: parseIdentity(b.identity) });
  const show = (b: Book, origin: string): PossibleDuplicate => ({ title: b.title, author: b.author, link: b.link, origin });
  const matches = [
    ...current.filter(possiblySame).map((b) => show(b, 'In dieser Runde vorgeschlagen')),
    ...winners.filter(possiblySame).map((b) => {
      const when = monthYear(sqliteUtcToIso(b.finished_at));
      return show(b, `Schon gelesen${when ? ` (${when})` : ''}`);
    })
  ];
  return matches.length ? { level: 'possible', matches } : null;
}
