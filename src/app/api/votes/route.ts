import { NextRequest } from 'next/server';
import { err, ok, requireUser } from '@/lib/api';
import { getDb } from '@/lib/db';
import {
  applyAutoTransitions,
  bookById,
  candidateBookIds,
  getActiveRound
} from '@/lib/round';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const u = requireUser();
  if (u instanceof Response) return u;

  let round = getActiveRound();
  round = applyAutoTransitions(round);
  if (!round) return err('Keine aktive Abstimmung');
  if (round.status !== 'voting_open' && round.status !== 'runoff_open')
    return err('Abstimmung ist nicht offen');

  const body = await req.json().catch(() => ({}));
  // The client sends the round it is showing. Optional so tabs still running an older
  // bundle keep working; when present, a vote meant for an earlier round is rejected.
  const roundId = (body as any).roundId;
  if (roundId !== undefined && Number(roundId) !== round.id)
    return err('Die Abstimmung hat inzwischen gewechselt – bitte stimme noch einmal ab.', 409);
  const bookId = Number((body as any).bookId);
  if (!Number.isInteger(bookId)) return err('Ungültige Buchwahl');

  const candidates = candidateBookIds(round);
  if (!candidates.includes(bookId)) return err('Dieses Buch steht nicht zur Wahl');

  const book = bookById(bookId);
  if (!book) return err('Buch nicht gefunden');

  // Disallow voting for own book outside run-offs.
  const isRunoff = !!round.runoff_parent_id;
  if (!isRunoff && book.submitter_name === u) {
    return err('Du kannst nicht für dein eigenes Buch stimmen');
  }

  const db = getDb();
  db.prepare(
    `INSERT INTO votes(round_id, voter_name, book_id) VALUES(?,?,?)
     ON CONFLICT(round_id, voter_name) DO UPDATE SET book_id=excluded.book_id, created_at=datetime('now')`
  ).run(round.id, u, bookId);

  // Trigger lazy auto-close check.
  applyAutoTransitions(getActiveRound());
  return ok({ ok: true });
}
