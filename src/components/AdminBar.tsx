'use client';
import { useState } from 'react';
import type { StateDTO } from '@/lib/state';
import { ConfirmDialog } from './ConfirmDialog';
import { DeadlinePicker, localInputToISO, useDefaultDeadline } from './DeadlinePicker';

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export function AdminBar({
  state,
  refresh
}: {
  state: StateDTO;
  refresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | {
    title: string;
    message: React.ReactNode;
    danger?: boolean;
    confirmLabel?: string;
    onConfirm: () => Promise<void> | void;
  }>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      refresh();
    } catch (e: any) {
      setError(e.message ?? 'Fehler');
    } finally {
      setBusy(false);
    }
  }

  if (!state.user.isAdmin) return null;

  const round = state.round;

  return (
    <div className="card space-y-3 border-brand-200 bg-brand-50/50 dark:border-brand-700/40 dark:bg-brand-700/10">
      <h2 className="text-lg font-semibold">Admin-Bereich</h2>
      {error && <div className="banner-warn">{error}</div>}

      {!round && (
        <StartSuggestions
          onRun={run}
          busy={busy}
          label={state.lastFinishedRound ? 'Neue Runde starten' : 'Buchvorschläge starten'}
        />
      )}

      {round?.status === 'suggestions_open' && (
        <button
          className="btn-primary"
          disabled={busy}
          onClick={async () => {
            const submitted = round.submittedCount ?? 0;
            const total = state.totalParticipants;
            if (submitted < total) {
              setConfirm({
                title: 'Vorschläge schließen?',
                message: `Erst ${submitted}/${total} haben einen Vorschlag eingereicht. Trotzdem schließen?`,
                danger: true,
                confirmLabel: 'Trotzdem schließen',
                onConfirm: () =>
                  run(async () => {
                    const r = await post('/api/admin/round/close-suggestions', { force: true });
                    if (!r.ok) throw new Error(r.data.error);
                  })
              });
            } else {
              await run(async () => {
                const r = await post('/api/admin/round/close-suggestions');
                if (!r.ok) throw new Error(r.data.error);
              });
            }
          }}
        >
          Vorschläge schließen
        </button>
      )}

      {round?.status === 'suggestions_closed' && (
        <>
          <div className="banner-info">
            Bitte prüfe die Einreichungen, bevor du die Abstimmung startest.
          </div>
          <StartVoting onRun={run} busy={busy} />
        </>
      )}

      {(round?.status === 'voting_open' || round?.status === 'runoff_open') && (
          <button
            className="btn-primary"
            disabled={busy}
            onClick={async () => {
              const v = round.voterCount ?? 0;
              const e = round.eligibleVoterCount;
              if (v < e) {
                setConfirm({
                  title: 'Abstimmung schließen?',
                  message: `Erst ${v}/${e} haben abgestimmt. Trotzdem schließen?`,
                  danger: true,
                  confirmLabel: 'Trotzdem schließen',
                  onConfirm: () =>
                    run(async () => {
                      const r = await post('/api/admin/round/close-voting', { force: true });
                      if (!r.ok) throw new Error(r.data.error);
                    })
                });
              } else {
                await run(async () => {
                  const r = await post('/api/admin/round/close-voting');
                  if (!r.ok) throw new Error(r.data.error);
                });
              }
            }}
          >
            Abstimmung schließen
          </button>
        )}

      {round?.status === 'voting_closed' && round.winner && (
        <button
          className="btn-primary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const r = await post('/api/admin/round/finish');
              if (!r.ok) throw new Error(r.data.error);
            })
          }
        >
          Gewinner bestätigen & Runde abschließen
        </button>
      )}

      {round?.status === 'voting_closed' && round.tied.length > 0 && (
        <TieControls
          tiedCount={round.tied.length}
          candidateCount={round.books.length}
          onRunoff={(deadlineAt, ids) =>
            run(async () => {
              const r = await post('/api/admin/round/start-runoff', { deadlineAt, bookIds: ids });
              if (!r.ok) throw new Error(r.data.error);
            })
          }
          onRandom={() =>
            run(async () => {
              const r = await post('/api/admin/round/pick-random');
              if (!r.ok) throw new Error(r.data.error);
            })
          }
          tiedBooks={round.tied}
          busy={busy}
        />
      )}

      {!round && state.lastFinishedRound && null}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        danger={confirm?.danger}
        confirmLabel={confirm?.confirmLabel ?? 'Bestätigen'}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          const c = confirm;
          setConfirm(null);
          if (c) await c.onConfirm();
        }}
      />
    </div>
  );
}

