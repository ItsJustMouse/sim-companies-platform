import Link from 'next/link';
import { getMarketOverview } from '@/lib/market/service';
import { DEFAULT_REALM_ID } from '@/lib/game/constants';
import { Card, CardHeader, Delta, SectionHeading, Stat } from '@/components/ui/primitives';
import { FreshnessLine } from '@/components/ui/freshness';
import { money, compactNumber } from '@/lib/util/format';
import { buildMetadata } from '@/lib/seo';

export const revalidate = 120;

export const metadata = buildMetadata({
  title: 'Sim Companies market prices, analytics and calculators',
  description:
    'Sim Companies exchange prices with Ledgerforge-collected history, market analytics and practical planning calculators.',
  path: '/',
});

const ENTRY_POINTS = [
  {
    href: '/exchange',
    title: 'Check market prices',
    body: 'Browse current recorded prices, movement and Ledgerforge-collected history.',
  },
  {
    href: '/market',
    title: 'Read the market',
    body: 'See movers, volatility and market trends from our collected observations.',
  },
  {
    href: '/calculators',
    title: 'Plan with calculators',
    body: 'Investment, borrowing and capital-comparison tools with visible assumptions.',
  },
  {
    href: '/learn',
    title: 'Learn the game',
    body: 'Plain-language guides to margins, ROI, opportunity cost and market decisions.',
  },
] as const;

export default async function HomePage() {
  const realmId = DEFAULT_REALM_ID;
  const overview = await getMarketOverview(realmId);

  const priced = overview.rows.filter((row) => row.quote?.lowestPrice != null);
  const movers = [...priced]
    .filter((row) => row.change24h !== null)
    .sort((a, b) => Math.abs(b.change24h?.percent ?? 0) - Math.abs(a.change24h?.percent ?? 0))
    .slice(0, 6);


  /*
   * Market-wide depth totals are meaningful only when every priced product in the
   * snapshot has a full order-book observation. Ticker-only snapshots deliberately
   * leave these values null.
   */
  const hasCompleteDepth =
    priced.length > 0 &&
    priced.every(
      (row) =>
        row.quote?.totalQuantity != null &&
        row.quote?.offerCount != null,
    );

  const totalSupply = hasCompleteDepth
    ? priced.reduce((sum, row) => sum + (row.quote?.totalQuantity ?? 0), 0)
    : null;

  const totalListings = hasCompleteDepth
    ? priced.reduce((sum, row) => sum + (row.quote?.offerCount ?? 0), 0)
    : null;

  return (
    <div className="space-y-10">
      <section className="pt-4">
        <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Know what the market is doing before you make your next move.
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[var(--text-muted)]">
          Ledgerforge is an independent Sim Companies companion that records exchange prices over time, tracks
          market movement and provides transparent calculators for planning your next move.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/exchange"
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)] transition-opacity hover:opacity-90"
          >
            Browse the Exchange
          </Link>
          <Link
            href="/calculators"
            className="rounded-md border border-[var(--border-strong)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-muted)]"
          >
            Open calculators
          </Link>
        </div>
      </section>

      <section>
        <Card>
          <CardHeader
            title="Market snapshot"
            description="Across every product we track in this realm."
            action={<FreshnessLine kind={overview.degraded ? 'unavailable' : 'collected'} observedAt={overview.observedAt} />}
          />
          <div className="grid grid-cols-2 gap-5 p-4 sm:grid-cols-4 sm:p-5">
            <Stat label="Products priced" value={compactNumber(priced.length)} hint={`of ${overview.rows.length} tracked`} />
            <Stat label="Open listings" value={compactNumber(totalListings)} />
            <Stat label="Units on offer" value={compactNumber(totalSupply)} />
            <Stat
              label="History since"
              value={overview.collectionStartedAt ? new Date(overview.collectionStartedAt).toISOString().slice(0, 10) : '—'}
              hint="Collected by Ledgerforge"
            />
          </div>
        </Card>
      </section>

      <section>
        <div>
          <SectionHeading
            title="Biggest moves, last 24 hours"
            description="Largest absolute price change, up or down."
            action={
              <Link href="/market/movers" className="text-sm text-[var(--accent)] hover:underline">
                All movers
              </Link>
            }
          />
          <Card>
            {movers.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
                Not enough history yet to measure 24-hour movement. Ledgerforge builds this series from its own
                snapshots, so it fills in as collection continues.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {movers.map((row) => (
                  <li key={row.resource.id}>
                    <Link
                      href={`/exchange/${row.resource.slug}`}
                      className="flex items-center justify-between gap-4 px-4 py-2.5 transition-colors hover:bg-[var(--surface-muted)]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{row.resource.name}</span>
                        <span className="block text-xs text-[var(--text-faint)]">{row.resource.category}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-4">
                        <span className="tnum text-sm">{money(row.quote?.lowestPrice ?? null)}</span>
                        <Delta percent={row.change24h?.percent ?? null} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </section>

      <section>
        <SectionHeading title="Start here" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ENTRY_POINTS.map((entry) => (
            <Link
              key={entry.href}
              href={entry.href}
              className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]"
            >
              <p className="text-sm font-semibold">{entry.title}</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{entry.body}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
