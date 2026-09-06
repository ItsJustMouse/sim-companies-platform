import { EXCHANGE_SELLER_FEE } from '@/lib/game/constants';
import { ExplanationBuilder, type Explained } from './types';

/**
 * Selling-side economics: retail versus the Exchange, and whether quality pays.
 *
 * A note on what is *not* modelled here
 * ------------------------------------
 * The game does not publish its retail mechanics. Community reports agree that a
 * store's sale rate responds to price, product quality and local demand, but no
 * source we could verify gives the actual function. Inventing one would produce
 * confident numbers with nothing behind them, which is worse than no calculator.
 *
 * So this module does not simulate retail demand. It takes the throughput the player
 * observes in their own store and does the economics around it exactly. That keeps
 * every number here traceable: the modelled part is arithmetic we can stand behind,
 * and the empirical part is measured by the person who can actually see it.
 */

export interface RetailParams {
  readonly productName: string;
  /** What each unit cost you — produced or purchased. */
  readonly unitCost: number;
  /** Retail sale price per unit. */
  readonly retailPrice: number;
  /** Units the store actually sells per hour, as observed in-game. */
  readonly unitsSoldPerHour: number;
  /** Store's hourly wage bill. */
  readonly storeWagesPerHour: number;
  /** Administration overhead as a fraction. */
  readonly adminOverhead?: number;
  /** Current Exchange price for the same goods, for the comparison. */
  readonly exchangePrice: number | null;
  /** Transport cost per unit to stock the store. */
  readonly transportCostPerUnit?: number;
}

export interface RetailResult {
  readonly revenuePerHour: number;
  readonly costOfGoodsPerHour: number;
  readonly labourCostPerHour: number;
  readonly profitPerHour: number;
  readonly profitPerUnit: number;
  readonly marginPerUnit: number;
  /** Profit per hour if the same goods were sold on the Exchange instead. */
  readonly exchangeProfitPerHour: number | null;
  /** How much better retail is per hour. Negative means the Exchange wins. */
  readonly retailAdvantagePerHour: number | null;
  readonly recommendation: 'retail' | 'exchange' | 'unknown';
  /** Units per hour the store must sell for retail to beat the Exchange. */
  readonly breakEvenThroughput: number | null;
}

