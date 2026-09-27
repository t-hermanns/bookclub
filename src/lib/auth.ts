import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import { ADMIN_NAME, isParticipant, type Participant } from './participants';

const COOKIE_NAME = 'bc_session';
const DEV_SECRET = 'dev-insecure-secret-change-me';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'change-me';

// Well-known placeholders (dev default, docker-compose.yml / .env.example examples).
// Anyone who knows the secret can forge a session for any name, including the admin.
const PLACEHOLDER_SECRETS = new Set([
  DEV_SECRET,
  'please-change-me',
  'please-change-me-to-a-long-random-string'
]);

let secret: string | null = null;

// Resolved on first use rather than at import time, so `next build` works without it.
function getSecret(): string {
  if (secret) return secret;
  const s = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production' && (!s || PLACEHOLDER_SECRETS.has(s))) {
    throw new Error(
      'SESSION_SECRET ist nicht gesetzt oder ein Platzhalter. In Produktion einen eigenen Zufallswert setzen (z. B. `openssl rand -hex 32`).'
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

export function checkAdminPassword(pw: string): boolean {
  return safeEqual(pw, ADMIN_PASSWORD);
}

export function getCurrentUser(): Participant | null {
  const c = cookies().get(COOKIE_NAME);
  return verifyToken(c?.value);
}

export function isAdmin(name: Participant | null): boolean {
  return name === ADMIN_NAME;
}

export function setSessionCookie(name: Participant) {
  cookies().set(COOKIE_NAME, makeToken(name), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365 * 5
  });
}

export function clearSessionCookie() {
  cookies().delete(COOKIE_NAME);
}
