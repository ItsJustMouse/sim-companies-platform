import Link from 'next/link';
import { getMarketOverview } from '@/lib/market/service';
import { scanOpportunities, sortOpportunities } from '@/lib/market/opportunities';
import { DEFAULT_REALM_ID } from '@/lib/game/constants';
import { Card, CardHeader, Delta, SectionHeading, Stat } from '@/components/ui/primitives';
import { FreshnessLine } from '@/components/ui/freshness';
import { money, compactNumber, ratioAsPercent } from '@/lib/util/format';
import { buildMetadata } from '@/lib/seo';

export const revalidate = 120;

export const metadata = buildMetadata({
  title: 'Sim Companies market prices, analytics and calculators',
  description:
    'Live Sim Companies exchange prices with price history, profitability analysis, production calculators and an opportunity scanner that shows what is actually worth producing right now.',
  path: '/',
});

const ENTRY_POINTS = [
  {
    href: '/exchange',
    title: 'Check market prices',
    body: 'Every product, with current price, supply, movement and history.',
  },
  {
    href: '/opportunities',
    title: 'Find profitable products',
    body: 'Ranked by what they actually earn per hour, with the cost breakdown shown.',
  },
  {
    href: '/calculators/production',
    title: 'Work out real profit',
    body: 'Wages, overhead, transport and the exchange fee — not just price minus inputs.',
  },
  {
    href: '/company',
    title: 'Analyse a company',
    body: 'Point it at a company and get specific, numbered recommendations.',
  },
  {
    href: '/learn',
    title: 'Learn the game',
    body: 'Plain-language guides to production, margins, ROI and opportunity cost.',
  },
] as const;

export default async function HomePage() {
  const realmId = DEFAULT_REALM_ID;
  const [overview, scan] = await Promise.all([
    getMarketOverview(realmId),
    scanOpportunities(realmId),
  ]);

  const priced = overview.rows.filter((row) => row.quote?.lowestPrice != null);
  const movers = [...priced]
    .filter((row) => row.change24h !== null)
    .sort((a, b) => Math.abs(b.change24h?.percent ?? 0) - Math.abs(a.change24h?.percent ?? 0))
    .slice(0, 6);

  const topOpportunities = sortOpportunities(scan.opportunities, 'profitPerHour')
    .filter((o) => (o.profitPerHour ?? 0) > 0)
    .slice(0, 5);

  const totalSupply = priced.reduce((sum, row) => sum + (row.quote?.totalQuantity ?? 0), 0);
  const totalListings = priced.reduce((sum, row) => sum + (row.quote?.offerCount ?? 0), 0);

  return (
    <div className="space-y-10">
      <section className="pt-4">
        <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Know what a product is worth, and what it actually costs you to make.
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[var(--text-muted)]">
          Ledgerforge is an independent companion for Sim Companies. It tracks exchange prices over time, works out
          real profit per hour including wages, overhead and fees, and shows its working on every number.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/exchange"
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)] transition-opacity hover:opacity-90"
          >
            Browse the Exchange
          </Link>
          <Link
            href="/opportunities"
            className="rounded-md border border-[var(--border-strong)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-muted)]"
          >
            What should I produce?
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

      <section className="grid gap-6 lg:grid-cols-2">
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

        <div>
          <SectionHeading
            title="Best opportunities right now"
            description="Profit per hour at building level 1, using current prices."
            action={
              <Link href="/opportunities" className="text-sm text-[var(--accent)] hover:underline">
                Full scanner
              </Link>
            }
          />
          <Card>
            {topOpportunities.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
                No profitable production found at current prices under the default assumptions.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {topOpportunities.map((opportunity) => (
                  <li key={opportunity.resource.id}>
                    <Link
                      href={`/exchange/${opportunity.resource.slug}`}
                      className="flex items-center justify-between gap-4 px-4 py-2.5 transition-colors hover:bg-[var(--surface-muted)]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{opportunity.resource.name}</span>
                        <span className="block text-xs text-[var(--text-faint)]">
                          {opportunity.building?.name ?? 'Unknown building'} · margin{' '}
                          {ratioAsPercent(opportunity.margin)}
                        </span>
                      </span>
                      <span className="tnum shrink-0 text-sm font-semibold text-[var(--up)]">
                        {money(opportunity.profitPerHour)}/h
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
