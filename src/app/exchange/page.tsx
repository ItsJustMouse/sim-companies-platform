import { getMarketOverview } from '@/lib/market/service';
import { marketRepository } from '@/lib/market/service';
import { DEFAULT_REALM_ID } from '@/lib/game/constants';
import { ExchangeTable, type ExchangeRow } from '@/components/exchange/exchange-table';
import { Callout, SectionHeading } from '@/components/ui/primitives';
import { FreshnessLine } from '@/components/ui/freshness';
import { ExportLinks } from '@/components/ui/export-links';
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
      quantity: row.quote?.totalQuantity ?? null,
      offers: row.quote?.offerCount ?? null,
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
        description="Every tracked product, with headline price, recent movement and order-book depth where measured."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <ExportLinks dataset="market" />
            <FreshnessLine
            kind={overview.degraded ? 'unavailable' : 'collected'}
            observedAt={overview.observedAt}
            note={
              overview.collectionStartedAt
                ? `history since ${new Date(overview.collectionStartedAt).toISOString().slice(0, 10)}`
                : undefined
            }
            />
          </div>
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
          {overview.unpricedCount} of {overview.rows.length} products are currently reported without a headline market
          price. They are shown with a dash rather than a zero.
        </Callout>
      ) : null}

      <ExchangeTable rows={rows} qualities={qualities} />

      <p className="text-xs leading-relaxed text-[var(--text-faint)]">
        Headline prices come from the Sim Companies market ticker. The ticker does not identify the quality, quantity
        or seller behind that price, so supply, liquidity and quality-specific values are shown only when Ledgerforge
        has measured a full order book. Percentage changes compare against the closest recorded observation to the
        stated age; when no suitable observation exists the cell shows a dash.
      </p>
    </div>
  );
}
