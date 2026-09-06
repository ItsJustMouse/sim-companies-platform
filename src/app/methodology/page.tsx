import Link from 'next/link';
import { GAME_CONSTANTS } from '@/lib/game/constants';
import { Card, CardHeader, Badge } from '@/components/ui/primitives';
import { JsonLd } from '@/components/ui/json-ld';
import { breadcrumbs, buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'How we calculate',
  description:
    'Every formula Ledgerforge uses for Sim Companies profitability, with its source, our confidence in it, and what we deliberately do not model.',
  path: '/methodology',
});

const CONFIDENCE_TONE = { official: 'up', 'community-consensus': 'neutral', unconfirmed: 'warn' } as const;
const CONFIDENCE_LABEL = {
  official: 'Official',
  'community-consensus': 'Community consensus',
  unconfirmed: 'Unconfirmed',
} as const;

/**
 * Public methodology page.
 *
 * Reads the same constants the calculators use, so it cannot drift out of date with
 * the numbers it describes.
 */
export default function MethodologyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <JsonLd data={breadcrumbs([{ name: 'Home', path: '/' }, { name: 'Methodology', path: '/methodology' }])} />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">How we calculate</h1>
        <p className="mt-2 leading-relaxed text-[var(--text-muted)]">
          The game&rsquo;s operators do not publish its formulas, and there is no official API documentation. Rather
          than present inferred mechanics as fact, everything we rely on is listed here with how confident we are in
          it — and every calculation in the product carries the same information alongside its result.
        </p>
      </div>

      <Card>
        <CardHeader title="The core production formula" description="Every profit figure on this site resolves to this." />
        <div className="overflow-x-auto p-4 sm:p-5">
          <pre className="font-mono text-xs leading-relaxed text-[var(--text-muted)]">
{`unitsPerHour       = baseUnitsPerHour x buildingLevel x (1 + productionBonus) x abundance
hourlyWages        = wagesPerHourPerLevel x buildingLevel x (robots ? robotMultiplier : 1)
labourPerUnit      = hourlyWages / unitsPerHour x (1 + adminOverhead)
inputCostPerUnit   = sum(inputAmount x inputUnitPrice)
transportPerUnit   = transportUnits x transportUnitCost x (contract ? contractShare : 1)
netRevenuePerUnit  = salePrice x (exchange ? 1 - exchangeFee : 1)

profitPerUnit      = netRevenuePerUnit - inputCostPerUnit - labourPerUnit - transportPerUnit
profitPerHour      = profitPerUnit x unitsPerHour
breakEvenPrice     = totalCostPerUnit / (exchange ? 1 - exchangeFee : 1)`}
          </pre>
          <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
            Building level cancels out of profit <em>per unit</em> — it scales output and wages equally — but not out
            of profit <em>per hour</em>, which is why both are always reported.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Constants, and how much to trust them" />
        <ul className="divide-y divide-[var(--border)]">
          {Object.entries(GAME_CONSTANTS).map(([key, constant]) => (
            <li key={key} className="px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="tnum text-sm font-medium text-[var(--text)]">
                  {key.replace(/_/g, ' ').toLowerCase()}: {String(constant.value)}
                </span>
                <Badge tone={CONFIDENCE_TONE[constant.confidence]}>{CONFIDENCE_LABEL[constant.confidence]}</Badge>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">{constant.source}</p>
              {constant.caveat ? (
                <p className="mt-1 text-xs leading-relaxed text-[var(--warn)]">{constant.caveat}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title="What we deliberately do not model" />
        <div className="space-y-3 p-4 text-sm leading-relaxed text-[var(--text-muted)] sm:p-5">
          <p>
            <strong className="text-[var(--text)]">Retail demand.</strong> How a store&rsquo;s sale rate responds to
            price, quality and local demand is not published anywhere we could verify. The retail calculator therefore
            takes the throughput you observe in your own store and does exact arithmetic around it, rather than
            inventing a demand curve and dressing it up as a prediction.
          </p>
          <p>
            <strong className="text-[var(--text)]">Order-book depth in headline prices.</strong> A product&rsquo;s
            listed price is the cheapest open offer. If you need more units than that offer holds, you will pay more.
            We show depth and liquidity beside every price for this reason, but headline figures use the cheapest
            listing.
          </p>
          <p>
            <strong className="text-[var(--text)]">Future prices.</strong> Nothing here forecasts. Every projection is
            arithmetic on prices observed at a stated moment, and prices move.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="How prices and history are gathered" />
        <div className="space-y-3 p-4 text-sm leading-relaxed text-[var(--text-muted)] sm:p-5">
          <p>
            A single background collector reads the Exchange on a schedule and stores a summary of each order book.
            Charts are built from those snapshots — the game publishes no price history, so a series starts when our
            collection did and we never imply otherwise.
          </p>
          <p>
            Percentage changes compare the latest observation against the one closest to the requested age, and only
            when an observation exists near enough to that point. When it does not, the figure is a dash rather than a
            number we cannot stand behind.
          </p>
          <p>
            Current freshness is on the{' '}
            <Link href="/status" className="text-[var(--accent)] underline underline-offset-2">
              data status
            </Link>{' '}
            page.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Found something wrong?" />
        <div className="p-4 text-sm leading-relaxed text-[var(--text-muted)] sm:p-5">
          <p>
            If a figure here disagrees with what you see in-game, the discrepancy is worth more to us than the
            calculator is. Our confidence ratings are honest about which mechanics we have inferred rather than
            confirmed, and corrections from players are how those get better.
          </p>
        </div>
      </Card>
    </div>
  );
}
