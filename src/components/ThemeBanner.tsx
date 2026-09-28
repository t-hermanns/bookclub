'use client';

// Themes that get the animated autumn / Halloween look; any other theme gets the plain card.
const AUTUMN = /herbst|halloween|oktober|grusel|spooky/i;

const LEAVES = [
  { char: '🍂', left: '6%', size: 'text-xl', delay: '0s', duration: '7s' },
  { char: '🍁', left: '28%', size: 'text-lg', delay: '2.6s', duration: '8.5s' },
  { char: '🍂', left: '47%', size: 'text-base', delay: '1.3s', duration: '6.5s' },
  { char: '🍁', left: '66%', size: 'text-xl', delay: '4.2s', duration: '9s' }
];

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

function AutumnBanner({ theme }: { theme: string }) {
  return (
    <div className="animate-pop relative overflow-hidden rounded-2xl bg-orange-500 p-5 text-stone-950 shadow-sm">
      <div aria-hidden>
        {LEAVES.map((l) => (
          <span
            key={l.left}
            className={`autumn-leaf ${l.size}`}
            style={{ left: l.left, animationDelay: l.delay, animationDuration: l.duration }}
          >
            {l.char}
          </span>
        ))}
        <span className="autumn-bat text-xl" style={{ animationDelay: '1s' }}>
          <span>🦇</span>
        </span>
        <span className="autumn-bat text-sm" style={{ animationDelay: '5.5s' }}>
          <span>🦇</span>
        </span>
      </div>
      <div className="relative flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-widest text-stone-950/70">
            Thema dieser Runde
          </div>
          <div className="mt-1 break-words text-2xl font-black leading-tight">{theme}</div>
        </div>
        <span
          aria-hidden
          className="autumn-pumpkin shrink-0 text-5xl drop-shadow-[0_2px_2px_rgba(0,0,0,0.35)]"
        >
          🎃
        </span>
      </div>
    </div>
  );
}
