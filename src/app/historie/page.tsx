'use client';
import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { fmtDate } from '@/components/Countdown';

interface HistoryRound {
  id: number;
  closedAt: string | null;
  isRunoff: boolean;
  winner: { id: number; title: string; author: string; link: string; submitter: string; votes: number } | null;
  books: { id: number; title: string; author: string; link: string; submitter: string; votes: number }[];
}

export default function HistoriePage() {
  const [rounds, setRounds] = useState<HistoryRound[] | null>(null);
  const [user, setUser] = useState<{ name: string | null; isAdmin: boolean }>({ name: null, isAdmin: false });

  useEffect(() => {
    fetch('/api/history')
      .then((r) => r.json())
      .then((d) => setRounds(d.rounds));
    fetch('/api/state')
      .then((r) => r.json())
      .then((d) => setUser(d.user));
  }, []);

  return (
    <>
      <Header
        userName={user.name}
        isAdmin={user.isAdmin}
      />
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:py-8">
        <h1 className="text-2xl font-semibold">Historie</h1>
        {!rounds && <div className="text-slate-500">Lädt …</div>}
        {rounds && rounds.length === 0 && <div className="card">Noch keine abgeschlossenen Runden.</div>}
        {rounds?.filter((r) => !r.isRunoff).map((r) => (
          <div key={r.id} className="card animate-pop space-y-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold">Runde #{r.id}</h2>
              <span className="text-sm text-slate-500">{fmtDate(r.closedAt)}</span>
            </div>
            {r.winner && (
              <div className="rounded-xl border border-brand-200 bg-gradient-to-br from-brand-500/10 to-pink-500/5 p-3 dark:border-brand-700/40">
                <div className="text-sm font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-200">🏆 Gewinner</div>
                <div className="font-semibold">{r.winner.title}</div>
                <div className="text-sm text-slate-500">
                  von {r.winner.author} · vorgeschlagen von {r.winner.submitter}
                </div>
                <a className="block break-words text-sm text-brand-600 hover:underline" href={r.winner.link} target="_blank" rel="noreferrer">
                  {r.winner.link}
                </a>
              </div>
            )}
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {r.books.map((b) => (
                <li key={b.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="font-medium">{b.title}</div>
                    <div className="text-sm text-slate-500">
                      von {b.author} · vorgeschlagen von {b.submitter}
                    </div>
                  </div>
                  <span className="self-start rounded-full bg-slate-100 px-2.5 py-0.5 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {b.votes} Stimmen
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </main>
    </>
  );
}
