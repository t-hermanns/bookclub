import { err, ok, requireAdmin } from '@/lib/api';
import {
  candidateBookIds,
  determineOutcome,
  finishWithWinner,
  getActiveRound,
  pickRandomFrom
} from '@/lib/round';

export const dynamic = 'force-dynamic';

export async function POST() {
  const u = await requireAdmin();
  if (u instanceof Response) return u;
  const round = getActiveRound();
  if (!round || round.status !== 'voting_closed')
    return err('Abstimmung ist nicht geschlossen');
  const candidates = candidateBookIds(round);
  const outcome = determineOutcome(round.id, candidates);
  // Pick random among tied (or from sole winner trivially)
  const pool = outcome.winnerId ? [outcome.winnerId] : outcome.tiedIds;
  if (pool.length === 0) return err('Keine Bücher verfügbar');
  const chosen = pickRandomFrom(round.id, pool);
  finishWithWinner(round.id, chosen);
  return ok({ ok: true, winnerBookId: chosen });
}
