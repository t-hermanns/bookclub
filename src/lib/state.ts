import {
  applyAutoTransitions,
  bookById,
  candidateBookIds,
  countSubmitters,
  countVoters,
  determineOutcome,
  eligibleVoterCount,
  getActiveRound,
  getRound,
  getOwnBallot,
  getOwnBook,
  listFinishedRounds,
  listRoundBooks,
  listRunoffBookIds,
  listRunoffRounds,
  listSubmitterNames,
  listVoterNames,
  tallyVotes,
  votesPerVoter,
  type Book,
  type Round,
  type RoundStatus
} from './round';
import { ADMIN_NAME, PARTICIPANTS, TOTAL_PARTICIPANTS, type Participant } from './participants';
import { configuredVotingSystem, type BallotEntry, type VotingSystem } from './voting';

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
  /** System a round started now would use (shown to the admin); null if VOTING_SYSTEM is invalid. */
  newRoundVotingSystem: VotingSystem | null;
  round: {
    id: number;
    status: RoundStatus;
    suggestionsDeadline: string | null;
    votingDeadline: string | null;
    isRunoff: boolean;
    /** Theme of the suggestions (set when the round starts); null when there is none. */
    theme: string | null;
    votingSystem: VotingSystem;
    /** Votes each ballot must add up to (1 for 'single' and in run-offs). */
    votesPerVoter: number;
    /** Number of submissions (always visible). */
    submittedCount: number;
    /** Number of people who have voted (always visible). */
    voterCount: number;
    eligibleVoterCount: number;
    /** Participants who have submitted a book in the submission round. Anonymous which book. */
    submittedNames: string[];
    /** Participants who have cast a vote in the current round. Does not reveal which book. */
    votedNames: string[];
    books: PublicBook[];
    ownBook: { id: number; title: string; author: string; link: string } | null;
    /** The user's own ballot in this round (points per book); empty until they vote. */
    ownBallot: BallotEntry[];
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
    decision: Decision;
    votingSystem: VotingSystem;
  } | null;
}

/** How a finished round's winner was determined, with the results of every run-off it took. */
export interface Decision {
  decidedBy: 'vote' | 'runoff' | 'random';
  runoffs: { id: number; books: PublicBook[] }[];
}

/** Only for finished (top-level) suggestion rounds: run-off tallies are revealed here. */
export function decisionFor(round: Round): Decision {
  const runoffRounds = listRunoffRounds(round.id);
  const deciding = runoffRounds[runoffRounds.length - 1] ?? round;
  // The random pick isn't stored, but it's only offered on a tie: if the deciding
  // round is still tied, the winner was drawn.
  const { winnerId } = determineOutcome(deciding.id, candidateBookIds(deciding));
  const decidedBy = winnerId === null ? 'random' : runoffRounds.length > 0 ? 'runoff' : 'vote';
  const runoffs = runoffRounds.map((r) => {
    const tally = tallyVotes(r.id);
    const books = listRunoffBookIds(r.id)
      .map((id) => bookById(id))
      .filter((b): b is Book => !!b)
      .map((b) => ({ id: b.id, title: b.title, author: b.author, link: b.link, votes: tally.get(b.id) ?? 0 }))
      .sort((a, b) => b.votes - a.votes);
    return { id: r.id, books };
  });
  return { decidedBy, runoffs };
}

function lastFinished(): StateDTO['lastFinishedRound'] {
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
  return {
    id: r.id,
    closedAt: r.closed_at,
    winner,
    books,
    decision: decisionFor(r),
    votingSystem: r.voting_system
  };
}

export function buildState(user: Participant | null): StateDTO {
  // Logged-out visitors only learn that they need to log in: no round, books or names.
  if (!user) {
    return {
      user: { name: null, isAdmin: false },
      totalParticipants: TOTAL_PARTICIPANTS,
      newRoundVotingSystem: configuredVotingSystem(),
      round: null,
      lastFinishedRound: null
    };
  }
  const isAdmin = user === ADMIN_NAME;
  let round: Round | null = getActiveRound();
  round = applyAutoTransitions(round);
  if (!round) {
    return {
      user: { name: user, isAdmin },
      totalParticipants: TOTAL_PARTICIPANTS,
      newRoundVotingSystem: configuredVotingSystem(),
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
  const showVotes = round.status === 'voting_closed' || round.status === 'finished';
  const tally = showVotes ? tallyVotes(round.id) : null;

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
  if (round.status === 'voting_closed') {
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
  // The theme belongs to the suggestion round; run-offs are child rounds without one.
  const theme = (isRunoff ? getRound(submissionRoundId)?.theme : round.theme) ?? null;
  const ownBook = getOwnBook(submissionRoundId, user);
  const ownBallot = getOwnBallot(round.id, user);

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
    newRoundVotingSystem: configuredVotingSystem(),
    round: {
      id: round.id,
      status: round.status,
      suggestionsDeadline: round.suggestions_deadline,
      votingDeadline: round.voting_deadline,
      isRunoff,
      theme,
      votingSystem: round.voting_system,
      votesPerVoter: votesPerVoter(round),
      submittedCount: countSubmitters(submissionRoundId),
      voterCount: countVoters(round.id),
      eligibleVoterCount: eligibleVoterCount(round),
      submittedNames,
      votedNames,
      books: publicBooks,
      ownBook: ownBook
        ? { id: ownBook.id, title: ownBook.title, author: ownBook.author, link: ownBook.link }
        : null,
      ownBallot,
      canVoteOwnBook: isRunoff,
      winner,
      tied,
      runoffBookIds: isRunoff ? listRunoffBookIds(round.id) : []
    },
    lastFinishedRound: null
  };
}
