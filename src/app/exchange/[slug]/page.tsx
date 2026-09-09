import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DEFAULT_REALM_ID } from '@/lib/game/constants';
import { findResource } from '@/lib/catalog/service';
import { getHistory, getQuote, getMarketOverview } from '@/lib/market/service';
import { Card, CardHeader, Callout, Delta, Stat, Badge } from '@/components/ui/primitives';
import { DataAge, FreshnessLine } from '@/components/ui/freshness';
import { ChartPanel } from '@/components/product/chart-panel';
import { ExportLinks } from '@/components/ui/export-links';
import { JsonLd } from '@/components/ui/json-ld';
import { breadcrumbs, buildMetadata, siteUrl } from '@/lib/seo';
import { compactNumber, money, number, ratioAsPercent } from '@/lib/util/format';
import { priceChange, summarise, volatility } from '@/lib/market/statistics';

export const revalidate = 120;
export const dynamicParams = true;

/**
 * Product detail page.
 *
 * This is the page most search traffic will land on, so it has to be genuinely
 * useful rather than a price with padding around it: current price, recorded
 * history, market range, quality/depth information and clear data-freshness
 * context.
 */

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  // Pre-render nothing at build time: the catalog comes from a database that is
  // empty during a container build. Pages are generated on first request and then
  // cached, which reaches the same steady state without coupling build to data.
  return [];
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const resource = await findResource(DEFAULT_REALM_ID, slug);
  if (!resource) {
    return buildMetadata({
      title: 'Product not found',
      description: 'This product is not in our catalog.',
      path: `/exchange/${slug}`,
      index: false,
    });
  }

  return buildMetadata({
    title: `${resource.name} price and market history`,
    description: `Current Sim Companies exchange price for ${resource.name}, with Simconomist-collected price history, market range, quality pricing and data freshness.`,
    path: `/exchange/${resource.slug}`,
  });
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const realmId = DEFAULT_REALM_ID;

  const resource = await findResource(realmId, slug);
  if (!resource) notFound();

  const [quoteResult, history, overview] = await Promise.all([
    getQuote(realmId, resource.id),
    getHistory({ realmId, resourceId: resource.id, rangeHours: 24 * 30 }),
    getMarketOverview(realmId),
  ]);

  const quote = quoteResult.quote;
  const depthQuote = quoteResult.depthQuote;
  const series = history.points;
  const stats = summarise(series);
  const change24h = priceChange(series, 24);
  const change7d = priceChange(series, 24 * 7);
  const change30d = priceChange(series, 24 * 30);
  const vol = volatility(series.slice(-168));

  const related = overview.rows
    .filter((row) => row.resource.category === resource.category && row.resource.id !== resource.id)
    .slice(0, 8);

  const qualityRows = Object.entries(depthQuote?.pricesByQuality ?? {})
    .map(([q, price]) => ({ quality: Number(q), price }))
    .sort((a, b) => a.quality - b.quality);

  return (
    <div className="space-y-6">
      <JsonLd
        data={breadcrumbs([
          { name: 'Home', path: '/' },
          { name: 'Exchange', path: '/exchange' },
          { name: resource.name, path: `/exchange/${resource.slug}` },
        ])}
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: resource.name,
          category: resource.category ?? undefined,
          url: siteUrl(`/exchange/${resource.slug}`),
          description: `Sim Companies in-game commodity with Simconomist-collected exchange price history and market analysis.`,
        }}
      />

      <nav aria-label="Breadcrumb" className="text-xs text-[var(--text-muted)]">
        <Link href="/exchange" className="hover:text-[var(--text)]">Exchange</Link>
        <span className="mx-1.5 text-[var(--text-faint)]">/</span>
        <span className="text-[var(--text)]">{resource.name}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{resource.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-[var(--text-muted)]">
            {resource.category ? <Badge>{resource.category}</Badge> : null}
            <span>Product ID {resource.id}</span>
            {resource.retailable ? <Badge tone="accent">Retailable</Badge> : null}
          </div>
        </div>
        <div className="space-y-1.5">
          <FreshnessLine
            kind={quoteResult.freshness}
            observedAt={quoteResult.observedAt}
            note="Headline ticker"
          />
          {depthQuote ? (
            <FreshnessLine
              kind={quoteResult.depthFreshness}
              observedAt={quoteResult.depthObservedAt}
              note="Order-book depth"
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
              <Badge>Depth not measured</Badge>
              <span className="text-[var(--text-faint)]">· Order-book depth</span>
            </div>
          )}
        </div>
      </header>

      {quoteResult.freshness === 'unavailable' ? (
        <Callout tone="danger" title="No headline market price">
          The market ticker currently reports no headline price for {resource.name}, or Simconomist has not recorded
          a usable price observation for this product yet.
        </Callout>
      ) : null}

      <Card>
        <div className="grid grid-cols-2 gap-5 p-4 sm:grid-cols-3 lg:grid-cols-6 sm:p-5">
          <Stat
            label="Price"
            value={money(quote?.lowestPrice ?? null)}
            size="lg"
            hint={
              quote?.source === 'ticker'
                ? 'Headline market ticker price'
                : 'Cheapest measured open offer'
            }
          />
          <Stat label="24h" value={<Delta percent={change24h?.percent ?? null} />} />
          <Stat label="7d" value={<Delta percent={change7d?.percent ?? null} />} />
          <Stat label="30d" value={<Delta percent={change30d?.percent ?? null} />} />
          <Stat
            label="Supply"
            value={compactNumber(depthQuote?.totalQuantity ?? null)}
            hint={
              depthQuote?.offerCount == null ? (
                'Order-book depth not measured'
              ) : (
                <span>
                  {depthQuote.offerCount} listings ·{' '}
                  <DataAge
                    observedAt={quoteResult.depthObservedAt}
                    prefix="Measured"
                  />
                </span>
              )
            }
          />
          <Stat
            label="Volatility (7d)"
            value={vol === null ? '—' : `${vol.toFixed(1)}%`}
            hint="Std. dev. of returns"
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Price history"
          description="Recorded by Simconomist from its own snapshots."
          action={<ExportLinks dataset="history" params={{ resourceId: resource.id, realmId, rangeHours: 24 * 365 }} />}
        />
        <div className="p-4 sm:p-5">
          <ChartPanel
            points={series}
            collectionStartedAt={history.collectionStartedAt}
            productName={resource.name}
            resourceId={resource.id}
            realmId={realmId}
            initialRange="1M"
          />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader
            title="Price by quality"
            description="Cheapest offer at each quality or better."
            action={
              depthQuote ? (
                <DataAge
                  observedAt={quoteResult.depthObservedAt}
                  prefix="Measured"
                  className="text-xs text-[var(--text-muted)]"
                />
              ) : undefined
            }
          />
          {qualityRows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[var(--text-muted)]">
              {depthQuote?.offerCount === 0
                ? 'No open listings in the last measured order book.'
                : 'Order-book quality depth has not been measured yet.'}
            </p>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">Cheapest price for {resource.name} at each quality level</caption>
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                  <th scope="col" className="px-4 py-2 font-medium">Quality</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Price</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">vs Q0</th>
                </tr>
              </thead>
              <tbody>
                {qualityRows.map((row) => {
                  const baseline = qualityRows[0]?.price ?? null;
                  const premium = baseline && baseline > 0 ? ((row.price - baseline) / baseline) * 100 : null;
                  return (
                    <tr key={row.quality} className="border-b border-[var(--border)] last:border-0">
                      <th scope="row" className="px-4 py-1.5 text-left font-normal">Q{row.quality}</th>
                      <td className="tnum px-4 py-1.5 text-right font-medium">{money(row.price)}</td>
                      <td className="tnum px-4 py-1.5 text-right text-[var(--text-muted)]">
                        {premium === null || row.quality === 0 ? '—' : `+${premium.toFixed(1)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Market range"
            description="Where the current price sits against the collected history."
          />
          <div className="grid grid-cols-2 gap-5 p-4 sm:grid-cols-4 sm:p-5">
            <Stat label="Period low" value={money(stats.low)} />
            <Stat label="Period high" value={money(stats.high)} />
            <Stat label="Period average" value={money(stats.average)} />
            <Stat
              label="Position in range"
              value={stats.positionInRange === null ? '—' : ratioAsPercent(stats.positionInRange, 0)}
              hint={
                stats.positionInRange === null
                  ? 'Flat or insufficient history'
                  : stats.positionInRange > 0.8
                    ? 'Near the top of its range'
                    : stats.positionInRange < 0.2
                      ? 'Near the bottom of its range'
                      : 'Mid-range'
              }
            />
          </div>
          <p className="border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--text-faint)] sm:px-5">
            Based on {number(stats.sampleCount)} observations. &ldquo;Unusually high&rdquo; is a statement about our
            collected history, not about the game&rsquo;s full price record, which is not published.
          </p>
        </Card>
      </div>



      {related.length > 0 ? (
        <Card>
          <CardHeader title={`Other ${resource.category ?? 'products'}`} />
          <ul className="divide-y divide-[var(--border)]">
            {related.map((row) => (
              <li key={row.resource.id}>
                <Link
                  href={`/exchange/${row.resource.slug}`}
                  className="flex items-center justify-between gap-4 px-4 py-2 text-sm transition-colors hover:bg-[var(--surface-muted)] sm:px-5"
                >
                  <span>{row.resource.name}</span>
                  <span className="flex items-center gap-4">
                    <span className="tnum">{money(row.quote?.lowestPrice ?? null)}</span>
                    <Delta percent={row.change24h?.percent ?? null} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
