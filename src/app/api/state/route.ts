import { getCurrentUser } from '@/lib/auth';
import { buildState } from '@/lib/state';
import { ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = getCurrentUser();
  return ok(buildState(user));
}
