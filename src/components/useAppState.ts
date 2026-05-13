'use client';
import { useEffect, useState } from 'react';
import type { StateDTO } from '@/lib/state';

const POLL_MS = 5000;

export function useAppState() {
  const [state, setState] = useState<StateDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const res = await fetch('/api/state', { cache: 'no-store' });
        if (!res.ok) throw new Error('state http ' + res.status);
        const data = (await res.json()) as StateDTO;
        if (!cancelled) {
          setState(data);
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Fehler');
      } finally {
        if (!cancelled) timer = setTimeout(tick, POLL_MS);
      }
    }
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  async function refresh() {
    const res = await fetch('/api/state', { cache: 'no-store' });
    if (res.ok) setState(await res.json());
  }

  return { state, error, refresh, setState };
}
