/**
 * Participants and the admin come from the environment, never from the code:
 * PARTICIPANTS is a comma-separated list of names, ADMIN_NAME must be one of them.
 * Read on first use (not at import time) so `next build` works without them.
 */
export type Participant = string;

interface ParticipantConfig {
  names: string[];
  admin: string;
}

let cached: ParticipantConfig | null = null;

function load(): ParticipantConfig {
  const names = (process.env.PARTICIPANTS ?? '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
  const admin = process.env.ADMIN_NAME?.trim() ?? '';
  if (names.length === 0) {
    throw new Error('PARTICIPANTS is not set: a comma-separated list of names (see .env.example).');
  }
  if (new Set(names).size !== names.length) throw new Error('PARTICIPANTS lists a name twice.');
  if (!names.includes(admin)) throw new Error('ADMIN_NAME must be set to one of the names in PARTICIPANTS.');
  return { names, admin };
}

function config(): ParticipantConfig {
  return (cached ??= load());
}

/** All participants in their configured order (used for the login list and the rosters). */
export function participants(): readonly Participant[] {
  return config().names;
}

export function adminName(): Participant {
  return config().admin;
}

export function totalParticipants(): number {
  return config().names.length;
}

export function isParticipant(name: string): boolean {
  return config().names.includes(name);
}
