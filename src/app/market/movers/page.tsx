import Link from 'next/link';
import { getMarketOverview } from '@/lib/market/service';
import { DEFAULT_REALM_ID } from '@/lib/game/constants';
import { Card, Callout, Delta, SectionHeading } from '@/components/ui/primitives';
import { FreshnessLine } from '@/components/ui/freshness';
import { JsonLd } from '@/components/ui/json-ld';
import { breadcrumbs, buildMetadata } from '@/lib/seo';
import { compactNumber, money } from '@/lib/util/format';

export const revalidate = 120;

export const metadata = buildMetadata({
  title: 'Sim Companies gainers and losers',
  description:
    'Every Sim Companies product ranked by price movement over 1 hour, 24 hours and 7 days, with supply and liquidity alongside so a big move can be read in context.',
  path: '/market/movers',
});

/**
 * Full movers table.
 *
 * Movement is shown next to liquidity on purpose: a 40% move on a market with three
 * listings is noise, and separating the two invites a reader to act on it.
 */
export default async function MoversPage() {
  const overview = await getMarketOverview(DEFAULT_REALM_ID);

  const rows = overview.rows
    .filter((row) => row.change24h !== null || row.change7d !== null || row.change1h !== null)
    .sort((a, b) => Math.abs(b.change24h?.percent ?? 0) - Math.abs(a.change24h?.percent ?? 0));

  return (
    <div className="space-y-4">
      <JsonLd
        data={breadcrumbs([
          { name: 'Home', path: '/' },
          { name: 'Market', path: '/market' },
          { name: 'Movers', path: '/market/movers' },
        ])}
      />

      <SectionHeading
        title="Gainers and losers"
        description="Ranked by the size of the 24-hour move, in either direction."
        action={<FreshnessLine kind="collected" observedAt={overview.observedAt} />}
      />

      {rows.length === 0 ? (
        <Callout tone="info" title="Nothing to rank yet">
          Price movement is measured against snapshots we recorded ourselves. This page fills in once collection has
          been running long enough to compare two points in time.
        </Callout>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">All products ranked by 24-hour price movement</caption>
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)] text-left text-xs text-[var(--text-muted)]">
                  <th scope="col" className="px-4 py-2 font-medium">Product</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Price</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">1h</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">24h</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">7d</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Supply</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Liquidity</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.resource.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-muted)]">
                    <th scope="row" className="px-4 py-1.5 text-left font-normal">
                      <Link href={`/exchange/${row.resource.slug}`} className="font-medium hover:text-[var(--accent)]">
                        {row.resource.name}
                      </Link>
                      <span className="ml-2 text-xs text-[var(--text-faint)]">{row.resource.category}</span>
                    </th>
                    <td className="tnum px-4 py-1.5 text-right">{money(row.quote?.lowestPrice ?? null)}</td>
                    <td className="px-4 py-1.5 text-right"><Delta percent={row.change1h?.percent ?? null} /></td>
                    <td className="px-4 py-1.5 text-right"><Delta percent={row.change24h?.percent ?? null} /></td>
                    <td className="px-4 py-1.5 text-right"><Delta percent={row.change7d?.percent ?? null} /></td>
                    <td className="tnum px-4 py-1.5 text-right text-[var(--text-muted)]">
                      {compactNumber(row.quote?.totalQuantity ?? null)}
                    </td>
                    <td className="tnum px-4 py-1.5 text-right text-[var(--text-muted)]">{row.liquidity ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="text-xs leading-relaxed text-[var(--text-faint)]">
        Read movement alongside liquidity. A large percentage move on a market with a handful of listings usually means
        one seller repriced, not that the product is now worth more. A dash means we have no observation close enough
        to that point in time to measure a change honestly.
      </p>
    </div>
  );
}
