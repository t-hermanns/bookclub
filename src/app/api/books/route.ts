import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { err, ok, requireUser } from '@/lib/api';
import { getDb } from '@/lib/db';
import { findDuplicate } from '@/lib/bookDuplicates';
import { normalizeIsbn, normalizeLink } from '@/lib/bookLinks';
import { findWorkKey } from '@/lib/bookLookup';
import { applyAutoTransitions, getActiveRound, getOwnBook } from '@/lib/round';

export const dynamic = 'force-dynamic';

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export async function POST(req: NextRequest) {
  const u = await requireUser();
  if (u instanceof Response) return u;

  let round = getActiveRound();
  round = applyAutoTransitions(round);
  if (!round) return err('Keine aktive Runde');
  const submissionRoundId = round.runoff_parent_id ?? round.id;
  // Edits allowed during suggestions_open and suggestions_closed only.
  if (round.status !== 'suggestions_open' && round.status !== 'suggestions_closed') {
    return err('Einreichungen sind aktuell nicht möglich');
  }

  const body = await req.json().catch(() => ({}));
  const title = clean((body as any).title);
  const author = clean((body as any).author);
  const rawLink = clean((body as any).link);
  const confirmDuplicate = (body as any).confirmDuplicate === true;
  if (!title || !author || !rawLink) return err('Titel, Autor und Link sind erforderlich');
  // Store the cleaned link (tracking/ref parameters stripped, shop links canonical).
  const normalized = normalizeLink(rawLink);
  if (!normalized) return err('Link muss eine gültige http(s)-URL sein');
  const link = normalized.link;
  if (title.length > 200 || author.length > 200 || link.length > 1000)
    return err('Eingabe zu lang');

  const existing = getOwnBook(submissionRoundId, u);
  const isbn = normalized.isbn ?? normalizeIsbn((body as any).isbn);
  // Language-independent work identity (catches the same book in German and English). Reuse
  // the stored one when the own book is unchanged, to avoid a lookup on every save.
  const unchanged =
    existing && existing.title === title && existing.author === author && existing.link === link;
  const workKey = unchanged ? existing.work_key : await findWorkKey({ title, author, isbn });

  // An unchanged own book was there first; never block re-saving it.
  const duplicate = unchanged ? null : findDuplicate(
    { title, author, link, isbn, workKey },
    round,
    submissionRoundId,
    existing?.id ?? null
  );
  if (duplicate && (duplicate.level === 'block' || !confirmDuplicate)) {
    return ok(
      { error: duplicate.message, duplicate, needsConfirm: duplicate.level === 'warn' },
      { status: 409 }
    );
  }

  const db = getDb();
  if (existing) {
    db.prepare(
      "UPDATE books SET title=?, author=?, link=?, isbn=?, work_key=?, updated_at=datetime('now') WHERE id=?"
    ).run(title, author, link, isbn, workKey, existing.id);
    return ok({ ok: true, id: existing.id, updated: true, link });
  }
  // Assign a random (non-sequential) id so the id never reveals submission order.
  const insert = db.prepare(
    'INSERT INTO books(id, round_id, title, author, link, submitter_name, isbn, work_key) VALUES(?,?,?,?,?,?,?,?)'
  );
  for (let attempt = 0; ; attempt++) {
    const id = crypto.randomInt(1, 2_147_483_647);
    try {
      insert.run(id, submissionRoundId, title, author, link, u, isbn, workKey);
      return ok({ ok: true, id, created: true, link });
    } catch (e: any) {
      // Retry only on the (astronomically unlikely) id collision.
      if (e?.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' && attempt < 10) continue;
      throw e;
    }
  }
}
