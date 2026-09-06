import { getMarketOverview } from '@/lib/market/service';
import { marketRepository } from '@/lib/market/service';
import { DEFAULT_REALM_ID } from '@/lib/game/constants';
import { ExchangeTable, type ExchangeRow } from '@/components/exchange/exchange-table';
import { Callout, SectionHeading } from '@/components/ui/primitives';
import { FreshnessLine } from '@/components/ui/freshness';
import { buildMetadata, breadcrumbs } from '@/lib/seo';
import { JsonLd } from '@/components/ui/json-ld';

export const revalidate = 120;

export const metadata = buildMetadata({
  title: 'Sim Companies exchange prices',
  description:
    'Current Sim Companies exchange prices for every product, with supply, listing depth, 24-hour and 7-day movement, volatility and 30-day trend. Sort, filter and follow the products you care about.',
  path: '/exchange',
});

/** Clock reads are kept out of the component body so rendering stays pure. */
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 3_600_000);
}

export default async function ExchangePage() {
  const realmId = DEFAULT_REALM_ID;
  const overview = await getMarketOverview(realmId);

  const since = daysAgo(30);
  const histories = await marketRepository.historyForResources(
    realmId,
    overview.rows.map((row) => row.resource.id),
    since,
  );

  const rows: ExchangeRow[] = overview.rows.map((row) => {
    const series = histories.get(row.resource.id) ?? [];
    // The sparkline is a shape, not a data table: downsample to at most 40 points so
    // the payload stays small on a page that may carry hundreds of rows.
    const stride = Math.max(1, Math.ceil(series.length / 40));
    const spark = series.filter((_, index) => index % stride === 0).map((point) => point.price);

    return {
      id: row.resource.id,
      name: row.resource.name,
      slug: row.resource.slug,
      category: row.resource.category,
      price: row.quote?.lowestPrice ?? null,
      pricesByQuality: row.quote?.pricesByQuality ?? {},
      change1h: row.change1h?.percent ?? null,
      change24h: row.change24h?.percent ?? null,
      change7d: row.change7d?.percent ?? null,
      volatility: row.volatility7d,
      liquidity: row.liquidity,
      quantity: row.quote?.totalQuantity ?? 0,
      offers: row.quote?.offerCount ?? 0,
      spark,
      observedAt: row.observedAt,
    };
  });

  const qualities = [
    ...new Set(overview.rows.flatMap((row) => row.quote?.qualitiesAvailable ?? [])),
  ].sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      <JsonLd
        data={breadcrumbs([
          { name: 'Home', path: '/' },
          { name: 'Exchange', path: '/exchange' },
        ])}
      />

      <SectionHeading
        title="Exchange"
        description="Every tracked product, with current price, supply and recent movement."
        action={
          <FreshnessLine
            kind={overview.degraded ? 'unavailable' : 'collected'}
            observedAt={overview.observedAt}
            note={
              overview.collectionStartedAt
                ? `history since ${new Date(overview.collectionStartedAt).toISOString().slice(0, 10)}`
                : undefined
            }
          />
        }
      />

      {overview.degraded ? (
        <Callout tone="danger" title="No market data">
          Ledgerforge has no price observations for this realm yet. Prices appear once the collection worker has
          completed its first sweep.
        </Callout>
      ) : null}

      {overview.unpricedCount > 0 ? (
        <Callout tone="info">
          {overview.unpricedCount} of {overview.rows.length} products have no current listings. They are shown with a
          dash rather than a zero — an empty order book is not a price of nothing.
        </Callout>
      ) : null}

      <ExchangeTable rows={rows} qualities={qualities.length > 0 ? qualities : [0]} />

      <p className="text-xs leading-relaxed text-[var(--text-faint)]">
        Prices are the cheapest open sell offer observed at the time shown. Percentage changes compare against the
        closest observation to the stated age; when we have no observation near that point the cell shows a dash
        rather than a number we cannot stand behind. Volatility is the standard deviation of period-over-period
        returns, so products at very different price levels are directly comparable.
      </p>
    </div>
  );
}
