import {
  applyAutoTransitions,
  bookById,
  candidateBookIds,
  countSubmitters,
  countVoters,
  determineOutcome,
  eligibleVoterCount,
  getActiveRound,
  getOwnBook,
  getOwnVote,
  listRoundBooks,
  listRunoffBookIds,
  listSubmitterNames,
  listVoterNames,
  type Book,
  type Round,
  type RoundStatus
} from './round';
import { ADMIN_NAME, PARTICIPANTS, type Participant } from './participants';
import { TOTAL_PARTICIPANTS } from './participants';

export interface PublicBook {
  id: number;
  title: string;
  author: string;
  link: string;
  votes?: number;
  submitter?: string; // only revealed when round is finished
}

export interface StateDTO {
  user: { name: Participant | null; isAdmin: boolean };
  totalParticipants: number;
  round: {
    id: number;
    status: RoundStatus;
    suggestionsDeadline: string | null;
    votingDeadline: string | null;
    isRunoff: boolean;
    /** Number of submissions (always visible). */
    submittedCount: number;
    /** Number of votes cast (always visible). */
    voterCount: number;
    eligibleVoterCount: number;
    /** Participants who have submitted a book in the submission round. Anonymous which book. */
    submittedNames: string[];
    /** Participants who have cast a vote in the current round. Does not reveal which book. */
    votedNames: string[];
    /** Has the (current) stage's deadline passed? */
    deadlinePassed: boolean;
    books: PublicBook[];
    ownBook: { id: number; title: string; author: string; link: string } | null;
    ownVoteBookId: number | null;
    canVoteOwnBook: boolean; // true in run-offs
    winner: PublicBook | null;
    tied: PublicBook[]; // when voting_closed/tied
    runoffBookIds: number[];
  } | null;
  lastFinishedRound: {
    id: number;
    closedAt: string | null;
    winner: PublicBook | null;
    books: PublicBook[];
  } | null;
}

function lastFinished(): StateDTO['lastFinishedRound'] {
  const { listFinishedRounds, listRoundBooks, tallyVotes, bookById } = require('./round') as typeof import('./round');
  const rounds = listFinishedRounds().filter((r) => !r.runoff_parent_id);
  const r = rounds[0];
  if (!r) return null;
  const tally = tallyVotes(r.id);
  const books = listRoundBooks(r.id).map((b) => ({
    id: b.id,
    title: b.title,
    author: b.author,
    link: b.link,
    submitter: b.submitter_name,
    votes: tally.get(b.id) ?? 0
  }));
  let winner: PublicBook | null = null;
  if (r.winner_book_id) {
    const w = bookById(r.winner_book_id);
    if (w)
      winner = {
        id: w.id,
        title: w.title,
        author: w.author,
        link: w.link,
        submitter: w.submitter_name,
        votes: tally.get(w.id) ?? 0
      };
  }
  return { id: r.id, closedAt: r.closed_at, winner, books };
}

export function buildState(user: Participant | null): StateDTO {
  const isAdmin = user === ADMIN_NAME;
  let round: Round | null = getActiveRound();
  round = applyAutoTransitions(round);
  if (!round) {
    return {
      user: { name: user, isAdmin },
      totalParticipants: TOTAL_PARTICIPANTS,
      round: null,
      lastFinishedRound: lastFinished()
    };
  }
  const isRunoff = !!round.runoff_parent_id;
  const candidates = candidateBookIds(round);
  const allBooks = isRunoff
    ? candidates.map((id) => bookById(id)).filter((b): b is Book => !!b)
    : listRoundBooks(round.id);

  const showBooks = round.status !== 'suggestions_open';
  const showVotes = round.status === 'voting_closed' || round.status === 'tied_random_pending' || round.status === 'finished';
  const tally = showVotes ? countsByBook(round.id) : null;

  let publicBooks: PublicBook[] = [];
  if (showBooks) {
    publicBooks = allBooks.map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      link: b.link,
      votes: tally ? tally.get(b.id) ?? 0 : undefined
    }));
  }

  // Submitter info: only after the (top-level) round is finished do we reveal.
  // For runoff children: reveal once the runoff itself finishes.
  if (round.status === 'finished') {
    publicBooks = publicBooks.map((pb) => {
      const src = allBooks.find((b) => b.id === pb.id);
      return src ? { ...pb, submitter: src.submitter_name } : pb;
    });
  }

  let winner: PublicBook | null = null;
  let tied: PublicBook[] = [];
  if (round.status === 'voting_closed' || round.status === 'tied_random_pending') {
    const outcome = determineOutcome(round.id, candidates);
    if (outcome.winnerId) {
      const b = bookById(outcome.winnerId);
      if (b) winner = { id: b.id, title: b.title, author: b.author, link: b.link, votes: outcome.counts.get(b.id) };
    } else {
      tied = outcome.tiedIds.map((id) => {
        const b = bookById(id)!;
        return { id: b.id, title: b.title, author: b.author, link: b.link, votes: outcome.counts.get(b.id) };
      });
    }
  } else if (round.status === 'finished' && round.winner_book_id) {
    const b = bookById(round.winner_book_id);
    if (b)
      winner = {
        id: b.id,
        title: b.title,
        author: b.author,
        link: b.link,
        votes: tally?.get(b.id),
        submitter: b.submitter_name
      };
  }

  // Own-book ownership: own book lives in the suggestion round (the parent for runoffs).
  const submissionRoundId = round.runoff_parent_id ?? round.id;
  const ownBook = user ? getOwnBook(submissionRoundId, user) : null;
  const ownVote = user ? getOwnVote(round.id, user) : null;

  const now = Date.now();
  const activeDeadline =
    round.status === 'suggestions_open'
      ? round.suggestions_deadline
      : round.status === 'voting_open' || round.status === 'runoff_open'
      ? round.voting_deadline
      : null;
  const deadlinePassed = activeDeadline ? new Date(activeDeadline).getTime() <= now : true;

  // Participation is always visible by name (who has acted), but never linked to a
  // specific book or vote — that stays hidden per the rules above. Emit the names in a
  // fixed participant order (NOT submission order) so the arrays can't be index-matched
  // against the books list to reveal who submitted which book.
  const submittedSet = new Set(listSubmitterNames(submissionRoundId));
  const votedSet = new Set(listVoterNames(round.id));
  const submittedNames = PARTICIPANTS.filter((p) => submittedSet.has(p));
  const votedNames = PARTICIPANTS.filter((p) => votedSet.has(p));

  return {
    user: { name: user, isAdmin },
    totalParticipants: TOTAL_PARTICIPANTS,
    round: {
      id: round.id,
      status: round.status,
      suggestionsDeadline: round.suggestions_deadline,
      votingDeadline: round.voting_deadline,
      isRunoff,
      submittedCount: countSubmitters(submissionRoundId),
      voterCount: countVoters(round.id),
      eligibleVoterCount: eligibleVoterCount(round),
      submittedNames,
      votedNames,
      deadlinePassed,
      books: publicBooks,
      ownBook: ownBook
        ? { id: ownBook.id, title: ownBook.title, author: ownBook.author, link: ownBook.link }
        : null,
      ownVoteBookId: ownVote?.book_id ?? null,
      canVoteOwnBook: isRunoff,
      winner,
      tied,
      runoffBookIds: isRunoff ? listRunoffBookIds(round.id) : []
    },
    lastFinishedRound: null
  };
}

function countsByBook(roundId: number): Map<number, number> {
  const { tallyVotes } = require('./round') as typeof import('./round');
  return tallyVotes(roundId);
}
