import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import { ADMIN_NAME, isParticipant, type Participant } from './participants';

const COOKIE_NAME = 'bc_session';
const SECRET = process.env.SESSION_SECRET ?? 'dev-insecure-secret-change-me';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'change-me';

function sign(payload: string): string {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
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
  if (sign(b64) !== sig) return null;
  try {
    const obj = JSON.parse(Buffer.from(b64, 'base64url').toString());
    if (typeof obj.name === 'string' && isParticipant(obj.name)) return obj.name;
  } catch {}
  return null;
}

export function checkAdminPassword(pw: string): boolean {
  return pw === ADMIN_PASSWORD;
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

export { COOKIE_NAME, ADMIN_NAME };
