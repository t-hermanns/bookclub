'use client';
import type { CSSProperties } from 'react';

// Themes that get the animated autumn / Halloween look; any other theme gets the plain card.
const AUTUMN = /herbst|halloween|oktober|grusel|spooky/i;

/** The round's theme for the suggestions, if the admin set one. */
export function ThemeBanner({ theme }: { theme: string | null }) {
  if (!theme) return null;
  if (AUTUMN.test(theme)) return <AutumnBanner theme={theme} />;
  return (
    <div className="card">
      <div className="text-sm text-slate-500">Thema dieser Runde</div>
      <div className="mt-0.5 break-words text-xl font-semibold">{theme}</div>
    </div>
  );
}

// TEMPORARY: looks to compare via ?banner=a|b|c|d|e; one stays.
function AutumnBanner({ theme }: { theme: string }) {
  const variant =
    (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('banner')) || 'a';
  if (variant === 'b') return <EmberBanner theme={theme} />;
  if (variant === 'c') return <PumpkinBanner theme={theme} />;
  if (variant === 'd') return <OutlineBatsBanner theme={theme} />;
  if (variant === 'e') return <OutlineLeavesBanner theme={theme} />;
  return <DuskBanner theme={theme} />;
}

function Title({ theme, labelClass }: { theme: string; labelClass: string }) {
  return (
    <div className="min-w-0">
      <div className={`text-xs font-bold uppercase tracking-widest ${labelClass}`}>Thema dieser Runde</div>
      <div className="mt-1 break-words text-2xl font-black leading-tight">{theme}</div>
    </div>
  );
}

/** A: dusk sky from violet to orange, a glowing moon and bats flying across. */
function DuskBanner({ theme }: { theme: string }) {
  return (
    <div className="autumn-dusk relative overflow-hidden rounded-2xl p-5 text-white shadow-sm">
      <div aria-hidden>
        <span className="autumn-moon absolute right-6 top-4 h-14 w-14 rounded-full bg-amber-100" />
        <Bat className="autumn-bat w-10 text-stone-950" style={{ animationDelay: '0s' }} />
        <Bat className="autumn-bat w-6 text-stone-950" style={{ animationDelay: '3.2s', animationDuration: '8s' }} />
        <Bat className="autumn-bat w-8 text-stone-950" style={{ animationDelay: '6s', animationDuration: '11s' }} />
      </div>
      <div className="relative pr-20">
        <Title theme={theme} labelClass="text-orange-200" />
      </div>
    </div>
  );
}

const LEAVES: { left: string; size: string; delay: string; duration: string }[] = [
  { left: '4%', size: 'w-6', delay: '0s', duration: '7s' },
  { left: '22%', size: 'w-4', delay: '2.4s', duration: '8.5s' },
  { left: '41%', size: 'w-5', delay: '1.1s', duration: '6.5s' },
  { left: '60%', size: 'w-7', delay: '3.8s', duration: '9s' },
  { left: '78%', size: 'w-5', delay: '0.6s', duration: '7.5s' },
  { left: '90%', size: 'w-4', delay: '5s', duration: '8s' }
];

/** B: warm, slowly shifting ember gradient with leaf silhouettes drifting down. */
function EmberBanner({ theme }: { theme: string }) {
  return (
    <div className="autumn-ember relative overflow-hidden rounded-2xl p-5 text-white shadow-sm">
      <div aria-hidden>
        {LEAVES.map((l) => (
          <Leaf
            key={l.left}
            className={`autumn-leaf ${l.size} text-orange-950/40`}
            style={{ left: l.left, animationDelay: l.delay, animationDuration: l.duration }}
          />
        ))}
      </div>
      <div className="relative [text-shadow:0_1px_2px_rgba(0,0,0,0.25)]">
        <Title theme={theme} labelClass="text-orange-100" />
      </div>
    </div>
  );
}

