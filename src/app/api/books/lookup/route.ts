import { NextRequest } from 'next/server';
import { err, ok, requireUser } from '@/lib/api';
import { findDuplicate } from '@/lib/bookDuplicates';
import { normalizeLink } from '@/lib/bookLinks';
import { lookupBook, resolveShortLink } from '@/lib/bookLookup';
import { applyAutoTransitions, getActiveRound, getOwnBook } from '@/lib/round';

export const dynamic = 'force-dynamic';

/**
 * Cleans a pasted book link and reads title/author from the shop page. Also reports a duplicate
 * early, so the user sees it right after pasting. Nothing is stored here.
 */
export async function POST(req: NextRequest) {
  const u = await requireUser();
  if (u instanceof Response) return u;

  const body = await req.json().catch(() => ({}));
  const raw = typeof (body as any).link === 'string' ? (body as any).link.trim() : '';
  if (!raw || raw.length > 2000) return err('Bitte einen Link einfügen');

  const resolved = await resolveShortLink(raw);
  const n = normalizeLink(resolved);
  if (!n) return err('Das sieht nicht nach einem gültigen Link aus');

  const found = n.source ? await lookupBook(n) : null;
  const title = found?.title ?? null;
  const author = found?.author ?? null;

  let duplicate = null;
  const round = applyAutoTransitions(getActiveRound());
  if (round) {
    const submissionRoundId = round.runoff_parent_id ?? round.id;
    const own = getOwnBook(submissionRoundId, u);
    duplicate = findDuplicate(
      { title: title ?? '', author: author ?? '', link: n.link, isbn: found?.isbn ?? n.isbn, workKey: null },
      round,
      submissionRoundId,
      own?.id ?? null
    );
  }

  return ok({
    link: n.link,
    source: n.source,
    supported: n.source !== null,
    found: !!(title && author),
    title,
    author,
    duplicate
  });
}
