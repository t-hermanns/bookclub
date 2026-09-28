import { NextRequest } from 'next/server';
import { err, ok, requireAdmin } from '@/lib/api';
import { getActiveRound, startNewRound } from '@/lib/round';
import { resolveDeadlineHours } from '@/lib/deadline';
import { VOTING_SYSTEMS, configuredVotingSystem } from '@/lib/voting';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const u = requireAdmin();
  if (u instanceof Response) return u;
  if (getActiveRound()) return err('Es läuft bereits eine Runde');
  const body = await req.json().catch(() => ({}));
  const r = resolveDeadlineHours(body, 24 * 7);
  if ('error' in r) return err(r.error);
  const votingSystem = configuredVotingSystem();
  if (!votingSystem)
    return err(
      `VOTING_SYSTEM hat einen unbekannten Wert („${process.env.VOTING_SYSTEM}“). Erlaubt: ${Object.keys(VOTING_SYSTEMS).join(', ')}.`,
      500
    );
  const theme = typeof (body as any).theme === 'string' ? (body as any).theme.trim() : '';
  if (theme.length > 100) return err('Das Thema ist zu lang (höchstens 100 Zeichen)');
  const round = startNewRound(r.hours, votingSystem, theme || null);
  return ok({ ok: true, roundId: round.id });
}
