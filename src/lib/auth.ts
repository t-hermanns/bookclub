import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import { adminName, isParticipant, type Participant } from './participants';

const COOKIE_NAME = 'bc_session';
const DEV_SECRET = 'dev-insecure-secret-change-me';

// Well-known placeholders (dev default, .env.example). Production refuses them like a missing
// value: whoever knows the secret can forge a session for any name, including the admin.
const PLACEHOLDERS = new Set([
  DEV_SECRET,
  'change-me',
  'please-change-me',
  'please-change-me-to-a-long-random-string'
]);

let secret: string | null = null;

// Resolved on first use rather than at import time, so `next build` works without it.
function getSecret(): string {
  if (secret) return secret;
  const s = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production' && (!s || PLACEHOLDERS.has(s))) {
    throw new Error(
      'SESSION_SECRET is not set or a placeholder. Set your own random value in production (e.g. `openssl rand -hex 32`).'
    );
  }
  secret = s || DEV_SECRET;
  return secret;
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
}

/** Constant-time comparison; hashing first means differing lengths don't short-circuit either. */
function safeEqual(a: string, b: string): boolean {
  const h = (s: string) => crypto.createHash('sha256').update(s).digest();
  return crypto.timingSafeEqual(h(a), h(b));
}

export function makeToken(name: Participant): string {
  const payload = JSON.stringify({ name, t: Date.now() });
  const b64 = Buffer.from(payload).toString('base64url');
  return `${b64}.${sign(b64)}`;
}

export function verifyToken(token: string | undefined | null): Participant | null {
  if (!token) return null;
  const [b64, sig] = token.split('.');
  if (!b64 || !sig) return null;
  if (!safeEqual(sign(b64), sig)) return null;
  try {
    const obj = JSON.parse(Buffer.from(b64, 'base64url').toString());
    if (typeof obj.name === 'string' && isParticipant(obj.name)) return obj.name;
  } catch {}
  return null;
}

/**
 * The admin password has no default. Production refuses a missing or placeholder value (like
 * SESSION_SECRET); elsewhere a missing one just means the admin can't log in.
 */
function getAdminPassword(): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  const production = process.env.NODE_ENV === 'production';
  if (pw && !(production && PLACEHOLDERS.has(pw))) return pw;
  if (production) throw new Error('ADMIN_PASSWORD is not set or a placeholder.');
  return null;
}

export function adminPasswordConfigured(): boolean {
  return getAdminPassword() !== null;
}

export function checkAdminPassword(pw: string): boolean {
  const expected = getAdminPassword();
  return expected !== null && safeEqual(pw, expected);
}

export async function getCurrentUser(): Promise<Participant | null> {
  const c = (await cookies()).get(COOKIE_NAME);
  return verifyToken(c?.value);
}

export function isAdmin(name: Participant | null): boolean {
  return name !== null && name === adminName();
}

export async function setSessionCookie(name: Participant) {
  (await cookies()).set(COOKIE_NAME, makeToken(name), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365 * 5
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(COOKIE_NAME);
}
