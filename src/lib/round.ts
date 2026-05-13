import { getDb } from './db';
import { PARTICIPANTS, TOTAL_PARTICIPANTS, type Participant } from './participants';

export type RoundStatus =
  | 'idle'
  | 'suggestions_open'
  | 'suggestions_closed'
  | 'voting_open'
  | 'voting_closed'
  | 'runoff_open'
  | 'tied_random_pending'
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

export interface Vote {
  id: number;
  round_id: number;
  voter_name: string;
  book_id: number;
  created_at: string;
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

export function listVotes(roundId: number): Vote[] {
  return getDb().prepare('SELECT * FROM votes WHERE round_id=?').all(roundId) as Vote[];
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
    getDb().prepare('SELECT COUNT(*) AS c FROM votes WHERE round_id=?').get(roundId) as {
      c: number;
    }
  ).c;
}

export function tallyVotes(roundId: number): Map<number, number> {
  const rows = getDb()
    .prepare('SELECT book_id, COUNT(*) AS c FROM votes WHERE round_id=? GROUP BY book_id')
    .all(roundId) as { book_id: number; c: number }[];
  return new Map(rows.map((r) => [r.book_id, r.c]));
}

/** Eligible voters for a round: for the original voting all 11; for run-off rounds also all 11. */
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

export function getOwnVote(roundId: number, name: Participant): Vote | null {
  return (
    (getDb()
      .prepare('SELECT * FROM votes WHERE round_id=? AND voter_name=?')
      .get(roundId, name) as Vote | undefined) ?? null
  );
}

/* ============================================================
 * Lifecycle transitions
 * ============================================================ */

export function startNewRound(deadlineHours: number): Round {
  const db = getDb();
  const deadline = isoFromHours(deadlineHours);
  const result = db
    .prepare(
      `INSERT INTO rounds(status, suggestions_deadline) VALUES('suggestions_open', ?)`
    )
    .run(deadline);
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
  const result = db
    .prepare(
      `INSERT INTO rounds(status, voting_deadline, runoff_parent_id) VALUES('runoff_open', ?, ?)`
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
  const db = getDb();
  const now = "datetime('now')";
  // Mark this round finished
  db.prepare(
    `UPDATE rounds SET status='finished', winner_book_id=?, closed_at=${now} WHERE id=?`
  ).run(bookId, roundId);
  // Walk up parent chain and finish all of them with the same winner
  let cur = getRound(roundId);
  while (cur && cur.runoff_parent_id) {
    const parent = getRound(cur.runoff_parent_id);
    if (!parent) break;
    db.prepare(
      `UPDATE rounds SET status='finished', winner_book_id=?, closed_at=${now} WHERE id=?`
    ).run(bookId, parent.id);
    cur = parent;
  }
  setActiveRoundId(null);
}

export function markTiedRandomPending(roundId: number) {
  getDb()
    .prepare("UPDATE rounds SET status='tied_random_pending' WHERE id=?")
    .run(roundId);
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
      const isRunoff = !!round.runoff_parent_id;
      getDb()
        .prepare(
          `UPDATE rounds SET status=? WHERE id=?`
        )
        .run(isRunoff ? 'voting_closed' : 'voting_closed', round.id);
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

export function listFinishedRounds(): Round[] {
  return getDb()
    .prepare("SELECT * FROM rounds WHERE status='finished' ORDER BY closed_at DESC")
    .all() as Round[];
}

export function bookById(id: number): Book | null {
  return (
    (getDb().prepare('SELECT * FROM books WHERE id=?').get(id) as Book | undefined) ?? null
  );
}

export { PARTICIPANTS };
