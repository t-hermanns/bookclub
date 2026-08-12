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
  // Disallow closing before the deadline has passed (auto-close once everyone has submitted still applies).
  if (round.suggestions_deadline && new Date(round.suggestions_deadline).getTime() > Date.now()) {
    return err('Frist ist noch nicht abgelaufen', 409);
  }
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
