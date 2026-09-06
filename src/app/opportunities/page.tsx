import { DEFAULT_REALM_ID } from '@/lib/game/constants';
import { scanOpportunities } from '@/lib/market/opportunities';
import { ScannerView, type ScannerRow } from '@/components/opportunities/scanner-view';
import { Callout, SectionHeading } from '@/components/ui/primitives';
import { FreshnessLine } from '@/components/ui/freshness';
import { JsonLd } from '@/components/ui/json-ld';
import { breadcrumbs, buildMetadata } from '@/lib/seo';

export const revalidate = 120;

export const metadata = buildMetadata({
  title: 'What is worth producing right now',
  description:
    'Every Sim Companies product ranked by real profit per hour at current exchange prices, with the full cost breakdown, the reason for each ranking, and the risks worth checking before you commit capital.',
  path: '/opportunities',
});

export default async function OpportunitiesPage() {
  const realmId = DEFAULT_REALM_ID;
  const scan = await scanOpportunities(realmId);

  const rows: ScannerRow[] = scan.opportunities.map((opportunity) => ({
    id: opportunity.resource.id,
    name: opportunity.resource.name,
    slug: opportunity.resource.slug,
    category: opportunity.resource.category,
    buildingName: opportunity.building?.name ?? null,
    buildingCost: opportunity.building?.cost ?? null,
    salePrice: opportunity.salePrice,
    // Sent at the server's baseline — level 1, no bonus, no overhead — so the
    // client can rescale against whatever assumptions the reader chooses.
    baseInputCostPerUnit: opportunity.inputCostPerUnit,
    baseLabourPerUnit: opportunity.labourCostPerUnit,
    baseTransportPerUnit: opportunity.transportCostPerUnit,
    baseUnitsPerHour: opportunity.unitsPerHour,
    netRevenuePerUnit: opportunity.netRevenuePerUnit,
    breakEvenSalePrice: opportunity.breakEvenSalePrice,
    liquidity: opportunity.liquidity,
    volatility: opportunity.volatility7d,
    change24h: opportunity.change24h,
    quantity: opportunity.totalQuantity,
    offers: opportunity.offerCount,
    inputNames: opportunity.inputs.map((input) => input.resourceName),
    reasons: [...opportunity.reasons],
    cautions: [...opportunity.cautions],
    incomplete: opportunity.incomplete,
  }));

  return (
    <div className="space-y-4">
      <JsonLd
        data={breadcrumbs([
          { name: 'Home', path: '/' },
          { name: 'Opportunities', path: '/opportunities' },
        ])}
      />

      <SectionHeading
        title="Opportunity scanner"
        description="Every product priced against the market, ranked by what it would actually earn you."
        action={<FreshnessLine kind="derived" observedAt={scan.observedAt} />}
      />

      {scan.evaluated === 0 ? (
        <Callout tone="danger" title="Nothing to rank yet">
          The scanner needs both a synced game catalog and at least one market snapshot. Run the ingestion worker, then
          come back.
        </Callout>
      ) : null}

      {scan.skipped > 0 ? (
        <Callout tone="info">
          {scan.skipped} products were left out because we are missing something needed to assess them — a producing
          building&rsquo;s wage rate, a base production rate, or a current price. They are excluded rather than ranked
          at zero, which would put unmeasurable products above genuinely loss-making ones.
        </Callout>
      ) : null}

      <ScannerView rows={rows} observedAt={scan.observedAt} />
    </div>
  );
}
