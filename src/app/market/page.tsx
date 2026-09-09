import Link from 'next/link';
import { getMarketOverview } from '@/lib/market/service';
import { DEFAULT_REALM_ID } from '@/lib/game/constants';
import { Card, CardHeader, Callout, Delta, SectionHeading, Stat } from '@/components/ui/primitives';
import { FreshnessLine } from '@/components/ui/freshness';
import { MarketHeatmap } from '@/components/market/heatmap';
import { JsonLd } from '@/components/ui/json-ld';
import { breadcrumbs, buildMetadata } from '@/lib/seo';
import { compactNumber, money, number } from '@/lib/util/format';

export const revalidate = 120;

export const metadata = buildMetadata({
  title: 'Sim Companies market overview',
  description:
    'How the Sim Companies market is moving: gainers, losers, most volatile and most liquid products, category performance and a heatmap of the whole economy.',
  path: '/market',
});

export default async function MarketPage() {
  const realmId = DEFAULT_REALM_ID;
  const overview = await getMarketOverview(realmId);

  const priced = overview.rows.filter((row) => row.quote?.lowestPrice != null);
  const withChange = priced.filter((row) => row.change24h !== null);

  const gainers = [...withChange].sort((a, b) => (b.change24h?.percent ?? 0) - (a.change24h?.percent ?? 0)).slice(0, 8);
  const losers = [...withChange].sort((a, b) => (a.change24h?.percent ?? 0) - (b.change24h?.percent ?? 0)).slice(0, 8);
  const volatile = [...priced]
    .filter((row) => row.volatility7d !== null)
    .sort((a, b) => (b.volatility7d ?? 0) - (a.volatility7d ?? 0))
    .slice(0, 8);
  const liquid = [...priced]
    .filter((row) => row.liquidity !== null)
    .sort((a, b) => (b.liquidity ?? 0) - (a.liquidity ?? 0))
    .slice(0, 8);

  // Category performance: the mean 24-hour change of the products in each category,
  // reported with its sample size so a one-product category is not read as a trend.
  const byCategory = new Map<string, { total: number; count: number }>();
  for (const row of withChange) {
    const key = row.resource.category ?? 'Uncategorised';
    const current = byCategory.get(key) ?? { total: 0, count: 0 };
    byCategory.set(key, { total: current.total + (row.change24h?.percent ?? 0), count: current.count + 1 });
  }
  const categories = [...byCategory.entries()]
    .map(([name, stats]) => ({ name, average: stats.total / stats.count, count: stats.count }))
    .sort((a, b) => b.average - a.average);

  const advancing = withChange.filter((r) => (r.change24h?.percent ?? 0) > 0).length;
  const declining = withChange.filter((r) => (r.change24h?.percent ?? 0) < 0).length;

  /*
   * A ticker snapshot knows headline prices but not order-book depth.
   * Do not present a partial sum as if it were total market supply.
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

  return (
    <div className="space-y-6">
      <JsonLd data={breadcrumbs([{ name: 'Home', path: '/' }, { name: 'Market', path: '/market' }])} />

      <SectionHeading
        title="Market overview"
        description="How the whole economy is moving over the last 24 hours."
        action={<FreshnessLine kind={overview.degraded ? 'unavailable' : 'collected'} observedAt={overview.observedAt} />}
      />

      {withChange.length === 0 ? (
        <Callout tone="info" title="Not enough history yet">
          Movement is measured against our own snapshots. Once collection has been running for a day, this page fills
          in. The game does not publish price history, so there is nothing to backfill from.
        </Callout>
      ) : null}

      <Card>
        <div className="grid grid-cols-2 gap-5 p-4 sm:grid-cols-4 sm:p-5">
          <Stat label="Advancing" value={number(advancing)} tone="up" hint={`of ${withChange.length} measured`} />
          <Stat label="Declining" value={number(declining)} tone="down" />
          <Stat label="Products priced" value={number(priced.length)} hint={`of ${overview.rows.length} tracked`} />
          <Stat
            label="Total supply"
            value={compactNumber(totalSupply)}
            hint={hasCompleteDepth ? 'Units on offer' : 'Depth not measured by ticker'}
          />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <MoverList title="Top gainers" description="Largest 24-hour rise." rows={gainers} />
        <MoverList title="Top losers" description="Largest 24-hour fall." rows={losers} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Most volatile" description="Largest swing in price over the last 7 days." />
          <ul className="divide-y divide-[var(--border)]">
            {volatile.map((row) => (
              <li key={row.resource.id}>
                <Link
                  href={`/exchange/${row.resource.slug}`}
                  className="flex items-center justify-between gap-4 px-4 py-2 text-sm hover:bg-[var(--surface-muted)]"
                >
                  <span className="truncate">{row.resource.name}</span>
                  <span className="tnum text-[var(--warn)]">{row.volatility7d?.toFixed(1)}%</span>
                </Link>
              </li>
            ))}
            {volatile.length === 0 ? <li className="px-4 py-6 text-sm text-[var(--text-muted)]">Not enough history.</li> : null}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Most liquid" description="Deepest, most widely-distributed order books." />
          <ul className="divide-y divide-[var(--border)]">
            {liquid.map((row) => (
              <li key={row.resource.id}>
                <Link
                  href={`/exchange/${row.resource.slug}`}
                  className="flex items-center justify-between gap-4 px-4 py-2 text-sm hover:bg-[var(--surface-muted)]"
                >
                  <span className="truncate">{row.resource.name}</span>
                  <span className="flex items-center gap-3">
                    <span className="tnum text-xs text-[var(--text-faint)]">
                      {compactNumber(row.quote?.totalQuantity ?? null)} units
                    </span>
                    <span className="tnum font-medium">{row.liquidity}</span>
                  </span>
                </Link>
              </li>
            ))}
            {liquid.length === 0 ? (
              <li className="px-4 py-6 text-sm text-[var(--text-muted)]">
                No order-book depth observations available.
              </li>
            ) : null}
          </ul>
        </Card>
      </div>

      {categories.length > 0 ? (
        <Card>
          <CardHeader title="Category performance" description="Mean 24-hour change across the products in each category." />
          <ul className="divide-y divide-[var(--border)]">
            {categories.map((category) => (
              <li key={category.name} className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
                <span>
                  {category.name}
                  <span className="ml-2 text-xs text-[var(--text-faint)]">
                    {category.count} {category.count === 1 ? 'product' : 'products'}
                  </span>
                </span>
                <Delta percent={category.average} />
              </li>
            ))}
          </ul>
          <p className="border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--text-faint)]">
            A category holding one or two products moves with that product, not with an industry. Sample sizes are
            shown for that reason.
          </p>
        </Card>
      ) : null}

      <div>
        <SectionHeading title="Heatmap" description="Every tracked product, grouped by category and shaded by 24-hour move." />
        <MarketHeatmap
          cells={overview.rows.map((row) => ({
            id: row.resource.id,
            name: row.resource.name,
            slug: row.resource.slug,
            category: row.resource.category,
            change: row.change24h?.percent ?? null,
            price: row.quote?.lowestPrice ?? null,
          }))}
        />
      </div>
    </div>
  );
}

function MoverList({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: readonly Awaited<ReturnType<typeof getMarketOverview>>['rows'][number][];
}) {
  return (
    <Card>
      <CardHeader
        title={title}
        description={description}
        action={
          <Link href="/market/movers" className="text-xs text-[var(--accent)] hover:underline">
            See all
          </Link>
        }
      />
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-[var(--text-muted)]">Not enough history to rank movement yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {rows.map((row) => (
            <li key={row.resource.id}>
              <Link
                href={`/exchange/${row.resource.slug}`}
                className="flex items-center justify-between gap-4 px-4 py-2 text-sm hover:bg-[var(--surface-muted)]"
              >
                <span className="min-w-0 truncate">{row.resource.name}</span>
                <span className="flex shrink-0 items-center gap-4">
                  <span className="tnum text-[var(--text-muted)]">{money(row.quote?.lowestPrice ?? null)}</span>
                  <Delta percent={row.change24h?.percent ?? null} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
