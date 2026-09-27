import { ok, requireUser } from '@/lib/api';
import { bookById, listFinishedRounds, listRoundBooks, tallyVotes } from '@/lib/round';
import { decisionFor } from '@/lib/state';

export const dynamic = 'force-dynamic';

export async function GET() {
  const u = requireUser();
  if (u instanceof Response) return u;
  // Run-offs are shown inside their original round (see decisionFor), not as entries of their own.
  const rounds = listFinishedRounds().filter((r) => !r.runoff_parent_id);
  const data = rounds.map((r) => {
    const tally = tallyVotes(r.id);
    return {
      id: r.id,
      closedAt: r.closed_at,
      winner: r.winner_book_id ? publicizeBook(r.winner_book_id, tally) : null,
      books: listRoundBooks(r.id).map((b) => ({
        id: b.id,
        title: b.title,
        author: b.author,
        link: b.link,
        submitter: b.submitter_name,
        votes: tally.get(b.id) ?? 0
      })),
      decision: decisionFor(r)
    };
  });
  return ok({ rounds: data });
}

function publicizeBook(id: number, tally: Map<number, number>) {
  const b = bookById(id);
  if (!b) return null;
  return {
    id: b.id,
    title: b.title,
    author: b.author,
    link: b.link,
    submitter: b.submitter_name,
    votes: tally.get(b.id) ?? 0
  };
}