function StartSuggestions({
  onRun,
  busy,
  label = 'Buchvorschläge starten'
}: {
  onRun: (fn: () => Promise<void>) => void;
  busy: boolean;
  label?: string;
}) {
  const [deadline, setDeadline] = useDefaultDeadline(24 * 7);
  return (
    <div className="space-y-2">
      <p className="text-sm">Aktuell läuft keine Runde.</p>
      <label className="block text-sm font-medium">Frist (Datum & Uhrzeit)</label>
      <DeadlinePicker defaultHours={24 * 7} value={deadline} onChange={setDeadline} />
      <div>
        <button
          className="btn-primary"
          disabled={busy || !deadline}
          onClick={() =>
            onRun(async () => {
              const r = await post('/api/admin/round/start-suggestions', {
                deadlineAt: localInputToISO(deadline)
              });
              if (!r.ok) throw new Error(r.data.error);
            })
          }
        >
          {label}
        </button>
      </div>
    </div>
  );
}

function StartVoting({ onRun, busy }: { onRun: (fn: () => Promise<void>) => void; busy: boolean }) {
  const [deadline, setDeadline] = useDefaultDeadline(24);
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">Abstimmungs-Frist (Datum & Uhrzeit)</label>
      <DeadlinePicker defaultHours={24} value={deadline} onChange={setDeadline} />
      <div>
        <button
          className="btn-primary"
          disabled={busy || !deadline}
          onClick={() =>
            onRun(async () => {
              const r = await post('/api/admin/round/start-voting', {
                deadlineAt: localInputToISO(deadline)
              });
              if (!r.ok) throw new Error(r.data.error);
            })
          }
        >
          Abstimmung starten
        </button>
      </div>
    </div>
  );
}

function TieControls({
  tiedBooks,
  tiedCount,
  candidateCount,
  onRunoff,
  onRandom,
  busy
}: {
  tiedBooks: { id: number; title: string }[];
  tiedCount: number;
  candidateCount: number;
  onRunoff: (deadlineAt: string, ids: number[]) => void;
  onRandom: () => void;
  busy: boolean;
}) {
  const [deadline, setDeadline] = useDefaultDeadline(8);
  const [confirmRandom, setConfirmRandom] = useState(false);
  const allTied = tiedCount === candidateCount;
  return (
    <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
      <div className="font-medium">
        Gleichstand bei {tiedCount} {tiedCount === 1 ? 'Buch' : 'Büchern'}
      </div>
      {allTied && (
        <div className="text-sm text-amber-900 dark:text-amber-200">
          Alle verbleibenden Bücher sind gleichauf — nur Zufallsauswahl möglich.
        </div>
      )}
      {!allTied && (
        <div className="space-y-2">
          <label className="block text-sm font-medium">Stichwahl-Frist (Datum & Uhrzeit)</label>
          <div className="flex flex-wrap items-center gap-2">
            <DeadlinePicker defaultHours={8} value={deadline} onChange={setDeadline} />
            <button
              className="btn-primary"
              disabled={busy || !deadline}
              onClick={() => onRunoff(localInputToISO(deadline), tiedBooks.map((b) => b.id))}
            >
              Stichwahl starten
            </button>
          </div>
        </div>
      )}
      <button className="btn-secondary" disabled={busy} onClick={() => setConfirmRandom(true)}>
        Zufällig auswählen
      </button>
      <ConfirmDialog
        open={confirmRandom}
        title="Zufällig auswählen?"
        message="Ein Gewinner wird zufällig aus den gleichauf liegenden Büchern gewählt."
        confirmLabel="Zufällig auswählen"
        onCancel={() => setConfirmRandom(false)}
        onConfirm={() => {
          setConfirmRandom(false);
          onRandom();
        }}
      />
    </div>
  );
}
