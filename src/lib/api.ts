import { NextResponse } from 'next/server';
import {
  checkAdminPassword,
  getCurrentUser,
  isAdmin,
  setSessionCookie,
  clearSessionCookie
} from './auth';
import type { Participant } from './participants';

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function requireUser(): Participant | Response {
  const u = getCurrentUser();
  if (!u) return err('Nicht eingeloggt', 401);
  return u;
}

export function requireAdmin(): Participant | Response {
  const u = getCurrentUser();
  if (!u || !isAdmin(u)) return err('Keine Berechtigung', 403);
  return u;
}

export { checkAdminPassword, setSessionCookie, clearSessionCookie };
