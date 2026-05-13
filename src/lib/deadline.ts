/** Resolve a deadline expressed as either a future ISO datetime or a relative number of hours. */
export function resolveDeadlineHours(body: any, defaultHours: number): { hours: number } | { error: string } {
  if (body && typeof body.deadlineAt === 'string' && body.deadlineAt) {
    const t = new Date(body.deadlineAt).getTime();
    if (!Number.isFinite(t)) return { error: 'Ungültiges Datum' };
    const diffMs = t - Date.now();
    if (diffMs < 60 * 1000) return { error: 'Frist muss mindestens eine Minute in der Zukunft liegen' };
    if (diffMs > 365 * 24 * 3600 * 1000) return { error: 'Frist liegt zu weit in der Zukunft' };
    return { hours: diffMs / 3600000 };
  }
  const hours = Number((body && body.deadlineHours) ?? defaultHours);
  if (!Number.isFinite(hours) || hours < 1 / 60 || hours > 24 * 365)
    return { error: 'Ungültige Frist' };
  return { hours };
}
