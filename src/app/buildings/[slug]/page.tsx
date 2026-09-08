import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DEFAULT_REALM_ID } from '@/lib/game/constants';
import { getBuildings, getResourceIndex } from '@/lib/catalog/service';
import { getMarketOverview } from '@/lib/market/service';
import { calculateProduction } from '@/lib/calc/production';
import { catalogRepository } from '@/lib/catalog/service';
import { safeRead } from '@/lib/db/client';
import { Card, CardHeader, Callout, Stat } from '@/components/ui/primitives';
import { JsonLd } from '@/components/ui/json-ld';
import { breadcrumbs, buildMetadata } from '@/lib/seo';
import { duration, money, ratioAsPercent } from '@/lib/util/format';

export const revalidate = 600;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const { data: buildings } = await getBuildings(DEFAULT_REALM_ID);
  const building = buildings.find((b) => b.slug === slug);

  if (!building) {
    return buildMetadata({ title: 'Building not found', description: '', path: `/buildings/${slug}`, index: false });
  }

  return buildMetadata({
    title: `${building.name} — cost, wages and what to produce`,
    description: `Construction cost, hourly wage bill and build time for the Sim Companies ${building.name}, with every product it can make ranked by current profit per hour.`,
    path: `/buildings/${building.slug}`,
    index: false,
  });
}

/**
 * Building detail.
 *
 * The useful question about a building is not "what are its stats" but "what should
 * I put in it", so its production lines are ranked by what each currently earns.
 */
export default async function BuildingPage({ params }: PageProps) {
  const { slug } = await params;
  const realmId = DEFAULT_REALM_ID;

  const { data: buildings } = await getBuildings(realmId);
  const building = buildings.find((b) => b.slug === slug);
  if (!building) notFound();

  const [overview, resourceIndex, recipes] = await Promise.all([
    getMarketOverview(realmId),
    getResourceIndex(realmId),
    safeRead(() => catalogRepository.listRecipes(realmId), [], 'building:listRecipes'),
  ]);

  const rowById = new Map(overview.rows.map((row) => [row.resource.id, row]));
  const recipeById = new Map(recipes.map((r) => [r.outputResourceId, r]));

  // Every resource this building can produce, from both its own production lines and
  // any recipe that names it.
  const producibleIds = new Set<number>();
  for (const line of building.production) if (line.resourceId !== null) producibleIds.add(line.resourceId);
  for (const recipe of recipes) if (recipe.producedIn.includes(building.kind)) producibleIds.add(recipe.outputResourceId);

  const options = [...producibleIds]
    .map((resourceId) => {
      const resource = resourceIndex.get(resourceId);
      const row = rowById.get(resourceId);
      if (!resource || resource.baseUnitsPerHour === null || building.wagesPerHourPerLevel === null) return null;

      const recipe = recipeById.get(resourceId);
      const calculation = calculateProduction({
        outputName: resource.name,
        baseUnitsPerHour: resource.baseUnitsPerHour,
        buildingLevel: 1,
        wagesPerHourPerLevel: building.wagesPerHourPerLevel,
        inputs: (recipe?.inputs ?? []).map((input) => ({
          resourceId: input.resourceId,
          resourceName: input.resourceName ?? resourceIndex.get(input.resourceId)?.name ?? `#${input.resourceId}`,
          amountPerUnit: input.amount,
          unitPrice: rowById.get(input.resourceId)?.quote?.lowestPrice ?? null,
          priceSource: 'market' as const,
        })),
        salePrice: row?.quote?.lowestPrice ?? null,
        salePriceObservedAt: row?.observedAt ?? null,
        saleChannel: 'exchange',
        transportUnitsPerUnit: resource.transportUnits,
        transportUnitCost: 0,
      });

      return { resource, result: calculation.result };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => (b.result.profitPerHour ?? -Infinity) - (a.result.profitPerHour ?? -Infinity));

  const best = options[0];
  const payback =
    building.cost && building.cost > 0 && (best?.result.profitPerHour ?? 0) > 0
      ? building.cost / (best?.result.profitPerHour as number)
      : null;

  return (
    <div className="space-y-5">
      <JsonLd
        data={breadcrumbs([
          { name: 'Home', path: '/' },
          { name: 'Buildings', path: '/buildings' },
          { name: building.name, path: `/buildings/${building.slug}` },
        ])}
      />

      <nav aria-label="Breadcrumb" className="text-xs text-[var(--text-muted)]">
        <Link href="/buildings" className="hover:text-[var(--text)]">Buildings</Link>
        <span className="mx-1.5 text-[var(--text-faint)]">/</span>
        <span className="text-[var(--text)]">{building.name}</span>
      </nav>

      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{building.name}</h1>

      <Card>
        <div className="grid grid-cols-2 gap-5 p-4 sm:grid-cols-4 sm:p-5">
          <Stat label="Construction cost" value={money(building.cost, { compact: true })} hint={building.costUnit ?? undefined} />
          <Stat label="Wages" value={money(building.wagesPerHourPerLevel)} hint="per hour, per level" />
          <Stat
            label="Build time"
            value={building.secondsToBuild === null ? '—' : duration(building.secondsToBuild / 3600)}
          />
          <Stat
            label="Payback at best product"
            value={payback === null ? '—' : duration(payback)}
            hint={best ? `producing ${best.resource.name}` : undefined}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="What to produce here"
          description="Ranked by profit per hour at level 1 with current market prices and no bonuses."
          action={
            <Link href="/calculators/production" className="text-xs text-[var(--accent)] hover:underline">
              Model your own
            </Link>
          }
        />
        {options.length === 0 ? (
          <p className="px-4 py-8 text-sm text-[var(--text-muted)]">
            We do not have enough catalog or price data to rank this building&rsquo;s products.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <caption className="sr-only">Products this building can make, ranked by profit per hour</caption>
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                  <th scope="col" className="px-4 py-2 font-medium">Product</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Price</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Cost / unit</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Profit / hour</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Margin</th>
                </tr>
              </thead>
              <tbody>
                {options.map(({ resource, result }) => (
                  <tr key={resource.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-muted)]">
                    <th scope="row" className="px-4 py-1.5 text-left font-normal">
                      <Link href={`/exchange/${resource.slug}`} className="font-medium hover:text-[var(--accent)]">
                        {resource.name}
                      </Link>
                    </th>
                    <td className="tnum px-4 py-1.5 text-right text-[var(--text-muted)]">
                      {money(rowById.get(resource.id)?.quote?.lowestPrice ?? null)}
                    </td>
                    <td className="tnum px-4 py-1.5 text-right text-[var(--text-muted)]">
                      {money(result.totalCostPerUnit)}
                    </td>
                    <td
                      className={`tnum px-4 py-1.5 text-right font-medium ${(result.profitPerHour ?? 0) >= 0 ? 'text-[var(--up)]' : 'text-[var(--down)]'}`}
                    >
                      {money(result.profitPerHour)}
                    </td>
                    <td className="tnum px-4 py-1.5 text-right text-[var(--text-muted)]">
                      {ratioAsPercent(result.margin)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Callout tone="info">
        These figures assume level 1, no production bonus and no administration overhead, so they compare products
        fairly but understate what an established company pays. Enter your own overhead in the{' '}
        <Link href="/calculators/production" className="underline underline-offset-2">
          production calculator
        </Link>{' '}
        for figures that match your company.
      </Callout>
    </div>
  );
}