export function calculateRetail(params: RetailParams): Explained<RetailResult> {
  const explain = new ExplanationBuilder();
  const adminOverhead = params.adminOverhead ?? 0;
  const transport = params.transportCostPerUnit ?? 0;

  explain
    .input({ label: 'Product', value: params.productName, source: 'catalog' })
    .input({ label: 'Cost per unit', value: params.unitCost, unit: '$', source: 'user' })
    .input({ label: 'Retail price', value: params.retailPrice, unit: '$', source: 'user' })
    .input({ label: 'Units sold per hour', value: params.unitsSoldPerHour, source: 'user' })
    .input({ label: 'Store wages', value: params.storeWagesPerHour, unit: '$/hour', source: 'user' })
    .assume({
      label: 'Retail throughput is measured, not modelled',
      detail:
        'The game does not publish how retail sale rate responds to price, quality and demand, so this figure comes from what you observe in your own store rather than from a formula we invented.',
      confidence: 'unconfirmed',
      source: 'Player observation.',
    });

  const revenuePerHour = params.retailPrice * params.unitsSoldPerHour;
  const costOfGoodsPerHour = (params.unitCost + transport) * params.unitsSoldPerHour;
  const labourCostPerHour = params.storeWagesPerHour * (1 + adminOverhead);
  const profitPerHour = revenuePerHour - costOfGoodsPerHour - labourCostPerHour;

  explain
    .step({ label: 'Retail revenue', formula: 'retailPrice x unitsSoldPerHour', result: revenuePerHour, unit: '$/hour' })
    .step({
      label: 'Cost of goods',
      formula: '(unitCost + transportPerUnit) x unitsSoldPerHour',
      result: costOfGoodsPerHour,
      unit: '$/hour',
    })
    .step({
      label: 'Store labour',
      formula: 'storeWages x (1 + adminOverhead)',
      result: labourCostPerHour,
      unit: '$/hour',
    })
    .step({
      label: 'Retail profit',
      formula: 'revenue - costOfGoods - labour',
      result: profitPerHour,
      unit: '$/hour',
    });

  // The comparison: selling the same units on the Exchange incurs the seller fee but
  // no store wages. Retail only wins if the price premium covers the wage bill.
  let exchangeProfitPerHour: number | null = null;
  let retailAdvantagePerHour: number | null = null;
  let breakEvenThroughput: number | null = null;

  if (params.exchangePrice !== null) {
    explain
      .input({ label: 'Exchange price', value: params.exchangePrice, unit: '$', source: 'market' })
      .assume({
        label: 'Exchange seller fee',
        detail: EXCHANGE_SELLER_FEE.source,
        confidence: EXCHANGE_SELLER_FEE.confidence,
        source: EXCHANGE_SELLER_FEE.source,
      });

    const netExchangePerUnit = params.exchangePrice * (1 - EXCHANGE_SELLER_FEE.value);
    exchangeProfitPerHour = (netExchangePerUnit - params.unitCost) * params.unitsSoldPerHour;
    retailAdvantagePerHour = profitPerHour - exchangeProfitPerHour;

    explain
      .step({
        label: 'Exchange profit on the same volume',
        formula: '(exchangePrice x (1 - fee) - unitCost) x unitsSoldPerHour',
        result: exchangeProfitPerHour,
        unit: '$/hour',
      })
      .step({
        label: 'Retail advantage',
        formula: 'retailProfitPerHour - exchangeProfitPerHour',
        result: retailAdvantagePerHour,
        unit: '$/hour',
      });

    // Retail carries a fixed hourly wage bill; the Exchange does not. Solving for the
    // throughput at which the per-unit retail premium covers that fixed cost.
    const premiumPerUnit = params.retailPrice - transport - netExchangePerUnit;
    breakEvenThroughput = premiumPerUnit > 0 ? labourCostPerHour / premiumPerUnit : null;

    if (breakEvenThroughput !== null) {
      explain.step({
        label: 'Throughput needed to beat the Exchange',
        formula: 'storeLabourPerHour / (retailPrice - transport - netExchangePrice)',
        result: breakEvenThroughput,
        unit: 'units/hour',
      });
    } else {
      explain.warn(
        'Your retail price is below what the Exchange nets you per unit, so no amount of throughput makes retail the better choice at these prices.',
      );
    }
  } else {
    explain.warn('No Exchange price available, so retail cannot be compared against selling directly.');
  }

  if (params.unitsSoldPerHour <= 0) {
    explain.warn('A store selling nothing still pays wages, so profit here is simply the wage bill as a loss.');
  }

  return explain.build<RetailResult>({
    revenuePerHour,
    costOfGoodsPerHour,
    labourCostPerHour,
    profitPerHour,
    profitPerUnit: params.unitsSoldPerHour > 0 ? profitPerHour / params.unitsSoldPerHour : 0,
    marginPerUnit: params.retailPrice > 0 ? (profitPerHour / params.unitsSoldPerHour || 0) / params.retailPrice : 0,
    exchangeProfitPerHour,
    retailAdvantagePerHour,
    recommendation:
      retailAdvantagePerHour === null ? 'unknown' : retailAdvantagePerHour > 0 ? 'retail' : 'exchange',
    breakEvenThroughput,
  });
}

export interface QualityStepParams {
  readonly productName: string;
  readonly fromQuality: number;
  readonly toQuality: number;
  /** Market price at the lower quality. */
  readonly priceAtFrom: number | null;
  /** Market price at the higher quality. */
  readonly priceAtTo: number | null;
  /** What one unit costs you to produce at the lower quality. */
  readonly costAtFrom: number;
  /** Extra cost per unit of reaching the higher quality. */
  readonly extraCostPerUnit: number;
  /** Output lost to the slower/costlier process, as a fraction (0.1 = 10% less). */
  readonly throughputPenalty?: number;
  readonly unitsPerHourAtFrom: number;
}

export interface QualityStepResult {
  /** What the market pays extra for the higher quality, per unit. */
  readonly pricePremium: number | null;
  readonly premiumPercent: number | null;
  readonly profitPerUnitAtFrom: number | null;
  readonly profitPerUnitAtTo: number | null;
  readonly profitPerHourAtFrom: number | null;
  readonly profitPerHourAtTo: number | null;
  readonly worthwhile: boolean | null;
  /** The most you could spend per unit on quality and still come out ahead. */
  readonly maximumJustifiedExtraCost: number | null;
}

/**
 * Is stepping up one quality level worth it?
 *
 * Compares the premium the market actually pays — read from live listings, not
 * assumed — against what the player says it costs them to get there. Crucially it
 * compares *profit per hour*, not per unit: a higher quality that slows production
 * can raise margin while lowering earnings.
 */
