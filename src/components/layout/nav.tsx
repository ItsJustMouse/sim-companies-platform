'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import clsx from 'clsx';

/**
 * Primary navigation.
 *
 * Grouped by what a player is trying to do rather than by our internal structure:
 * look something up, decide something, learn something. The mobile disclosure is the
 * only client-side JavaScript in the shell.
 */

const LINKS = [
  { href: '/exchange', label: 'Exchange', hint: 'Live prices for every product' },
  { href: '/market', label: 'Market', hint: 'Movers, volatility and category trends' },
  { href: '/calculators', label: 'Calculators', hint: 'ROI, borrowing and capital planning tools' },
  { href: '/learn', label: 'Learn', hint: 'Beginner guides and game mechanics' },
] as const;

export function PrimaryNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // The mobile panel must close on navigation, so it never covers the page the user
  // just asked for. Derived from the pathname during render — React's documented
  // "adjust state when a prop changes" pattern — rather than an effect, which would
  // paint the stale open panel for a frame first.
  const [openedAt, setOpenedAt] = useState(pathname);
  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    setOpen(false);
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <nav aria-label="Primary" className="hidden items-center gap-0.5 md:flex">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            title={link.hint}
            aria-current={isActive(link.href) ? 'page' : undefined}
            className={clsx(
              'rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
              isActive(link.href)
                ? 'bg-[var(--surface-hover)] text-[var(--text)]'
                : 'text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]',
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-nav"
        className="rounded-md border border-[var(--border)] px-2.5 py-1.5 text-sm font-medium text-[var(--text-muted)] md:hidden"
      >
        {open ? 'Close' : 'Menu'}
      </button>

      <div
        id="mobile-nav"
        hidden={!open}
        className="absolute inset-x-0 top-full z-40 border-b border-[var(--border)] bg-[var(--bg-elevated)] p-2 shadow-lg md:hidden"
      >
        <nav aria-label="Primary (mobile)" className="flex flex-col">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(link.href) ? 'page' : undefined}
              className={clsx(
                'rounded-md px-3 py-2.5',
                isActive(link.href)
                  ? 'bg-[var(--surface-hover)] text-[var(--text)]'
                  : 'text-[var(--text-muted)]',
              )}
            >
              <span className="block text-sm font-medium">{link.label}</span>
              <span className="block text-xs text-[var(--text-faint)]">{link.hint}</span>
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
