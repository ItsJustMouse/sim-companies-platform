import Link from 'next/link';
import { PrimaryNav } from './nav';
import { ThemeToggle } from './theme-toggle';
import { UniversalSearch } from './universal-search';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[color-mix(in_oklab,var(--bg-elevated)_88%,transparent)] backdrop-blur">
      <div className="relative mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Simconomist home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.svg" alt="" width={26} height={26} className="rounded-md" />
          <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">Simconomist</span>
        </Link>

        <div className="min-w-0 flex-1">
          <UniversalSearch />
        </div>

        <PrimaryNav />
        <ThemeToggle />
      </div>
    </header>
  );
}
