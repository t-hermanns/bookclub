import { NextRequest } from 'next/server';
import { err, ok, requireUser } from '@/lib/api';
import { getDb } from '@/lib/db';
import { applyAutoTransitions, getActiveRound, getOwnBook } from '@/lib/round';

export const dynamic = 'force-dynamic';

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function validUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const u = requireUser();
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
  const link = clean((body as any).link);
  if (!title || !author || !link) return err('Titel, Autor und Link sind erforderlich');
  if (!validUrl(link)) return err('Link muss eine gültige http(s)-URL sein');
  if (title.length > 200 || author.length > 200 || link.length > 1000)
    return err('Eingabe zu lang');

  const db = getDb();
  const existing = getOwnBook(submissionRoundId, u);
  if (existing) {
    db.prepare(
      "UPDATE books SET title=?, author=?, link=?, updated_at=datetime('now') WHERE id=?"
    ).run(title, author, link, existing.id);
    return ok({ ok: true, id: existing.id, updated: true });
  }
  const res = db
    .prepare(
      'INSERT INTO books(round_id, title, author, link, submitter_name) VALUES(?,?,?,?,?)'
    )
    .run(submissionRoundId, title, author, link, u);
  return ok({ ok: true, id: Number(res.lastInsertRowid), created: true });
}
