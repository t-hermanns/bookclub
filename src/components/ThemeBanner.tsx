'use client';

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

/** Dusk sky from violet to orange with a glowing moon. */
function DuskBanner({ theme }: { theme: string }) {
  return (
    <div className="autumn-dusk relative overflow-hidden rounded-2xl p-5 text-white shadow-sm">
      <span
        aria-hidden
        className="autumn-moon absolute right-6 top-4 h-14 w-14 rounded-full bg-amber-100"
      />
      <div className="relative min-w-0 pr-20">
        <div className="text-xs font-bold uppercase tracking-widest text-orange-200">Thema dieser Runde</div>
        <div className="mt-1 break-words text-2xl font-black leading-tight">{theme}</div>
      </div>
    </div>
  );
}
