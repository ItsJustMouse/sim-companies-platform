import { DEFAULT_REALM_ID } from '@/lib/game/constants';
import { getBuildings, getResources, catalogRepository } from '@/lib/catalog/service';
import { getMarketOverview } from '@/lib/market/service';
import { safeRead } from '@/lib/db/client';
import { CompanyWorkspace, type WorkspaceCatalog } from '@/components/company/workspace';
import { SectionHeading } from '@/components/ui/primitives';
import { JsonLd } from '@/components/ui/json-ld';
import { breadcrumbs, buildMetadata } from '@/lib/seo';

export const revalidate = 120;

export const metadata = buildMetadata({
  title: 'Analyse your Sim Companies company',
  description:
    'Describe your Sim Companies buildings and get specific, numbered recommendations: idle buildings, loss-making lines, better products for the buildings you already own, and inputs cheaper to buy than to make. Everything stays in your browser.',
  path: '/company',
});

export default async function CompanyPage() {
  const realmId = DEFAULT_REALM_ID;
  const [overview, { data: buildings }, { data: resources }, recipes] = await Promise.all([
    getMarketOverview(realmId),
    getBuildings(realmId),
    getResources(realmId),
    safeRead(() => catalogRepository.listRecipes(realmId), [], 'company:listRecipes'),
  ]);

  const catalog: WorkspaceCatalog = {
    resources,
    buildings,
    recipes,
    rows: overview.rows.map((row) => ({ resourceId: row.resource.id, row })),
    observedAt: overview.observedAt,
  };

  return (
    <div className="space-y-5">
      <JsonLd data={breadcrumbs([{ name: 'Home', path: '/' }, { name: 'Company', path: '/company' }])} />

      <SectionHeading
        title="Company advisor"
        description="Tell it what you own, and it will tell you what is costing you money — with the numbers behind every claim."
      />

      <CompanyWorkspace catalog={catalog} />
    </div>
  );
}
