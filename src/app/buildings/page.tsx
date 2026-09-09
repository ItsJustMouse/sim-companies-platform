import Link from 'next/link';
import { DEFAULT_REALM_ID } from '@/lib/game/constants';
import { getBuildings } from '@/lib/catalog/service';
import { Card, EmptyState, SectionHeading } from '@/components/ui/primitives';
import { JsonLd } from '@/components/ui/json-ld';
import { breadcrumbs, buildMetadata } from '@/lib/seo';
import { duration, money } from '@/lib/util/format';

export const revalidate = 3600;

export const metadata = buildMetadata({
  title: 'Sim Companies buildings',
  description:
    'Every Sim Companies building with its construction cost, hourly wage bill per level, build time and what it can produce.',
  path: '/buildings',
  index: false,
});

export default async function BuildingsPage() {
  const { data: buildings } = await getBuildings(DEFAULT_REALM_ID);

  const byCategory = new Map<string, typeof buildings>();
  for (const building of buildings) {
    const key = building.category ?? 'Other';
    byCategory.set(key, [...(byCategory.get(key) ?? []), building]);
  }

  return (
    <div className="space-y-5">
      <JsonLd data={breadcrumbs([{ name: 'Home', path: '/' }, { name: 'Buildings', path: '/buildings' }])} />

      <SectionHeading
        title="Buildings"
        description="Construction cost, wages and production lines for every building in the game."
      />

      {buildings.length === 0 ? (
        <Card>
          <EmptyState
            title="No buildings in the catalog"
            description="Buildings are synced from the game's encyclopedia. Run the catalog sync and they will appear here."
          />
        </Card>
      ) : (
        [...byCategory.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([category, items]) => (
            <section key={category}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-faint)]">{category}</h2>
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-sm">
                    <caption className="sr-only">{category} buildings</caption>
                    <thead>
                      <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                        <th scope="col" className="px-4 py-2 font-medium">Building</th>
                        <th scope="col" className="px-4 py-2 text-right font-medium">Construction cost</th>
                        <th scope="col" className="px-4 py-2 text-right font-medium">Wages / hour / level</th>
                        <th scope="col" className="px-4 py-2 text-right font-medium">Build time</th>
                        <th scope="col" className="px-4 py-2 text-right font-medium">Products</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((building) => (
                        <tr key={building.kind} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-muted)]">
                          <th scope="row" className="px-4 py-1.5 text-left font-normal">
                            <Link href={`/buildings/${building.slug}`} className="font-medium hover:text-[var(--accent)]">
                              {building.name}
                            </Link>
                          </th>
                          <td className="tnum px-4 py-1.5 text-right text-[var(--text-muted)]">
                            {money(building.cost, { compact: true })}
                          </td>
                          <td className="tnum px-4 py-1.5 text-right text-[var(--text-muted)]">
                            {money(building.wagesPerHourPerLevel)}
                          </td>
                          <td className="tnum px-4 py-1.5 text-right text-[var(--text-muted)]">
                            {building.secondsToBuild === null ? '—' : duration(building.secondsToBuild / 3600)}
                          </td>
                          <td className="tnum px-4 py-1.5 text-right text-[var(--text-muted)]">
                            {building.production.length}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </section>
          ))
      )}
    </div>
  );
}
