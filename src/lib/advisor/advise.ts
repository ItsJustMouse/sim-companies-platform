import { calculateProduction } from '@/lib/calc/production';
import type { Building, Resource } from '@/lib/game/types';
import type { MarketRow } from '@/lib/market/service';
import type { Recipe } from '@/lib/game/types';
import { money } from '@/lib/util/format';
import type { CompanyState, Recommendation } from './types';

/**
 * The company advisor.
 *
 * Rules-based and deterministic by design. An LLM is not required to notice that a
 * building is idle or that a production line is below break-even, and making one a
 * dependency would put a per-query cost on the product's most-used feature while
 * making its answers unreproducible.
 *
 * Every recommendation must carry the numbers that produced it and the assumptions
 * behind them. A recommendation a player cannot check is one they cannot trust, and
 * this is a tool people will spend in-game money on the strength of.
 *
 * `docs/ARCHITECTURE.md` records the interface a conversational advisor would sit
 * behind later; it consumes exactly this output rather than replacing it.
 */

export interface AdviceContext {
  readonly company: CompanyState;
  readonly rows: ReadonlyMap<number, MarketRow>;
  readonly resources: ReadonlyMap<number, Resource>;
  readonly buildings: ReadonlyMap<string, Building>;
  readonly recipes: ReadonlyMap<number, Recipe>;
}

export interface AdviceResult {
  readonly recommendations: readonly Recommendation[];
  /** Total quantifiable upside per hour across all recommendations. */
  readonly totalUpsidePerHour: number;
  /** What the advisor could not assess, and why. */
  readonly limitations: readonly string[];
}

