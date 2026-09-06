import { calculateProduction, type ProductionParams } from './production';
import { ExplanationBuilder, type Explained } from './types';

/**
 * Buy the input, or make it yourself?
 *
 * This is the calculation players most often get wrong, and the reason is always the
 * same: comparing the *cash cost* of self-production against the market price while
 * ignoring what the building could have been doing instead.
 *
 * Self-production is only cheaper when
 *
 *     productionCostPerUnit + opportunityCostPerUnit  <  marketPricePerUnit
 *
 * where the opportunity cost is the profit the producing building forgoes by making
 * this input rather than its best alternative. A building that could be earning
 * $500/hour making something else is not producing "cheap" inputs, however low the
 * wage bill looks.
 *
 * We therefore report three numbers, not one:
 *   - the naive cash comparison (what most spreadsheets show),
 *   - the opportunity cost of the building time,
 *   - the honest comparison including it.
 */

export interface VerticalIntegrationParams {
  readonly inputName: string;
  /** Units of the input needed per hour to feed the downstream line. */
  readonly unitsNeededPerHour: number;
  /** Cheapest price the input can be bought for on the Exchange right now. */
  readonly marketPrice: number | null;
  readonly marketPriceObservedAt?: string | null;
  /** Cost of moving a bought unit to your warehouse, per unit. */
  readonly purchaseTransportCostPerUnit?: number;
  /** How the input would be produced in-house. */
  readonly ownProduction: ProductionParams;
  /**
   * Best profit per hour the producing building could earn on something else.
   * Leave null when the building would otherwise sit idle — then in-house
   * production genuinely costs only its inputs and wages.
   */
  readonly alternativeProfitPerHour: number | null;
}

export interface VerticalIntegrationResult {
  /** In-house cash cost per unit: inputs + labour, no opportunity cost. */
  readonly productionCostPerUnit: number | null;
  /** Delivered cost of buying instead. */
  readonly purchaseCostPerUnit: number | null;
  /** Profit given up per unit by using the building for this. */
  readonly opportunityCostPerUnit: number;
  /** True cost of self-production once opportunity cost is counted. */
  readonly effectiveProductionCostPerUnit: number | null;
  /** Comparison ignoring opportunity cost — shown to contrast with the honest one. */
  readonly naiveRecommendation: 'produce' | 'buy' | 'unknown';
  readonly recommendation: 'produce' | 'buy' | 'unknown';
  /** Money saved per hour by following `recommendation`. */
  readonly savingPerHour: number | null;
  /** How much building capacity the in-house option consumes. */
  readonly hoursOfProductionNeededPerHour: number | null;
  /** True when the naive and honest recommendations disagree. */
  readonly opportunityCostChangesAnswer: boolean;
}

