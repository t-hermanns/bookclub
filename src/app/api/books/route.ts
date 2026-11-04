import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { err, ok, requireUser } from '@/lib/api';
import { getDb } from '@/lib/db';
import { prepareSubmission } from '@/lib/bookSubmission';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const u = await requireUser();
  if (u instanceof Response) return u;

  const body = await req.json().catch(() => ({}));
  const prepared = await prepareSubmission(body, u);
  if (typeof prepared === 'string') return err(prepared);
  const { submissionRoundId, existing, title, author, link, isbn, duplicate } = prepared;

  // Checked again here: the form's check may be outdated by now.
  if (duplicate?.level === 'block') {
    return ok({ error: duplicate.message, duplicate }, { status: 409 });
  }
  if (duplicate?.level === 'possible' && (body as any).confirmDuplicate !== true) {
    return ok({ error: 'Es gibt ein möglicherweise gleiches Buch', duplicate }, { status: 409 });
  }

  const identity = prepared.identity ? JSON.stringify(prepared.identity) : null;
  const db = getDb();
  if (existing) {
    db.prepare(
      "UPDATE books SET title=?, author=?, link=?, isbn=?, identity=?, updated_at=datetime('now') WHERE id=?"
    ).run(title, author, link, isbn, identity, existing.id);
    return ok({ ok: true, id: existing.id, updated: true, link });
  }
  // Assign a random (non-sequential) id so the id never reveals submission order.
  const insert = db.prepare(
    'INSERT INTO books(id, round_id, title, author, link, submitter_name, isbn, identity) VALUES(?,?,?,?,?,?,?,?)'
  );
  for (let attempt = 0; ; attempt++) {
    const id = crypto.randomInt(1, 2_147_483_647);
    try {
      insert.run(id, submissionRoundId, title, author, link, u, isbn, identity);
      return ok({ ok: true, id, created: true, link });
    } catch (e: any) {
      // Retry only on the (astronomically unlikely) id collision.
      if (e?.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' && attempt < 10) continue;
      throw e;
    }
  }
}
