import { getBuildings, getResources, catalogRepository } from '@/lib/catalog/service';
import { safeRead } from '@/lib/db/client';
import { calculateProduction, type ProductionInputLine } from '@/lib/calc/production';
import type { Building, Recipe, Resource } from '@/lib/game/types';
import { getMarketOverview, type MarketRow } from './service';

/**
 * The opportunity scanner.
 *
 * Ranks every producible product by what it would actually earn right now, using
 * live input and output prices, the building's own wage rate, and the player's
 * stated assumptions. The output is deliberately *explainable*: each row carries the
 * cost breakdown that produced its ranking, so a player can see why something is at
 * the top rather than trusting an opaque score.
 *
 * What this does not do
 * ---------------------
 * It does not claim to find guaranteed profit. Prices are a snapshot, the cheapest
 * listing is often thin, and a product looks best precisely when its price has
 * spiked. Every row therefore also reports liquidity and recent volatility, and the
 * UI surfaces those next to the profit figure rather than below the fold.
 */

export interface ScannerAssumptions {
  readonly buildingLevel: number;
  readonly productionBonus: number;
  readonly adminOverhead: number;
  readonly useRobots: boolean;
  readonly transportUnitCost: number;
  readonly saleChannel: 'exchange' | 'contract';
  /** Quality level to price inputs and outputs at. */
  readonly quality: number;
  /**
   * When true, inputs are priced by walking the order book for the quantity actually
   * needed rather than taking the single cheapest listing.
   */
  readonly requireDepth: boolean;
}

export const DEFAULT_ASSUMPTIONS: ScannerAssumptions = {
  buildingLevel: 1,
  productionBonus: 0,
  adminOverhead: 0,
  useRobots: false,
  transportUnitCost: 0,
  saleChannel: 'exchange',
  quality: 0,
  requireDepth: false,
};

export interface Opportunity {
  readonly resource: Resource;
  readonly building: Building | null;
  readonly salePrice: number | null;
  readonly costPerUnit: number | null;
  readonly profitPerUnit: number | null;
  readonly profitPerHour: number | null;
  readonly profitPerDay: number | null;
  readonly margin: number | null;
  readonly breakEvenSalePrice: number | null;
  readonly unitsPerHour: number;
  /** Profit per hour divided by the building's construction cost. */
  readonly returnOnBuildCost: number | null;
  readonly liquidity: number | null;
  readonly volatility7d: number | null;
  readonly change24h: number | null;
  readonly totalQuantity: number;
  readonly offerCount: number;
  readonly inputs: readonly ProductionInputLine[];
  /** Human-readable reasons this row ranks where it does. */
  readonly reasons: readonly string[];
  /** Things that should give a player pause before acting. */
  readonly cautions: readonly string[];
  readonly observedAt: string | null;
  readonly incomplete: boolean;
}

export interface ScannerResult {
  readonly opportunities: readonly Opportunity[];
  readonly assumptions: ScannerAssumptions;
  readonly observedAt: string | null;
  readonly collectionStartedAt: string | null;
  readonly evaluated: number;
  readonly skipped: number;
}

