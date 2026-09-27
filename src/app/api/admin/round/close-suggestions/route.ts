import { NextRequest } from 'next/server';
import { err, ok, requireAdmin } from '@/lib/api';
import { TOTAL_PARTICIPANTS } from '@/lib/participants';
import {
  applyAutoTransitions,
  closeSuggestions,
  countSubmitters,
  getActiveRound
} from '@/lib/round';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const u = requireAdmin();
  if (u instanceof Response) return u;
  let round = getActiveRound();
  round = applyAutoTransitions(round);
  if (!round || round.status !== 'suggestions_open')
    return err('Vorschläge sind nicht offen');
  // The admin may close at any time: the deadline is informational only and never closes a stage;
  // an incomplete tally still needs force=true as a confirmation.
  const body = await req.json().catch(() => ({}));
  const force = !!(body as any).force;
  const submitted = countSubmitters(round.id);
  if (submitted < TOTAL_PARTICIPANTS && !force) {
    return err(
      `Nur ${submitted}/${TOTAL_PARTICIPANTS} haben eingereicht. Bitte mit force=true bestätigen.`,
      409
    );
  }
  closeSuggestions(round.id);
  return ok({ ok: true });
}
