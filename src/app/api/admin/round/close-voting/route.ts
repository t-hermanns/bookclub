import { NextRequest } from 'next/server';
import { err, ok, requireAdmin } from '@/lib/api';
import {
  applyAutoTransitions,
  closeVoting,
  countVoters,
  eligibleVoterCount,
  getActiveRound
} from '@/lib/round';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const u = await requireAdmin();
  if (u instanceof Response) return u;
  let round = getActiveRound();
  round = applyAutoTransitions(round);
  if (!round) return err('Keine Abstimmung aktiv');
  if (round.status !== 'voting_open' && round.status !== 'runoff_open')
    return err('Abstimmung ist nicht offen');
  // The admin may close at any time: the deadline is informational only and never closes a stage;
  // an incomplete tally still needs force=true as a confirmation.
  const body = await req.json().catch(() => ({}));
  const force = !!(body as any).force;
  const eligible = eligibleVoterCount(round);
  const voted = countVoters(round.id);
  if (voted < eligible && !force) {
    return err(
      `Nur ${voted}/${eligible} haben abgestimmt. Bitte mit force=true bestätigen.`,
      409
    );
  }
  closeVoting(round.id);
  return ok({ ok: true });
}