export function compareVerticalIntegration(
  params: VerticalIntegrationParams,
): Explained<VerticalIntegrationResult> {
  const explain = new ExplanationBuilder();

  // Cost the in-house option with no sale price: we consume the output, not sell it,
  // so the exchange fee and sale revenue are irrelevant here.
  const own = calculateProduction({ ...params.ownProduction, salePrice: null });
  for (const assumption of own.assumptions) explain.assume(assumption);
  for (const warning of own.warnings) {
    if (!warning.includes('cost breakdown')) explain.warn(warning);
  }

  const productionCostPerUnit = own.result.totalCostPerUnit;
  const purchaseTransport = params.purchaseTransportCostPerUnit ?? 0;
  const purchaseCostPerUnit = params.marketPrice === null ? null : params.marketPrice + purchaseTransport;

  explain
    .input({ label: 'Input', value: params.inputName, source: 'catalog' })
    .input({ label: 'Needed', value: params.unitsNeededPerHour, unit: 'units/hour', source: 'user' })
    .input({
      label: 'Market price',
      value: params.marketPrice,
      unit: '$/unit',
      source: 'market',
      observedAt: params.marketPriceObservedAt ?? null,
    });

  if (purchaseTransport > 0) {
    explain
      .input({ label: 'Transport to buy in', value: purchaseTransport, unit: '$/unit', source: 'user' })
      .step({
        label: 'Delivered purchase cost',
        formula: 'marketPrice + purchaseTransportCostPerUnit',
        result: purchaseCostPerUnit,
        unit: '$/unit',
      });
  }

  explain.step({
    label: 'In-house cash cost per unit',
    formula: 'inputCost + labourCost',
    result: productionCostPerUnit,
    unit: '$/unit',
  });

  // ---- Opportunity cost --------------------------------------------------
  const ownUnitsPerHour = own.result.unitsPerHour;
  const hoursOfProductionNeededPerHour =
    ownUnitsPerHour > 0 ? params.unitsNeededPerHour / ownUnitsPerHour : null;

  let opportunityCostPerUnit = 0;
  if (params.alternativeProfitPerHour !== null && params.alternativeProfitPerHour > 0) {
    if (ownUnitsPerHour > 0) {
      opportunityCostPerUnit = params.alternativeProfitPerHour / ownUnitsPerHour;
      explain
        .input({
          label: 'Best alternative use of this building',
          value: params.alternativeProfitPerHour,
          unit: '$/hour',
          source: 'derived',
        })
        .step({
          label: 'Opportunity cost per unit',
          formula: 'alternativeProfitPerHour / unitsPerHour',
          result: opportunityCostPerUnit,
          unit: '$/unit',
        });
    }
  } else {
    explain.warn(
      'No alternative use was given for the producing building, so its time is treated as free. That is only true if the building would otherwise sit idle.',
    );
  }

  const effectiveProductionCostPerUnit =
    productionCostPerUnit === null ? null : productionCostPerUnit + opportunityCostPerUnit;
  explain.step({
    label: 'True in-house cost per unit',
    formula: 'productionCostPerUnit + opportunityCostPerUnit',
    result: effectiveProductionCostPerUnit,
    unit: '$/unit',
  });

  // ---- Recommendations ---------------------------------------------------
  const decide = (ownCost: number | null): 'produce' | 'buy' | 'unknown' => {
    if (ownCost === null || purchaseCostPerUnit === null) return 'unknown';
    return ownCost < purchaseCostPerUnit ? 'produce' : 'buy';
  };

  const naiveRecommendation = decide(productionCostPerUnit);
  const recommendation = decide(effectiveProductionCostPerUnit);

  let savingPerHour: number | null = null;
  if (effectiveProductionCostPerUnit !== null && purchaseCostPerUnit !== null) {
    const perUnitSaving = Math.abs(purchaseCostPerUnit - effectiveProductionCostPerUnit);
    savingPerHour = perUnitSaving * params.unitsNeededPerHour;
    explain.step({
      label: 'Saving from the better option',
      formula: '|purchaseCost - trueInHouseCost| x unitsNeededPerHour',
      result: savingPerHour,
      unit: '$/hour',
    });
  }

  if (purchaseCostPerUnit === null) {
    explain.warn('The Exchange has no offers for this input, so there is nothing to compare against buying.');
  }

  const opportunityCostChangesAnswer =
    naiveRecommendation !== 'unknown' && recommendation !== 'unknown' && naiveRecommendation !== recommendation;

  if (opportunityCostChangesAnswer) {
    explain.warn(
      'Ignoring opportunity cost would reverse this recommendation. Self-production looks cheaper on cash alone, but the building earns more doing something else.',
    );
  }

  if (hoursOfProductionNeededPerHour !== null && hoursOfProductionNeededPerHour > 1) {
    explain.warn(
      `Meeting this demand needs ${hoursOfProductionNeededPerHour.toFixed(2)}x the capacity of the configured building — you would need more levels or more buildings.`,
    );
  }

  return explain.build<VerticalIntegrationResult>({
    productionCostPerUnit,
    purchaseCostPerUnit,
    opportunityCostPerUnit,
    effectiveProductionCostPerUnit,
    naiveRecommendation,
    recommendation,
    savingPerHour,
    hoursOfProductionNeededPerHour,
    opportunityCostChangesAnswer,
  });
}
