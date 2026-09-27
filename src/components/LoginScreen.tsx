'use client';
import { useState } from 'react';
import { PARTICIPANTS, ADMIN_NAME } from '@/lib/participants';
import type { Participant } from '@/lib/participants';

export function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [selected, setSelected] = useState<Participant | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: selected, password: selected === ADMIN_NAME ? password : undefined })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Login fehlgeschlagen');
      onLoggedIn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!confirming || !selected) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <div className="card animate-pop space-y-4">
          <div>
            <h1 className="text-3xl font-bold">Wer bist du?</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Wähle deinen Namen aus der Liste. <strong>Diese Auswahl ist endgültig</strong> — du
              kannst dich später nicht mehr als andere Person ausgeben.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PARTICIPANTS.map((n) => (
              <button
                key={n}
                onClick={() => {
                  setSelected(n);
                  setConfirming(true);
                }}
                className="btn-secondary card-hover"
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <div className="card animate-pop space-y-4">
        <h1 className="text-2xl font-semibold">Bist du wirklich {selected}?</h1>
        <div className="banner-warn">
          <strong>Achtung:</strong> Diese Auswahl ist endgültig — du kannst dich später nicht
          mehr als andere Person anmelden. Wähle nur, wenn du wirklich {selected} bist.
        </div>
        {selected === ADMIN_NAME && (
          <div>
            <label className="mb-1 block text-sm font-medium">Passwort</label>
            <input
              type="password"
              autoFocus
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
        )}
        {error && <div className="banner-warn">{error}</div>}
        <div className="flex gap-2">
          <button
            className="btn-secondary"
            onClick={() => {
              setConfirming(false);
              setSelected(null);
              setPassword('');
              setError(null);
            }}
          >
            Zurück
          </button>
          <button className="btn-primary flex-1" disabled={busy} onClick={submit}>
            {busy ? '…' : `Ja, ich bin ${selected}`}
          </button>
        </div>
      </div>
    </div>
  );
}
