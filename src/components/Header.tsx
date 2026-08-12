'use client';
import Link from 'next/link';
import { useTheme } from './ThemeProvider';

export function Header({
  userName,
  isAdmin
}: {
  userName: string | null;
  isAdmin: boolean;
}) {
  const { theme, toggle } = useTheme();
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/70 backdrop-blur-md dark:border-slate-800/70 dark:bg-slate-950/70">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
          <span className="text-xl">📚</span>
          <span className="text-brand-600 dark:text-brand-400">
            Bookclub
          </span>
          {isAdmin && (
            <span className="pill bg-brand-100 text-brand-700 dark:bg-brand-700/30 dark:text-brand-100">
              Diktator
            </span>
          )}
        </Link>
        <div className="flex items-center gap-1">
          <Link href="/historie" className="btn-ghost">
            Historie
          </Link>
          {userName && (
            <span className="hidden text-sm text-slate-500 sm:inline">
              <strong>{userName}</strong>
            </span>
          )}
          <button onClick={toggle} className="btn-ghost" aria-label="Design wechseln">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </div>
    </header>
  );
}