export function advise(context: AdviceContext): AdviceResult {
  const recommendations: Recommendation[] = [];
  const limitations: string[] = [];
  const { company } = context;

  if (company.buildings.length === 0) {
    limitations.push(
      'No buildings were provided, so nothing company-specific can be assessed. Add your buildings to get advice about your own production rather than the market at large.',
    );
  }

  // Profit per hour of every product, under this company's own overhead. Computed
  // once and reused by several rules.
  const profitByResource = computeProfitByResource(context);
  const bestAlternative = [...profitByResource.entries()]
    .filter(([, value]) => value.profitPerHour !== null)
    .sort((a, b) => (b[1].profitPerHour ?? 0) - (a[1].profitPerHour ?? 0))[0];

  // ---- Rule: idle buildings ---------------------------------------------
  // A building with nothing assigned is idle regardless of the flag. Deriving it
  // here means the two can never disagree, which they otherwise would whenever a
  // caller set one without the other.
  const idle = company.buildings.filter((b) => b.idle || b.producingResourceId === null);
  for (const building of idle) {
    const catalogBuilding = building.kind ? context.buildings.get(building.kind) : undefined;
    const wageBill = (catalogBuilding?.wagesPerHourPerLevel ?? 0) * building.level;
    const candidate = bestProductForBuilding(catalogBuilding, profitByResource, building.level);

    recommendations.push({
      id: `idle:${building.label}`,
      severity: 'critical',
      title: `${building.label} is idle`,
      summary:
        wageBill > 0
          ? `An idle building still pays wages. This one is costing you ${money(wageBill)} an hour to do nothing.`
          : 'An idle building still pays wages. Give it something to produce.',
      evidence: [
        { label: 'Building level', value: String(building.level) },
        { label: 'Wage bill while idle', value: `${money(wageBill)}/hour` },
        ...(candidate
          ? [{ label: `Best available product (${candidate.name})`, value: `${money(candidate.profitPerHour)}/hour` }]
          : []),
      ],
      assumptions: [
        'Wages are charged whether or not the building is producing.',
        `Administration overhead of ${(company.adminOverhead * 100).toFixed(1)}% applied to the wage bill.`,
      ],
      impactPerHour: candidate ? (candidate.profitPerHour ?? 0) + wageBill : wageBill,
      href: '/opportunities',
      hrefLabel: 'Find something for it to make',
    });
  }

  // ---- Rule: producing below break-even ---------------------------------
  for (const building of company.buildings) {
    if (isIdle(building)) continue;
    const analysis = profitByResource.get(building.producingResourceId as number);
    if (!analysis || analysis.profitPerHour === null) continue;

    if (analysis.profitPerHour < 0) {
      const resource = context.resources.get(building.producingResourceId as number);
      recommendations.push({
        id: `loss:${building.label}`,
        severity: 'critical',
        title: `${building.label} is producing at a loss`,
        summary: `${resource?.name ?? 'This product'} currently sells below what it costs you to make. Every hour it runs loses ${money(Math.abs(analysis.profitPerHour * building.level))}.`,
        evidence: [
          { label: 'Market price', value: money(analysis.salePrice) },
          { label: 'Your cost per unit', value: money(analysis.costPerUnit) },
          { label: 'Break-even price', value: money(analysis.breakEvenPrice) },
          { label: 'Loss at level ' + building.level, value: `${money(analysis.profitPerHour * building.level)}/hour` },
        ],
        assumptions: [
          `Inputs priced at the cheapest current listing.`,
          `Your administration overhead of ${(company.adminOverhead * 100).toFixed(1)}%.`,
          'Sold on the Exchange, net of the seller fee.',
        ],
        impactPerHour: Math.abs(analysis.profitPerHour * building.level),
        href: resource ? `/exchange/${resource.slug}` : '/exchange',
        hrefLabel: 'Check the price history',
      });
    }
  }

  // ---- Rule: a materially better product for a building we already own ---
  for (const building of company.buildings) {
    if (isIdle(building)) continue;
    const catalogBuilding = building.kind ? context.buildings.get(building.kind) : undefined;
    const current = profitByResource.get(building.producingResourceId as number);
    const candidate = bestProductForBuilding(catalogBuilding, profitByResource, building.level);
    if (!candidate || !current?.profitPerHour || candidate.resourceId === building.producingResourceId) continue;

    const currentAtLevel = current.profitPerHour * building.level;
    const candidateAtLevel = (candidate.profitPerHour ?? 0) * building.level;
    const gain = candidateAtLevel - currentAtLevel;

    // A 15% threshold keeps the advisor from nagging about noise. Prices move; a
    // recommendation to retool for a 3% gain is not advice, it is churn.
    if (gain <= 0 || gain < Math.abs(currentAtLevel) * 0.15) continue;

    const currentResource = context.resources.get(building.producingResourceId as number);
    recommendations.push({
      id: `switch:${building.label}`,
      severity: 'opportunity',
      title: `${building.label} could earn more making ${candidate.name}`,
      summary: `Switching from ${currentResource?.name ?? 'its current product'} to ${candidate.name} is worth about ${money(gain)} an hour at current prices.`,
      evidence: [
        { label: `Current (${currentResource?.name ?? 'unknown'})`, value: `${money(currentAtLevel)}/hour` },
        { label: `Alternative (${candidate.name})`, value: `${money(candidateAtLevel)}/hour` },
        { label: 'Difference', value: `${money(gain)}/hour` },
      ],
      assumptions: [
        'Both figures use current market prices for inputs and output.',
        'Changeover time and any stock you already hold are not counted.',
        'Prices that make a product look good today may not hold.',
      ],
      impactPerHour: gain,
      href: '/opportunities',
      hrefLabel: 'Compare all products',
    });
  }

  // ---- Rule: inputs cheaper to buy than to make -------------------------
  const producedIds = new Set(
    company.buildings.filter((b) => !isIdle(b)).map((b) => b.producingResourceId as number),
  );
  for (const building of company.buildings) {
    if (building.producingResourceId === null) continue;
    const recipe = context.recipes.get(building.producingResourceId);
    if (!recipe) continue;

    for (const input of recipe.inputs) {
      if (!producedIds.has(input.resourceId)) continue;
      const selfCost = profitByResource.get(input.resourceId);
      const marketPrice = context.rows.get(input.resourceId)?.quote?.lowestPrice ?? null;
      if (!selfCost || selfCost.costPerUnit === null || marketPrice === null) continue;

      // Opportunity cost: what the building making this input gives up.
      const opportunityPerUnit =
        bestAlternative && selfCost.unitsPerHour > 0
          ? (bestAlternative[1].profitPerHour ?? 0) / selfCost.unitsPerHour
          : 0;
      const trueCost = selfCost.costPerUnit + opportunityPerUnit;
      if (trueCost <= marketPrice) continue;

      const resource = context.resources.get(input.resourceId);
      recommendations.push({
        id: `buy:${input.resourceId}`,
        severity: 'opportunity',
        title: `Buying ${resource?.name ?? 'this input'} looks cheaper than making it`,
        summary: `Once you count what the producing building gives up, making ${resource?.name ?? 'it'} costs ${money(trueCost)} against ${money(marketPrice)} on the Exchange.`,
        evidence: [
          { label: 'Cash cost to make', value: money(selfCost.costPerUnit) },
          { label: 'Profit that building forgoes', value: `${money(opportunityPerUnit)}/unit` },
          { label: 'True cost to make', value: money(trueCost) },
          { label: 'Market price', value: money(marketPrice) },
        ],
        assumptions: [
          'The producing building is assumed to have a better alternative available.',
          'The market price is the cheapest listing and may not cover your full volume.',
        ],
        impactPerHour: null,
        href: '/calculators/vertical-integration',
        hrefLabel: 'Check this properly',
      });
    }
  }

  // ---- Rule: idle cash ---------------------------------------------------
  if (company.cash !== null && company.cash > 0 && bestAlternative) {
    const best = bestAlternative[1];
    if ((best.profitPerHour ?? 0) > 0) {
      recommendations.push({
        id: 'cash',
        severity: 'informational',
        title: `${money(company.cash)} is sitting idle`,
        summary: 'Cash earns nothing. The best-performing product right now is a starting point for where to put it.',
        evidence: [
          { label: 'Available cash', value: money(company.cash) },
          { label: 'Best product now', value: `${best.name} at ${money(best.profitPerHour)}/hour per level` },
        ],
        assumptions: [
          'This does not account for construction cost or build time — use the ROI calculator for that.',
          'Holding a cash reserve has value that this figure does not capture.',
        ],
        impactPerHour: null,
        href: '/calculators/investment',
        hrefLabel: 'Work out the payback',
      });
    }
  }

  if (company.source === 'public-profile') {
    limitations.push(
      'This company was read from its public profile, which does not include buildings, cash or inventory. Add them manually for building-level advice — the game offers no way for a third-party site to read them for you.',
    );
  }

  if (context.rows.size === 0) {
    limitations.push('No market prices are available, so nothing could be priced.');
  }

  const ordered = recommendations.sort((a, b) => {
    const rank = { critical: 0, opportunity: 1, informational: 2 } as const;
    if (rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity];
    return (b.impactPerHour ?? 0) - (a.impactPerHour ?? 0);
  });

  return {
    recommendations: ordered,
    totalUpsidePerHour: ordered.reduce((sum, r) => sum + (r.impactPerHour ?? 0), 0),
    limitations,
  };
}