export function evaluateQualityStep(params: QualityStepParams): Explained<QualityStepResult> {
  const explain = new ExplanationBuilder();
  const penalty = params.throughputPenalty ?? 0;

  explain
    .input({ label: 'Product', value: params.productName, source: 'catalog' })
    .input({ label: 'From quality', value: params.fromQuality, source: 'user' })
    .input({ label: 'To quality', value: params.toQuality, source: 'user' })
    .input({ label: 'Price at lower quality', value: params.priceAtFrom, unit: '$', source: 'market' })
    .input({ label: 'Price at higher quality', value: params.priceAtTo, unit: '$', source: 'market' })
    .input({ label: 'Cost at lower quality', value: params.costAtFrom, unit: '$/unit', source: 'user' })
    .input({ label: 'Extra cost for higher quality', value: params.extraCostPerUnit, unit: '$/unit', source: 'user' });

  if (params.priceAtFrom === null || params.priceAtTo === null) {
    explain.warn(
      'The Exchange has no offer at one of these quality levels, so there is no observable premium to compare against.',
    );
    return explain.build<QualityStepResult>({
      pricePremium: null,
      premiumPercent: null,
      profitPerUnitAtFrom: null,
      profitPerUnitAtTo: null,
      profitPerHourAtFrom: null,
      profitPerHourAtTo: null,
      worthwhile: null,
      maximumJustifiedExtraCost: null,
    });
  }

  const fee = EXCHANGE_SELLER_FEE.value;
  explain.assume({
    label: 'Exchange seller fee',
    detail: EXCHANGE_SELLER_FEE.source,
    confidence: EXCHANGE_SELLER_FEE.confidence,
    source: EXCHANGE_SELLER_FEE.source,
  });

  const pricePremium = params.priceAtTo - params.priceAtFrom;
  const premiumPercent = params.priceAtFrom > 0 ? (pricePremium / params.priceAtFrom) * 100 : null;

  const profitPerUnitAtFrom = params.priceAtFrom * (1 - fee) - params.costAtFrom;
  const profitPerUnitAtTo = params.priceAtTo * (1 - fee) - (params.costAtFrom + params.extraCostPerUnit);

  const unitsAtTo = params.unitsPerHourAtFrom * (1 - penalty);
  const profitPerHourAtFrom = profitPerUnitAtFrom * params.unitsPerHourAtFrom;
  const profitPerHourAtTo = profitPerUnitAtTo * unitsAtTo;

  explain
    .step({ label: 'Market premium', formula: 'priceAtTo - priceAtFrom', result: pricePremium, unit: '$/unit' })
    .step({
      label: `Profit per unit at Q${params.fromQuality}`,
      formula: 'priceAtFrom x (1 - fee) - costAtFrom',
      result: profitPerUnitAtFrom,
      unit: '$/unit',
    })
    .step({
      label: `Profit per unit at Q${params.toQuality}`,
      formula: 'priceAtTo x (1 - fee) - (costAtFrom + extraCost)',
      result: profitPerUnitAtTo,
      unit: '$/unit',
    })
    .step({
      label: `Profit per hour at Q${params.fromQuality}`,
      formula: 'profitPerUnit x unitsPerHour',
      result: profitPerHourAtFrom,
      unit: '$/hour',
    })
    .step({
      label: `Profit per hour at Q${params.toQuality}`,
      formula: 'profitPerUnit x unitsPerHour x (1 - throughputPenalty)',
      result: profitPerHourAtTo,
      unit: '$/hour',
    });

  // The break-even extra cost: how much the higher quality could cost per unit
  // before it stops beating staying put, at equal hourly output.
  const maximumJustifiedExtraCost =
    unitsAtTo > 0
      ? params.priceAtTo * (1 - fee) - params.costAtFrom - (profitPerHourAtFrom / unitsAtTo)
      : null;

  explain.step({
    label: 'Most you could justify spending on quality',
    formula: 'priceAtTo x (1 - fee) - costAtFrom - (profitPerHourAtFrom / unitsAtTo)',
    result: maximumJustifiedExtraCost,
    unit: '$/unit',
  });

  if (penalty > 0) {
    explain.warn(
      `Higher quality is assumed to cut output by ${(penalty * 100).toFixed(0)}%. Margin per unit and profit per hour can point in opposite directions when that happens.`,
    );
  }
  if (profitPerUnitAtTo > profitPerUnitAtFrom && profitPerHourAtTo < profitPerHourAtFrom) {
    explain.warn(
      'The higher quality earns more per unit but less per hour. Per-hour is what fills your bank account.',
    );
  }

  return explain.build<QualityStepResult>({
    pricePremium,
    premiumPercent,
    profitPerUnitAtFrom,
    profitPerUnitAtTo,
    profitPerHourAtFrom,
    profitPerHourAtTo,
    worthwhile: profitPerHourAtTo > profitPerHourAtFrom,
    maximumJustifiedExtraCost,
  });
}
