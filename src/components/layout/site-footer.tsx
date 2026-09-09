import Link from 'next/link';

const COLUMNS = [
  {
    title: 'Market',
    links: [
      { href: '/exchange', label: 'Exchange' },
      { href: '/market', label: 'Market overview' },
      { href: '/market/movers', label: 'Gainers and losers' },
    ],
  },
  {
    title: 'Tools',
    links: [
      { href: '/calculators', label: 'All calculators' },
      { href: '/calculators/investment', label: 'Building ROI' },
    ],
  },
  {
    title: 'Learn',
    links: [
      { href: '/learn', label: 'Beginner centre' },
      { href: '/learn/glossary', label: 'Glossary' },
      { href: '/learn/mistakes', label: 'Common mistakes' },
      { href: '/methodology', label: 'How we calculate' },
    ],
  },
  {
    title: 'About',
    links: [
      { href: '/about', label: 'About Simconomist' },
      { href: '/status', label: 'Data status' },
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-14 border-t border-[var(--border)] bg-[var(--bg-elevated)]">
      <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4 lg:grid-cols-5">
          <div className="col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-mark.svg" alt="" width={24} height={24} className="rounded-md" />
              <span className="font-semibold tracking-tight">Simconomist</span>
            </div>
            <p className="mt-2 max-w-xs text-sm text-[var(--text-muted)]">
              Market intelligence for Sim Companies.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
                {column.title}
              </h2>
              <ul className="mt-2 space-y-1.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/*
          Independence notice. This is a legal and ethical requirement, not decoration:
          nothing on this site may imply the game's operators endorse or run it.
        */}
        <div className="mt-9 border-t border-[var(--border)] pt-5 text-xs leading-relaxed text-[var(--text-faint)]">
          <p>
            Simconomist is an independent, unofficial companion tool. It is not affiliated with, endorsed by, or
            operated by the makers of Sim Companies. &ldquo;Sim Companies&rdquo; and all related names, marks and game
            content belong to their respective owners and are referenced here for identification only.
          </p>
          <p className="mt-2">
            Market figures are observations of a third-party API and may be incomplete or delayed. Every projection on
            this site is an estimate, not a guarantee of in-game results. See{' '}
            <Link href="/methodology" className="underline underline-offset-2 hover:text-[var(--text-muted)]">
              how we calculate
            </Link>{' '}
            for the assumptions behind each number.
          </p>
        </div>
      </div>
    </footer>
  );
}
