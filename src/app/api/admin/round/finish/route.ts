import { err, ok, requireAdmin } from '@/lib/api';
import {
  candidateBookIds,
  determineOutcome,
  finishWithWinner,
  getActiveRound
} from '@/lib/round';

export const dynamic = 'force-dynamic';

export async function POST() {
  const u = requireAdmin();
  if (u instanceof Response) return u;
  const round = getActiveRound();
  if (!round || round.status !== 'voting_closed')
    return err('Abstimmung ist nicht geschlossen');
  const outcome = determineOutcome(round.id, candidateBookIds(round));
  if (!outcome.winnerId) return err('Gleichstand — Stichwahl oder Zufallsauswahl nötig');
  finishWithWinner(round.id, outcome.winnerId);
  return ok({ ok: true, winnerBookId: outcome.winnerId });
}
