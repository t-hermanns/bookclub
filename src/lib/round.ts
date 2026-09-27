import { getDb } from './db';
import { TOTAL_PARTICIPANTS, type Participant } from './participants';
import { VOTING_SYSTEMS, type BallotEntry, type VotingSystem } from './voting';

export type RoundStatus =
  | 'suggestions_open'
  | 'suggestions_closed'
  | 'voting_open'
  | 'voting_closed'
  | 'runoff_open'
  | 'finished';

export interface Round {
  id: number;
  status: RoundStatus;
  suggestions_deadline: string | null;
  voting_deadline: string | null;
  runoff_parent_id: number | null;
  created_at: string;
  closed_at: string | null;
  winner_book_id: number | null;
  voting_system: VotingSystem;
}

export interface Book {
  id: number;
  round_id: number;
  title: string;
  author: string;
  link: string;
  submitter_name: string;
  created_at: string;
  updated_at: string;
}

const ACTIVE_KEY = 'active_round_id';

export function getActiveRoundId(): number | null {
  const row = getDb()
    .prepare("SELECT value FROM app_state WHERE key = ?")
    .get(ACTIVE_KEY) as { value: string } | undefined;
  return row ? Number(row.value) : null;
}

export function setActiveRoundId(id: number | null) {
  const db = getDb();
  if (id === null) db.prepare('DELETE FROM app_state WHERE key = ?').run(ACTIVE_KEY);
  else
    db.prepare(
      'INSERT INTO app_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
    ).run(ACTIVE_KEY, String(id));
}

export function getRound(id: number): Round | null {
  return (getDb().prepare('SELECT * FROM rounds WHERE id=?').get(id) as Round | undefined) ?? null;
}

export function getActiveRound(): Round | null {
  const id = getActiveRoundId();
  return id ? getRound(id) : null;
}

export function listRoundBooks(roundId: number): Book[] {
  return getDb().prepare('SELECT * FROM books WHERE round_id=? ORDER BY id').all(roundId) as Book[];
}

export function listRunoffBookIds(roundId: number): number[] {
  return (
    getDb().prepare('SELECT book_id FROM runoff_books WHERE round_id=?').all(roundId) as {
      book_id: number;
    }[]
  ).map((r) => r.book_id);
}

export function countSubmitters(roundId: number): number {
  return (
    getDb().prepare('SELECT COUNT(*) AS c FROM books WHERE round_id=?').get(roundId) as {
      c: number;
    }
  ).c;
}

export function countVoters(roundId: number): number {
  return (
    getDb().prepare('SELECT COUNT(DISTINCT voter_name) AS c FROM votes WHERE round_id=?').get(roundId) as {
      c: number;
    }
  ).c;
}

/** Names of participants who have submitted a book in the given round. */
export function listSubmitterNames(roundId: number): string[] {
  return (
    getDb()
      .prepare('SELECT submitter_name FROM books WHERE round_id=? ORDER BY id')
      .all(roundId) as { submitter_name: string }[]
  ).map((r) => r.submitter_name);
}

/** Names of participants who have cast a vote in the given round. Does NOT reveal which book. */
export function listVoterNames(roundId: number): string[] {
  return (
    getDb()
      .prepare('SELECT DISTINCT voter_name FROM votes WHERE round_id=?')
      .all(roundId) as { voter_name: string }[]
  ).map((r) => r.voter_name);
}

/** Votes per book: the sum of the points every voter gave it. */
export function tallyVotes(roundId: number): Map<number, number> {
  const rows = getDb()
    .prepare('SELECT book_id, SUM(points) AS c FROM votes WHERE round_id=? GROUP BY book_id')
    .all(roundId) as { book_id: number; c: number }[];
  return new Map(rows.map((r) => [r.book_id, r.c]));
}

/** Eligible voters for a round: all participants, both for the original voting and for run-offs. */
export function eligibleVoterCount(_round: Round): number {
  return TOTAL_PARTICIPANTS;
}

export function getOwnBook(roundId: number, name: Participant): Book | null {
  return (
    (getDb()
      .prepare('SELECT * FROM books WHERE round_id=? AND submitter_name=?')
      .get(roundId, name) as Book | undefined) ?? null
  );
}

/** Votes a ballot must add up to in this round (run-offs are always 'single'). */
export function votesPerVoter(round: Round): number {
  return VOTING_SYSTEMS[round.voting_system]?.votesPerVoter ?? 1;
}

export function getOwnBallot(roundId: number, name: Participant): BallotEntry[] {
  return getDb()
    .prepare('SELECT book_id AS bookId, points FROM votes WHERE round_id=? AND voter_name=? ORDER BY book_id')
    .all(roundId, name) as BallotEntry[];
}

/** Replace the voter's whole ballot. Callers validate it against the round first. */
export function castBallot(roundId: number, name: Participant, ballot: BallotEntry[]) {
  const db = getDb();
  const del = db.prepare('DELETE FROM votes WHERE round_id=? AND voter_name=?');
  const ins = db.prepare('INSERT INTO votes(round_id, voter_name, book_id, points) VALUES(?,?,?,?)');
  db.transaction(() => {
    del.run(roundId, name);
    for (const e of ballot) ins.run(roundId, name, e.bookId, e.points);
  })();
}

/* ============================================================
 * Lifecycle transitions
 * ============================================================ */

export function startNewRound(deadlineHours: number, votingSystem: VotingSystem): Round {
  const db = getDb();
  const deadline = isoFromHours(deadlineHours);
  const result = db
    .prepare(
      `INSERT INTO rounds(status, suggestions_deadline, voting_system) VALUES('suggestions_open', ?, ?)`
    )
    .run(deadline, votingSystem);
  const id = Number(result.lastInsertRowid);
  setActiveRoundId(id);
  return getRound(id)!;
}

