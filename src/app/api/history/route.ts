import { ok, requireUser } from '@/lib/api';
import { bookById, listFinishedRounds, listRoundBooks, tallyVotes } from '@/lib/round';

export const dynamic = 'force-dynamic';

export async function GET() {
  const u = requireUser();
  if (u instanceof Response) return u;
  const rounds = listFinishedRounds();
  const data = rounds.map((r) => {
    const books = r.runoff_parent_id ? [] : listRoundBooks(r.id);
    const tally = tallyVotes(r.id);
    return {
      id: r.id,
      closedAt: r.closed_at,
      isRunoff: !!r.runoff_parent_id,
      winner: r.winner_book_id ? publicizeBook(r.winner_book_id, tally) : null,
      books: books.map((b) => ({
        id: b.id,
        title: b.title,
        author: b.author,
        link: b.link,
        submitter: b.submitter_name,
        votes: tally.get(b.id) ?? 0
      }))
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
