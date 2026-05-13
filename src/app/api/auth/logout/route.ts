import { clearSessionCookie, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function POST() {
  clearSessionCookie();
  return ok({ ok: true });
}
