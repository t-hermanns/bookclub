export const PARTICIPANTS = [
  'Alice',
  'Bob',
  'Carol',
  'Dave',
  'Erin',
  'Frank',
  'Grace',
  'Heidi',
  'Paul',
  'Ivan',
  'Judy',
  'Kim'
] as const;

export type Participant = (typeof PARTICIPANTS)[number];

export const ADMIN_NAME: Participant = 'Alice';
export const TOTAL_PARTICIPANTS = PARTICIPANTS.length;

export function isParticipant(name: string): name is Participant {
  return (PARTICIPANTS as readonly string[]).includes(name);
}