/** C: dark card, a carved pumpkin with flickering candle glow and embers rising. */
function PumpkinBanner({ theme }: { theme: string }) {
  return (
    <div className="animate-pop relative overflow-hidden rounded-2xl bg-stone-950 p-5 text-white shadow-sm">
      <div aria-hidden>
        <span className="autumn-glow absolute -right-10 top-1/2 h-48 w-48 -translate-y-1/2 rounded-full" />
        {['62%', '70%', '78%', '86%'].map((left, i) => (
          <span
            key={left}
            className="autumn-ember-dot absolute bottom-0 h-1.5 w-1.5 rounded-full bg-orange-400"
            style={{ left, animationDelay: `${i * 0.9}s`, animationDuration: `${3.2 + i * 0.5}s` }}
          />
        ))}
      </div>
      <div className="relative flex items-center justify-between gap-3">
        <Title theme={theme} labelClass="text-orange-400" />
        <Pumpkin className="autumn-pumpkin w-20 shrink-0" />
      </div>
    </div>
  );
}

/** D: regular card with an animated violet-to-orange frame, bats and a small pumpkin. */
function OutlineBatsBanner({ theme }: { theme: string }) {
  return (
    <div className="autumn-outline relative overflow-hidden rounded-2xl p-5 shadow-sm">
      <div aria-hidden>
        <Bat className="autumn-bat w-9 text-stone-800 dark:text-stone-300" style={{ animationDelay: '0s' }} />
        <Bat
          className="autumn-bat w-6 text-stone-800 dark:text-stone-300"
          style={{ animationDelay: '4s', animationDuration: '10s' }}
        />
      </div>
      <div className="relative flex items-center justify-between gap-3">
        <Title theme={theme} labelClass="text-orange-600 dark:text-orange-400" />
        <Pumpkin className="autumn-pumpkin w-14 shrink-0" />
      </div>
    </div>
  );
}

/** E: regular card with an animated frame and orange leaves drifting down. */
function OutlineLeavesBanner({ theme }: { theme: string }) {
  return (
    <div className="autumn-outline relative overflow-hidden rounded-2xl p-5 shadow-sm">
      <div aria-hidden>
        {LEAVES.map((l) => (
          <Leaf
            key={l.left}
            className={`autumn-leaf ${l.size} text-orange-500/50`}
            style={{ left: l.left, animationDelay: l.delay, animationDuration: l.duration }}
          />
        ))}
      </div>
      <div className="relative">
        <Title theme={theme} labelClass="text-orange-600 dark:text-orange-400" />
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

function Leaf({ className, style }: { className: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} fill="currentColor">
      <path d="M12 1.5 13.6 6l3.6-2.2-.6 4.4 4.4-.4-2.8 3.8 3.3 1.6-4.2 1.6 1.2 3.2-3.9-1.1-1.8 3.4L12 16.6l-.8 3.7-1.8-3.4-3.9 1.1 1.2-3.2-4.2-1.6 3.3-1.6L3 7.8l4.4.4-.6-4.4L10.4 6z" />
      <path d="M12 16.6V23" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function Pumpkin({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <path d="M31 16c-.6-4.4 1-8 5-9.6l1.6 2.8c-2.8 1.2-3.8 3.6-3.4 6.8z" fill="#4d7c0f" />
      <ellipse cx="20" cy="39" rx="14" ry="18" fill="#c2410c" />
      <ellipse cx="44" cy="39" rx="14" ry="18" fill="#c2410c" />
      <ellipse cx="32" cy="39" rx="15" ry="19.5" fill="#ea580c" />
      <g className="autumn-candle" fill="#fde047">
        <path d="M19 33l6.5-7 4 7z" />
        <path d="M34.5 33l4-7 6.5 7z" />
        <path d="M30 39.5l2-3.5 2 3.5z" />
        <path d="M17 44c5 7.5 25 7.5 30 0l-4.5 1.2-2 3.2-3-3-3.5 3.2-3-3.2-3 3-2.5-3.2z" />
      </g>
    </svg>
  );
}
