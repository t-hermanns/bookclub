'use client';
import { useMemo, useState } from 'react';

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function DeadlinePicker({
  defaultHours,
  value,
  onChange
}: {
  defaultHours: number;
  value: string; // datetime-local string
  onChange: (v: string) => void;
}) {
  const minNow = useMemo(() => toLocalInputValue(new Date()), []);
  return (
    <input
      type="datetime-local"
      className="input max-w-xs"
      min={minNow}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function useDefaultDeadline(hours: number): [string, (v: string) => void] {
  const [v, setV] = useState(() => toLocalInputValue(new Date(Date.now() + hours * 3600 * 1000)));
  return [v, setV];
}

/** Converts a datetime-local string to ISO (interpreted as local time). */
export function localInputToISO(v: string): string {
  return new Date(v).toISOString();
}
