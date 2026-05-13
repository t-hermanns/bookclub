'use client';
import { useEffect, useState } from 'react';

export function Countdown({ deadline }: { deadline: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!deadline) return null;
  const target = new Date(deadline).getTime();
  const diff = target - now;
  if (diff <= 0)
    return <span className="text-amber-700 dark:text-amber-300">Frist abgelaufen</span>;
  const s = Math.floor(diff / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  let txt = '';
  if (d) txt = `${d}d ${h}h ${m}m`;
  else if (h) txt = `${h}h ${m}m ${sec}s`;
  else txt = `${m}m ${sec}s`;
  return <span>noch {txt}</span>;
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}