export async function scanOpportunities(
  realmId: number,
  assumptions: ScannerAssumptions = DEFAULT_ASSUMPTIONS,
): Promise<ScannerResult> {
  const [overview, { data: buildings }, { data: resources }, recipes] = await Promise.all([
    getMarketOverview(realmId),
    getBuildings(realmId),
    getResources(realmId),
    safeRead(() => catalogRepository.listRecipes(realmId), [], 'scanner:listRecipes'),
  ]);

  const rowByResource = new Map<number, MarketRow>(overview.rows.map((row) => [row.resource.id, row]));
  const resourceById = new Map<number, Resource>(resources.map((r) => [r.id, r]));
  const buildingByKind = new Map<string, Building>(buildings.map((b) => [b.kind, b]));
  const recipeByOutput = new Map<number, Recipe>(recipes.map((r) => [r.outputResourceId, r]));

  const opportunities: Opportunity[] = [];
  let skipped = 0;

  for (const resource of resources) {
    const row = rowByResource.get(resource.id);
    const recipe = recipeByOutput.get(resource.id);
    const building = findBuilding(recipe, resource, buildingByKind);

    // A product we cannot price, cannot produce, or whose building wage we do not
    // know is not an "opportunity worth $0" — it is a product we cannot assess.
    if (!row?.quote || building?.wagesPerHourPerLevel == null || resource.baseUnitsPerHour == null) {
      skipped += 1;
      continue;
    }

    const salePrice = priceAt(row, assumptions.quality);
    const inputs: ProductionInputLine[] = (recipe?.inputs ?? []).map((input) => {
      const inputRow = rowByResource.get(input.resourceId);
      return {
        resourceId: input.resourceId,
        resourceName: input.resourceName ?? resourceById.get(input.resourceId)?.name ?? `#${input.resourceId}`,
        amountPerUnit: input.amount,
        unitPrice: inputRow ? priceAt(inputRow, assumptions.quality) : null,
        priceObservedAt: inputRow?.observedAt ?? null,
        priceSource: 'market' as const,
      };
    });

    const calculation = calculateProduction({
      outputName: resource.name,
      baseUnitsPerHour: resource.baseUnitsPerHour,
      buildingLevel: assumptions.buildingLevel,
      wagesPerHourPerLevel: building.wagesPerHourPerLevel,
      productionBonus: assumptions.productionBonus,
      adminOverhead: assumptions.adminOverhead,
      useRobots: assumptions.useRobots,
      inputs,
      salePrice,
      salePriceObservedAt: row.observedAt,
      saleChannel: assumptions.saleChannel,
      transportUnitsPerUnit: resource.transportUnits,
      transportUnitCost: assumptions.transportUnitCost,
    });

    const result = calculation.result;
    const reasons: string[] = [];
    const cautions: string[] = [];

    if (result.margin !== null && result.margin > 0.35) {
      reasons.push(`Wide margin: ${(result.margin * 100).toFixed(0)}% of the sale price is profit.`);
    }
    if (result.profitPerHour !== null && result.profitPerHour > 0) {
      reasons.push(`Earns ${result.profitPerHour.toFixed(2)} per hour at level ${assumptions.buildingLevel}.`);
    }
    if (inputs.length === 0) {
      reasons.push('No purchased inputs — cost is wages only, so profit is insulated from input price moves.');
    }
    if ((row.liquidity ?? 0) >= 55) {
      reasons.push('Deep, well-distributed order book — easy to sell into.');
    }

    if ((row.liquidity ?? 100) < 25) {
      cautions.push('Thin market. The best price may only cover a small quantity.');
    }
    if ((row.volatility7d ?? 0) > 6) {
      cautions.push(`Volatile: prices moved ${row.volatility7d?.toFixed(1)}% per period over the last week.`);
    }
    if ((row.change24h?.percent ?? 0) > 15) {
      cautions.push('Price spiked in the last 24 hours — this may not hold.');
    }
    for (const warning of calculation.warnings) cautions.push(warning);

    const returnOnBuildCost =
      building.cost && building.cost > 0 && result.profitPerHour !== null
        ? result.profitPerHour / building.cost
        : null;

    opportunities.push({
      resource,
      building,
      salePrice,
      costPerUnit: result.totalCostPerUnit,
      profitPerUnit: result.profitPerUnit,
      profitPerHour: result.profitPerHour,
      profitPerDay: result.profitPerDay,
      margin: result.margin,
      breakEvenSalePrice: result.breakEvenSalePrice,
      unitsPerHour: result.unitsPerHour,
      returnOnBuildCost,
      liquidity: row.liquidity,
      volatility7d: row.volatility7d,
      change24h: row.change24h?.percent ?? null,
      totalQuantity: row.quote.totalQuantity,
      offerCount: row.quote.offerCount,
      inputs,
      reasons,
      cautions,
      observedAt: row.observedAt,
      incomplete: result.incomplete,
    });
  }

  return {
    opportunities,
    assumptions,
    observedAt: overview.observedAt,
    collectionStartedAt: overview.collectionStartedAt,
    evaluated: opportunities.length,
    skipped,
  };
}

export type SortKey =
  | 'profitPerHour'
  | 'profitPerUnit'
  | 'margin'
  | 'returnOnBuildCost'
  | 'liquidity'
  | 'volatility'
  | 'change24h';

export function sortOpportunities(items: readonly Opportunity[], key: SortKey): Opportunity[] {
  const value = (item: Opportunity): number | null => {
    switch (key) {
      case 'profitPerHour':
        return item.profitPerHour;
      case 'profitPerUnit':
        return item.profitPerUnit;
      case 'margin':
        return item.margin;
      case 'returnOnBuildCost':
        return item.returnOnBuildCost;
      case 'liquidity':
        return item.liquidity;
      case 'volatility':
        return item.volatility7d;
      case 'change24h':
        return item.change24h;
    }
  };

  // Rows we could not evaluate sort last rather than counting as zero, which would
  // rank an unmeasurable product above a genuinely loss-making one.
  return [...items].sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    if (av === null && bv === null) return a.resource.name.localeCompare(b.resource.name);
    if (av === null) return 1;
    if (bv === null) return -1;
    return bv - av;
  });
}

function priceAt(row: MarketRow, quality: number): number | null {
  if (!row.quote) return null;
  if (quality === 0) return row.quote.lowestPrice;
  const price = row.quote.pricesByQuality[quality];
  return price ?? null;
}

function findBuilding(
  recipe: Recipe | undefined,
  resource: Resource,
  buildingByKind: Map<string, Building>,
): Building | null {
  for (const kind of recipe?.producedIn ?? []) {
    const building = buildingByKind.get(kind);
    if (building) return building;
  }
  // Fall back to whichever building advertises this resource on a production line.
  for (const building of buildingByKind.values()) {
    if (building.production.some((line) => line.resourceId === resource.id)) return building;
  }
  return null;
}
