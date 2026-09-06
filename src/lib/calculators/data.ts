import { DEFAULT_REALM_ID } from '@/lib/game/constants';
import { getBuildings, getResources, catalogRepository } from '@/lib/catalog/service';
import { getMarketOverview } from '@/lib/market/service';
import { safeRead } from '@/lib/db/client';

/**
 * The data bundle every market-aware calculator needs.
 *
 * Serialised once on the server and handed to the client, so switching product in a
 * calculator is instant and costs nothing: no request per selection, and no upstream
 * traffic at all. The whole catalog with current prices is a few tens of kilobytes.
 */

export interface CalculatorProduct {
  id: number;
  name: string;
  slug: string;
  category: string | null;
  /** Cheapest current offer, or null when the order book is empty. */
  price: number | null;
  pricesByQuality: Record<number, number>;
  baseUnitsPerHour: number | null;
  transportUnits: number | null;
  retailable: boolean | null;
  observedAt: string | null;
  /** Building that produces it, when we can determine one. */
  buildingKind: string | null;
  inputs: { resourceId: number; name: string; amount: number }[];
}

export interface CalculatorBuilding {
  kind: string;
  name: string;
  cost: number | null;
  wagesPerHourPerLevel: number | null;
  secondsToBuild: number | null;
  isRetail: boolean;
}

export interface CalculatorData {
  products: CalculatorProduct[];
  buildings: CalculatorBuilding[];
  observedAt: string | null;
  degraded: boolean;
}

export async function loadCalculatorData(realmId = DEFAULT_REALM_ID): Promise<CalculatorData> {
  const [overview, { data: buildings }, { data: resources }, recipes] = await Promise.all([
    getMarketOverview(realmId),
    getBuildings(realmId),
    getResources(realmId),
    safeRead(() => catalogRepository.listRecipes(realmId), [], 'calculators:listRecipes'),
  ]);

  const rowById = new Map(overview.rows.map((row) => [row.resource.id, row]));
  const recipeById = new Map(recipes.map((recipe) => [recipe.outputResourceId, recipe]));
  const nameById = new Map(resources.map((r) => [r.id, r.name]));

  const products: CalculatorProduct[] = resources.map((resource) => {
    const row = rowById.get(resource.id);
    const recipe = recipeById.get(resource.id);

    const buildingKind =
      recipe?.producedIn[0] ??
      buildings.find((b) => b.production.some((line) => line.resourceId === resource.id))?.kind ??
      null;

    return {
      id: resource.id,
      name: resource.name,
      slug: resource.slug,
      category: resource.category,
      price: row?.quote?.lowestPrice ?? null,
      pricesByQuality: row?.quote?.pricesByQuality ?? {},
      baseUnitsPerHour: resource.baseUnitsPerHour,
      transportUnits: resource.transportUnits,
      retailable: resource.retailable,
      observedAt: row?.observedAt ?? null,
      buildingKind,
      inputs: (recipe?.inputs ?? []).map((input) => ({
        resourceId: input.resourceId,
        name: input.resourceName ?? nameById.get(input.resourceId) ?? `Product ${input.resourceId}`,
        amount: input.amount,
      })),
    };
  });

  return {
    products: products.sort((a, b) => a.name.localeCompare(b.name)),
    buildings: buildings.map((b) => ({
      kind: b.kind,
      name: b.name,
      cost: b.cost,
      wagesPerHourPerLevel: b.wagesPerHourPerLevel,
      secondsToBuild: b.secondsToBuild,
      isRetail: b.isRetail,
    })),
    observedAt: overview.observedAt,
    degraded: overview.degraded,
  };
}