/** A building is idle if it says so, or if it simply has nothing assigned. */
function isIdle(building: CompanyState['buildings'][number]): boolean {
  return building.idle || building.producingResourceId === null;
}

interface ProductAnalysis {
  readonly resourceId: number;
  readonly name: string;
  readonly profitPerHour: number | null;
  readonly costPerUnit: number | null;
  readonly salePrice: number | null;
  readonly breakEvenPrice: number | null;
  readonly unitsPerHour: number;
  readonly buildingKind: string | null;
}

/** Prices every producible product against this company's own overhead, at level 1. */
function computeProfitByResource(context: AdviceContext): Map<number, ProductAnalysis> {
  const out = new Map<number, ProductAnalysis>();

  for (const [resourceId, resource] of context.resources) {
    const row = context.rows.get(resourceId);
    const recipe = context.recipes.get(resourceId);
    const building =
      [...context.buildings.values()].find((b) => (recipe?.producedIn ?? []).includes(b.kind)) ??
      [...context.buildings.values()].find((b) => b.production.some((line) => line.resourceId === resourceId));

    if (!row?.quote || !building?.wagesPerHourPerLevel || resource.baseUnitsPerHour === null) continue;

    const calculation = calculateProduction({
      outputName: resource.name,
      baseUnitsPerHour: resource.baseUnitsPerHour,
      buildingLevel: 1,
      wagesPerHourPerLevel: building.wagesPerHourPerLevel,
      adminOverhead: context.company.adminOverhead,
      inputs: (recipe?.inputs ?? []).map((input) => ({
        resourceId: input.resourceId,
        resourceName: input.resourceName ?? context.resources.get(input.resourceId)?.name ?? `#${input.resourceId}`,
        amountPerUnit: input.amount,
        unitPrice: context.rows.get(input.resourceId)?.quote?.lowestPrice ?? null,
        priceSource: 'market' as const,
      })),
      salePrice: row.quote.lowestPrice,
      salePriceObservedAt: row.observedAt,
      saleChannel: 'exchange',
      transportUnitsPerUnit: resource.transportUnits,
      transportUnitCost: 0,
    });

    out.set(resourceId, {
      resourceId,
      name: resource.name,
      profitPerHour: calculation.result.profitPerHour,
      costPerUnit: calculation.result.totalCostPerUnit,
      salePrice: row.quote.lowestPrice,
      breakEvenPrice: calculation.result.breakEvenSalePrice,
      unitsPerHour: calculation.result.unitsPerHour,
      buildingKind: building.kind,
    });
  }

  return out;
}

/** The most profitable product a given building could be making. */
function bestProductForBuilding(
  building: Building | undefined,
  analyses: ReadonlyMap<number, ProductAnalysis>,
  _level: number,
): ProductAnalysis | null {
  if (!building) return null;
  const candidates = [...analyses.values()].filter((analysis) => analysis.buildingKind === building.kind);
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => (b.profitPerHour ?? -Infinity) - (a.profitPerHour ?? -Infinity))[0] ?? null;
}
