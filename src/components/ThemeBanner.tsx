'use client';
import type { CSSProperties } from 'react';

// Themes that get the animated autumn / Halloween look; any other theme gets the plain card.
const AUTUMN = /herbst|halloween|oktober|grusel|spooky/i;

/** The round's theme for the suggestions, if the admin set one. */
export function ThemeBanner({ theme }: { theme: string | null }) {
  if (!theme) return null;
  if (AUTUMN.test(theme)) return <DuskBanner theme={theme} />;
  return (
    <div className="card">
      <div className="text-sm text-slate-500">Thema dieser Runde</div>
      <div className="mt-0.5 break-words text-xl font-semibold">{theme}</div>
    </div>
  );
}

/** Dusk sky from violet to orange, a glowing moon and bats flying across. */
function DuskBanner({ theme }: { theme: string }) {
  return (
    <div className="autumn-dusk relative overflow-hidden rounded-2xl p-5 text-white shadow-sm">
      <div aria-hidden>
        <span className="autumn-moon absolute right-6 top-4 h-14 w-14 rounded-full bg-amber-100" />
        <Bat className="autumn-bat w-10 text-stone-950" style={{ animationDelay: '0s' }} />
        <Bat className="autumn-bat w-6 text-stone-950" style={{ animationDelay: '3.2s', animationDuration: '8s' }} />
        <Bat className="autumn-bat w-8 text-stone-950" style={{ animationDelay: '6s', animationDuration: '11s' }} />
      </div>
      <div className="relative min-w-0 pr-20">
        <div className="text-xs font-bold uppercase tracking-widest text-orange-200">Thema dieser Runde</div>
        <div className="mt-1 break-words text-2xl font-black leading-tight">{theme}</div>
      </div>
    </div>
  );
}

function Bat({ className, style }: { className: string; style?: CSSProperties }) {
  return (
    <span className={className} style={style}>
      <svg viewBox="0 0 64 32" className="autumn-wings block w-full" fill="currentColor">
        <path d="M32 11c-1.6-3.6-3.6-5-5-4.2.3 1.4 1 2.4 1.2 3.6C23 8.6 17.4 6.8 11 7.6c2.4 2.2 2.8 5 1 7.4 4-.6 7.6 1.2 9 4.4 2-2 5.4-2.4 7.6-.6 1-2.6 2.2-3.8 3.4-3.8s2.4 1.2 3.4 3.8c2.2-1.8 5.6-1.4 7.6.6 1.4-3.2 5-5 9-4.4-1.8-2.4-1.4-5.2 1-7.4-6.4-.8-12 1-17.2 2.8.2-1.2.9-2.2 1.2-3.6-1.4-.8-3.4.6-5 4.2z" />
      </svg>
    </span>
  );
}
