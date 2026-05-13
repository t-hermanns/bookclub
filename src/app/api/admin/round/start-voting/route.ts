import { NextRequest } from 'next/server';
import { err, ok, requireAdmin } from '@/lib/api';
import { countSubmitters, getActiveRound, startVoting } from '@/lib/round';
import { resolveDeadlineHours } from '@/lib/deadline';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const u = requireAdmin();
  if (u instanceof Response) return u;
  const round = getActiveRound();
  if (!round || round.status !== 'suggestions_closed')
    return err('Vorschläge sind nicht abgeschlossen');
  if (countSubmitters(round.id) < 2)
    return err('Mindestens zwei Bücher werden benötigt');
  const body = await req.json().catch(() => ({}));
  const r = resolveDeadlineHours(body, 24);
  if ('error' in r) return err(r.error);
  startVoting(round.id, r.hours);
  return ok({ ok: true });
}
