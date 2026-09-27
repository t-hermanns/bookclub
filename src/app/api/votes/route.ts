import { NextRequest } from 'next/server';
import { err, ok, requireUser } from '@/lib/api';
import {
  applyAutoTransitions,
  bookById,
  candidateBookIds,
  castBallot,
  getActiveRound,
  votesPerVoter
} from '@/lib/round';
import type { BallotEntry } from '@/lib/voting';

export const dynamic = 'force-dynamic';

/** `{ ballot: [{ bookId, points }] }`, or the single-vote form `{ bookId }` (one point). */
function parseBallot(body: any): BallotEntry[] | null {
  if (Array.isArray(body?.ballot)) {
    const entries = (body.ballot as any[]).map((e) => ({
      bookId: Number(e?.bookId),
      points: Number(e?.points)
    }));
    const valid = entries.every((e) => Number.isInteger(e.bookId) && Number.isInteger(e.points) && e.points > 0);
    const distinct = new Set(entries.map((e) => e.bookId)).size === entries.length;
    return valid && distinct ? entries : null;
  }
  const bookId = Number(body?.bookId);
  return Number.isInteger(bookId) ? [{ bookId, points: 1 }] : null;
}

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

  const ballot = parseBallot(body);
  if (!ballot) return err('Ungültige Buchwahl');
  // An empty ballot withdraws the voter's votes: the multi-vote ballot saves as you click and
  // only a complete ballot counts, so taking a vote away again withdraws the saved one.
  if (ballot.length === 0) {
    castBallot(round.id, u, []);
    return ok({ ok: true });
  }
  const needed = votesPerVoter(round);
  const total = ballot.reduce((sum, e) => sum + e.points, 0);
  if (total !== needed)
    return err(needed === 1 ? 'Ungültige Buchwahl' : `Bitte vergib genau ${needed} Stimmen.`);

  const candidates = candidateBookIds(round);
  const isRunoff = !!round.runoff_parent_id;
  for (const { bookId } of ballot) {
    if (!candidates.includes(bookId)) return err('Dieses Buch steht nicht zur Wahl');
    const book = bookById(bookId);
    if (!book) return err('Buch nicht gefunden');
    // Disallow voting for own book outside run-offs.
    if (!isRunoff && book.submitter_name === u) {
      return err('Du kannst nicht für dein eigenes Buch stimmen');
    }
  }

  castBallot(round.id, u, ballot);

  // Trigger lazy auto-close check.
  applyAutoTransitions(getActiveRound());
  return ok({ ok: true });
}
