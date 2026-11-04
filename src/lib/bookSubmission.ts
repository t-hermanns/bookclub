import { findDuplicate, parseIdentity, type DuplicateCheck } from './bookDuplicates';
import { normalizeIsbn, normalizeLink } from './bookLinks';
import type { BookIdentity } from './bookMatch';
import { findIdentity } from './bookSearch';
import { applyAutoTransitions, getActiveRound, getOwnBook, type Book } from './round';

/** Everything the check and the save of a submission share; the save only adds the write. */
export interface PreparedSubmission {
  submissionRoundId: number;
  existing: Book | null | undefined;
  title: string;
  author: string;
  link: string;
  isbn: string | null;
  identity: BookIdentity | null;
  duplicate: DuplicateCheck;
}

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Validates a submission and checks it for duplicates. Returns an error message if it's invalid. */
export async function prepareSubmission(body: any, user: string): Promise<PreparedSubmission | string> {
  const round = applyAutoTransitions(getActiveRound());
  if (!round) return 'Keine aktive Runde';
  const submissionRoundId = round.runoff_parent_id ?? round.id;
  // Edits allowed during suggestions_open and suggestions_closed only.
  if (round.status !== 'suggestions_open' && round.status !== 'suggestions_closed') {
    return 'Einreichungen sind aktuell nicht möglich';
  }

  const title = clean(body?.title);
  const author = clean(body?.author);
  const rawLink = clean(body?.link);
  if (!title || !author || !rawLink) return 'Titel, Autor und Link sind erforderlich';
  // Store the cleaned link (tracking/ref parameters stripped, shop links canonical).
  const normalized = normalizeLink(rawLink);
  if (!normalized) return 'Link muss eine gültige http(s)-URL sein';
  const link = normalized.link;
  if (title.length > 200 || author.length > 200 || link.length > 1000) return 'Eingabe zu lang';

  const existing = getOwnBook(submissionRoundId, user);
  const unchanged = existing && existing.title === title && existing.author === author && existing.link === link;
  const isbn = normalized.isbn ?? normalizeIsbn(body?.isbn) ?? (unchanged ? existing.isbn : null);

  // An unchanged own book was there first; never block re-saving it, and keep what's stored.
  if (unchanged) {
    return { submissionRoundId, existing, title, author, link, isbn, identity: parseIdentity(existing.identity), duplicate: null };
  }

  const identity = await findIdentity({ title, author, isbn });
  const pickedWorkKey = clean(body?.workKey);
  if (/^\/works\/OL\d+W$/.test(pickedWorkKey) && !identity.workKeys.includes(pickedWorkKey)) {
    identity.workKeys = [...identity.workKeys, pickedWorkKey];
  }
  const duplicate = findDuplicate({ title, author, link, isbn, identity }, submissionRoundId, existing?.id ?? null);
  return { submissionRoundId, existing, title, author, link, isbn, identity, duplicate };
}
