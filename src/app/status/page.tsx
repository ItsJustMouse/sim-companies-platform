import Link from 'next/link';
import { collectHealth } from '@/lib/admin/health';
import { Card, CardHeader, Badge, Callout, SectionHeading, Stat } from '@/components/ui/primitives';
import { buildMetadata } from '@/lib/seo';
import { compactNumber, number, relativeTime } from '@/lib/util/format';

export const revalidate = 60;

export const metadata = buildMetadata({
  title: 'Data status',
  description:
    'How fresh Simconomist market data is, where it comes from, how far back our collected history goes, and what is currently degraded.',
  path: '/status',
});

/** Clock reads live outside the component so rendering stays pure. */
function minutesSince(iso: string | null): number | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : (Date.now() - parsed) / 60_000;
}

/**
 * Public data status.
 *
 * A deliberately public page. This product asks people to make in-game money
 * decisions on its numbers, so how current those numbers are should not require an
 * admin login to find out.
 *
 * It shows freshness and coverage only — no request counts, error messages or
 * internal detail, which belong on the admin dashboard.
 */
export default async function StatusPage() {
  const health = await collectHealth();
  const ageMinutes = minutesSince(health.collection.latestTickerAt);

  const state =
    health.fixtureData
      ? { tone: 'danger' as const, label: 'Sample data', text: 'This instance is serving synthetic development data, not real prices.' }
      : ageMinutes === null
        ? { tone: 'danger' as const, label: 'No data', text: 'No market snapshots have been collected yet.' }
        : ageMinutes <= 30
          ? { tone: 'up' as const, label: 'Current', text: 'Prices are being collected on schedule.' }
          : ageMinutes <= 120
            ? { tone: 'warn' as const, label: 'Delayed', text: 'Collection is running behind its usual cadence.' }
            : { tone: 'danger' as const, label: 'Stale', text: 'Collection appears to have stopped. Prices shown may be well out of date.' };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <SectionHeading title="Data status" description="How current the numbers on this site are, right now." />

      <Card>
        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={state.tone}>{state.label}</Badge>
            <p className="text-sm text-[var(--text-muted)]">{state.text}</p>
          </div>
        </div>
      </Card>

      {health.fixtureData ? (
        <Callout tone="danger" title="Sample data is in use">
          Every price on this instance is synthetic. Nothing here reflects the real Sim Companies market.
        </Callout>
      ) : null}

      <Card>
        <CardHeader title="Coverage" />
        <div className="grid grid-cols-2 gap-5 p-4 sm:grid-cols-4 sm:p-5">
          <Stat label="Products tracked" value={number(health.collection.resourceCount)} />
          <Stat label="Headline updated" value={relativeTime(health.collection.latestTickerAt)} />
          <Stat
            label="Headline history since"
            value={health.collection.oldestTickerAt ? health.collection.oldestTickerAt.slice(0, 10) : '—'}
          />
          <Stat label="Headline observations" value={compactNumber(health.collection.tickerSnapshotCount)} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Order-book depth"
          description="Supply, listing counts and quality prices are collected separately from headline prices."
        />
        <div className="grid grid-cols-2 gap-5 p-4 sm:grid-cols-4 sm:p-5">
          <Stat
            label="Fresh depth coverage"
            value={`${number(health.collection.freshDepthProducts)} / ${number(health.collection.resourceCount)}`}
          />
          <Stat label="Latest depth check" value={relativeTime(health.collection.latestOrderBookAt)} />
          <Stat label="Depth observations" value={compactNumber(health.collection.orderBookSnapshotCount)} />
          <Stat label="Freshness window" value="96h" />
        </div>
        <div className="border-t border-[var(--border)] p-4 text-sm leading-relaxed text-[var(--text-muted)] sm:p-5">
          Order-book checks rotate through products more slowly because each one requires its own upstream request.
          Depth is considered fresh for 96 hours; individual product pages show the timestamp of the depth observation
          they are using.
        </div>
      </Card>

      <Card>
        <CardHeader title="Where the data comes from" />
        <div className="space-y-3 p-4 text-sm leading-relaxed text-[var(--text-muted)] sm:p-5">
          <p>
            Headline prices are read from the whole-market Sim Companies ticker by a single background collector and
            cached for the whole site. Deeper order-book data requires separate product-specific checks and is rotated
            more slowly. All upstream requests share the same global pacing because the API is undocumented and
            unsupported, and its operators ask third-party tools not to poll aggressively.
          </p>
          <p>
            That is why nothing here is instantaneous. &ldquo;Real time&rdquo; on this site means as current as the
            source legitimately allows, and every price carries the time it was observed.
          </p>
          <p>
            <strong className="text-[var(--text)]">Price history is ours.</strong> The game provides current market
            observations, not Simconomist&rsquo;s historical series, so every chart is built from snapshots we recorded.
            Series begin when our collection did — we do not have, and will not fabricate, history from before then.
          </p>
          <p>
            The methodology behind every calculated figure is documented on{' '}
            <Link href="/methodology" className="text-[var(--accent)] underline underline-offset-2">
              how we calculate
            </Link>
            .
          </p>
        </div>
      </Card>

      {health.collection.staleTickerProducts > 0 ? (
        <Callout tone="warn">
          {health.collection.staleTickerProducts} products have no headline ticker observation in the last 24 hours.
          Their displayed headline prices may therefore be missing or stale.
        </Callout>
      ) : null}
    </div>
  );
}
