/**
 * Voting systems. The system for new rounds comes from VOTING_SYSTEM; each round stores the one it
 * was started with (`rounds.voting_system`), so switching it never affects a round already running,
 * and older rounds keep 'single'. Run-offs always use 'single'.
 *
 * Every system is a ballot of points per book that must add up to `votesPerVoter`; tallies are the
 * sum of points. Plain constants, so client components can import the labels too.
 */
export const VOTING_SYSTEMS = {
  single: { votesPerVoter: 1, label: '1 Stimme pro Person' },
  three_votes: { votesPerVoter: 3, label: '3 Stimmen pro Person' }
} as const;

export type VotingSystem = keyof typeof VOTING_SYSTEMS;

export const DEFAULT_VOTING_SYSTEM: VotingSystem = 'single';

export function isVotingSystem(s: string): s is VotingSystem {
  return Object.prototype.hasOwnProperty.call(VOTING_SYSTEMS, s);
}

/** Server only: the system new rounds start with, or null if VOTING_SYSTEM holds an unknown value. */
export function configuredVotingSystem(): VotingSystem | null {
  const v = process.env.VOTING_SYSTEM?.trim() || DEFAULT_VOTING_SYSTEM;
  return isVotingSystem(v) ? v : null;
}

export function votingSystemLabel(system: string): string {
  return isVotingSystem(system) ? VOTING_SYSTEMS[system].label : system;
}

export interface BallotEntry {
  bookId: number;
  points: number;
}
