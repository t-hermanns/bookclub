import { NextRequest } from 'next/server';
import { err, ok, requireAdmin } from '@/lib/api';
import {
  candidateBookIds,
  determineOutcome,
  getActiveRound,
  startRunoff
} from '@/lib/round';
import { resolveDeadlineHours } from '@/lib/deadline';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const u = await requireAdmin();
  if (u instanceof Response) return u;
  const round = getActiveRound();
  if (!round || round.status !== 'voting_closed')
    return err('Abstimmung ist nicht geschlossen');
  const body = await req.json().catch(() => ({}));
  const r = resolveDeadlineHours(body, 8);
  if ('error' in r) return err(r.error);

  const candidates = candidateBookIds(round);
  const outcome = determineOutcome(round.id, candidates);
  let bookIds: number[] = Array.isArray((body as any).bookIds)
    ? ((body as any).bookIds as unknown[]).map((x) => Number(x)).filter(Number.isInteger)
    : outcome.tiedIds;
  bookIds = bookIds.filter((id) => candidates.includes(id));
  if (bookIds.length < 2) return err('Stichwahl benötigt mindestens zwei Bücher');
  if (outcome.tiedIds.length === 0) return err('Es gab keinen Gleichstand');
  if (outcome.tiedIds.length === candidates.length && candidates.length > 1) {
    return err('Alle verbleibenden Bücher sind gleichauf — nur Zufallsauswahl möglich', 409);
  }

  const newRound = startRunoff(round.id, bookIds, r.hours);
  return ok({ ok: true, roundId: newRound.id });
}
