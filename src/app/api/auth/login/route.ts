import { NextRequest } from 'next/server';
import { adminName, isParticipant } from '@/lib/participants';
import { adminPasswordConfigured, checkAdminPassword, err, ok, setSessionCookie } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { name, password } = body as { name?: string; password?: string };
  if (!name || !isParticipant(name)) return err('Unbekannter Name');
  if (name === adminName()) {
    if (!adminPasswordConfigured()) return err('Das Admin-Passwort ist nicht eingerichtet (ADMIN_PASSWORD).', 500);
    if (!password || !checkAdminPassword(password)) return err('Falsches Passwort', 401);
  }
  setSessionCookie(name);
  return ok({ ok: true, name });
}
