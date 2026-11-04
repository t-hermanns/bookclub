import { NextRequest } from 'next/server';
import { err, ok, requireUser } from '@/lib/api';
import { searchBooks } from '@/lib/bookSearch';

export const dynamic = 'force-dynamic';

/** Free-text book search for the submission form. Nothing is stored here. */
export async function GET(req: NextRequest) {
  const u = await requireUser();
  if (u instanceof Response) return u;

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (q.length < 2 || q.length > 200) return err('Bitte mindestens zwei Zeichen eingeben');
  return ok({ hits: await searchBooks(q) });
}