export function closeSuggestions(roundId: number) {
  const db = getDb();
  db.prepare("UPDATE rounds SET status='suggestions_closed' WHERE id=? AND status='suggestions_open'").run(roundId);
}

export function startVoting(roundId: number, deadlineHours: number) {
  const db = getDb();
  const deadline = isoFromHours(deadlineHours);
  db.prepare(
    "UPDATE rounds SET status='voting_open', voting_deadline=? WHERE id=? AND status='suggestions_closed'"
  ).run(deadline, roundId);
}

export function closeVoting(roundId: number) {
  const db = getDb();
  db.prepare(
    "UPDATE rounds SET status='voting_closed' WHERE id=? AND status IN ('voting_open','runoff_open')"
  ).run(roundId);
}

/** Determine winner or tied book ids of the given (closed) voting round limited to candidate book ids. */
export function determineOutcome(
  roundId: number,
  candidateBookIds: number[]
): { winnerId: number | null; tiedIds: number[]; counts: Map<number, number> } {
  const tally = tallyVotes(roundId);
  const counts = new Map<number, number>();
  for (const id of candidateBookIds) counts.set(id, tally.get(id) ?? 0);
  let max = -1;
  for (const c of counts.values()) if (c > max) max = c;
  const top = candidateBookIds.filter((id) => (counts.get(id) ?? 0) === max);
  if (top.length === 1) return { winnerId: top[0], tiedIds: [], counts };
  return { winnerId: null, tiedIds: top, counts };
}

/** Candidate books for a round: run-off rounds use runoff_books; otherwise all submitted books of that round. */
export function candidateBookIds(round: Round): number[] {
  if (round.runoff_parent_id) return listRunoffBookIds(round.id);
  return listRoundBooks(round.id).map((b) => b.id);
}

/** Start a run-off as a child round. Books are referenced (not duplicated) via runoff_books. */
export function startRunoff(parentRoundId: number, bookIds: number[], deadlineHours: number): Round {
  const db = getDb();
  const parent = getRound(parentRoundId);
  if (!parent) throw new Error('Parent round not found');
  const deadline = isoFromHours(deadlineHours);
  // Find the original suggestion round (the one with the books). For chained runoffs, walk up.
  let suggestionRoundId = parent.id;
  let cur: Round | null = parent;
  while (cur && cur.runoff_parent_id) {
    cur = getRound(cur.runoff_parent_id);
    if (cur) suggestionRoundId = cur.id;
  }
  // Run-offs are always a simple majority (one vote each), whatever system the main vote used.
  const result = db
    .prepare(
      `INSERT INTO rounds(status, voting_deadline, runoff_parent_id, voting_system) VALUES('runoff_open', ?, ?, 'single')`
    )
    .run(deadline, suggestionRoundId);
  const id = Number(result.lastInsertRowid);
  const insertRb = db.prepare('INSERT INTO runoff_books(round_id, book_id) VALUES(?,?)');
  const tx = db.transaction((ids: number[]) => ids.forEach((b) => insertRb.run(id, b)));
  tx(bookIds);
  setActiveRoundId(id);
  return getRound(id)!;
}

export function finishWithWinner(roundId: number, bookId: number) {
  const round = getRound(roundId);
  if (!round) throw new Error('Round not found');
  // Every run-off points at the original suggestion round, so finishing that round together
  // with all of its run-offs also covers earlier run-offs in a chain (run-off of a run-off).
  const suggestionRoundId = round.runoff_parent_id ?? round.id;
  getDb()
    .prepare(
      `UPDATE rounds SET status='finished', winner_book_id=?, closed_at=datetime('now')
       WHERE id=? OR runoff_parent_id=?`
    )
    .run(bookId, suggestionRoundId, suggestionRoundId);
  setActiveRoundId(null);
}

export function pickRandomFrom(roundId: number, bookIds: number[]): number {
  if (bookIds.length === 0) throw new Error('No books to pick from');
  const idx = Math.floor(Math.random() * bookIds.length);
  return bookIds[idx];
}

/* ============================================================
 * Lazy auto-close (called by GET /api/state)
 * ============================================================ */

export function applyAutoTransitions(round: Round | null): Round | null {
  if (!round) return round;
  // Auto-close suggestions when all participants have submitted.
  if (round.status === 'suggestions_open') {
    if (countSubmitters(round.id) >= TOTAL_PARTICIPANTS) {
      closeSuggestions(round.id);
      return getRound(round.id);
    }
  }
  // Auto-close voting (or run-off) when all eligible voters have voted.
  if (round.status === 'voting_open' || round.status === 'runoff_open') {
    if (countVoters(round.id) >= eligibleVoterCount(round)) {
      closeVoting(round.id);
      return getRound(round.id);
    }
  }
  return round;
}

/* ============================================================
 * Helpers
 * ============================================================ */

function isoFromHours(hours: number): string {
  const ms = Date.now() + hours * 3600 * 1000;
  return new Date(ms).toISOString();
}

/** Run-off rounds of a suggestion round, oldest first. Every run-off points at the original suggestion round. */
export function listRunoffRounds(suggestionRoundId: number): Round[] {
  return getDb()
    .prepare('SELECT * FROM rounds WHERE runoff_parent_id=? ORDER BY id')
    .all(suggestionRoundId) as Round[];
}

export function listFinishedRounds(): Round[] {
  return getDb()
    .prepare("SELECT * FROM rounds WHERE status='finished' ORDER BY closed_at DESC, id DESC")
    .all() as Round[];
}

export function bookById(id: number): Book | null {
  return (
    (getDb().prepare('SELECT * FROM books WHERE id=?').get(id) as Book | undefined) ?? null
  );
}
