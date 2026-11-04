import { NextRequest } from 'next/server';
import { err, ok, requireUser } from '@/lib/api';
import { prepareSubmission } from '@/lib/bookSubmission';

export const dynamic = 'force-dynamic';

/** Duplicate check for the submission form, which unlocks submitting. Nothing is stored here. */
export async function POST(req: NextRequest) {
  const u = await requireUser();
  if (u instanceof Response) return u;

  const prepared = await prepareSubmission(await req.json().catch(() => ({})), u);
  if (typeof prepared === 'string') return err(prepared);
  return ok({ duplicate: prepared.duplicate });
}
