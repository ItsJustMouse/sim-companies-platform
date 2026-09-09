import {
  CONTRACT_TRANSPORT_SHARE,
  EXCHANGE_SELLER_FEE,
  ROBOT_WAGE_MULTIPLIER,
  type GameConstant,
} from '@/lib/game/constants';
import { ExplanationBuilder, type CalcAssumption, type Explained } from './types';

/**
 * The production economics core.
 *
 * Every profitability figure in Simconomist — the Exchange opportunity scanner, the
 * production calculator, the vertical-integration comparison, the company advisor —
 * resolves to this one function. There is exactly one implementation of the formula
 * in the codebase, so a correction here corrects the entire product at once.
 *
 * The model
 * ---------
 *   unitsPerHour = baseUnitsPerHour x buildingLevel x (1 + productionBonus) x abundance
 *   hourlyWages  = wagesPerHourPerLevel x buildingLevel x (robots ? robotMultiplier : 1)
 *   labourPerUnit = hourlyWages / unitsPerHour x (1 + adminOverhead)
 *   inputCostPerUnit = sum(inputAmount x inputUnitPrice)
 *   transportPerUnit = transportUnits x transportUnitCost x (contract ? share : 1)
 *   netRevenuePerUnit = salePrice x (exchange ? 1 - fee : 1)
 *   profitPerUnit = netRevenuePerUnit - inputCostPerUnit - labourPerUnit - transportPerUnit
 *
 * Building level cancels out of profit *per unit* (it scales wages and output
 * equally) but not out of profit *per hour*, which is why both are reported.
 *
 * Confidence: the structure is consistent across every independent community
 * implementation we examined, but the game operators publish no specification. Each
 * constant carries its own confidence rating and is surfaced with the result.
 */

export type SaleChannel = 'exchange' | 'contract';

export interface ProductionInputLine {
  readonly resourceId: number;
  readonly resourceName: string;
  /** Units of this input consumed per unit of output. */
  readonly amountPerUnit: number;
  /** Price paid per unit of input. `null` when unknown — makes the result partial. */
  readonly unitPrice: number | null;
  readonly priceObservedAt?: string | null;
  readonly priceSource?: 'market' | 'user';
}

export interface ProductionParams {
  readonly outputName: string;
  /** Units produced per hour at building level 1 with no modifiers. */
  readonly baseUnitsPerHour: number;
  readonly buildingLevel: number;
  /** Building's hourly wage bill per level, from the game's own encyclopedia. */
  readonly wagesPerHourPerLevel: number;
  /** Production speed bonus as a fraction, e.g. 0.12 for +12%. */
  readonly productionBonus?: number;
  /** Administration overhead as a fraction, e.g. 0.05 for +5%. */
  readonly adminOverhead?: number;
  /** Resource abundance for extraction buildings, as a fraction (1 = 100%). */
  readonly abundance?: number;
  readonly useRobots?: boolean;
  readonly inputs: readonly ProductionInputLine[];
  /** Price the output is sold at. `null` leaves the result cost-only. */
  readonly salePrice: number | null;
  readonly salePriceObservedAt?: string | null;
  readonly saleChannel?: SaleChannel;
  /** Transport units consumed per unit of output. */
  readonly transportUnitsPerUnit?: number | null;
  /** Cost of one transport unit. */
  readonly transportUnitCost?: number | null;
}

export interface ProductionResult {
  readonly unitsPerHour: number;
  readonly unitsPerDay: number;
  readonly hourlyWages: number;
  readonly labourCostPerUnit: number;
  readonly inputCostPerUnit: number | null;
  readonly transportCostPerUnit: number;
  /** Everything it costs to make and deliver one unit. */
  readonly totalCostPerUnit: number | null;
  readonly netRevenuePerUnit: number | null;
  readonly profitPerUnit: number | null;
  readonly profitPerHour: number | null;
  readonly profitPerDay: number | null;
  /** Profit as a fraction of gross revenue. */
  readonly margin: number | null;
  /**
   * Sale price at which profit per unit is exactly zero. Below this, producing and
   * selling loses money.
   */
  readonly breakEvenSalePrice: number | null;
  /** True when an input price was unknown, so cost figures are incomplete. */
  readonly incomplete: boolean;
}

function assumptionFrom(label: string, constant: GameConstant<number>): CalcAssumption {
  return {
    label,
    detail: constant.caveat ? `${constant.source} ${constant.caveat}` : constant.source,
    confidence: constant.confidence,
    source: constant.source,
  };
}

export function calculateProduction(params: ProductionParams): Explained<ProductionResult> {
  const explain = new ExplanationBuilder();

  const level = Math.max(0, params.buildingLevel);
  const productionBonus = params.productionBonus ?? 0;
  const adminOverhead = params.adminOverhead ?? 0;
  const abundance = params.abundance ?? 1;
  const useRobots = params.useRobots ?? false;
  const channel: SaleChannel = params.saleChannel ?? 'exchange';

  explain
    .input({ label: 'Output', value: params.outputName, source: 'catalog' })
    .input({ label: 'Base output', value: params.baseUnitsPerHour, unit: 'units/hour/level', source: 'catalog' })
    .input({ label: 'Building level', value: level, source: 'user' })
    .input({ label: 'Production bonus', value: productionBonus * 100, unit: '%', source: 'user' })
    .input({ label: 'Administration overhead', value: adminOverhead * 100, unit: '%', source: 'user' })
    .input({ label: 'Base wages', value: params.wagesPerHourPerLevel, unit: '$/hour/level', source: 'catalog' });

  if (abundance !== 1) {
    explain.input({ label: 'Resource abundance', value: abundance * 100, unit: '%', source: 'user' });
  }

  // ---- Output rate -------------------------------------------------------
  const unitsPerHour = params.baseUnitsPerHour * level * (1 + productionBonus) * abundance;
  explain.step({
    label: 'Units per hour',
    formula: 'baseUnitsPerHour x level x (1 + productionBonus) x abundance',
    result: unitsPerHour,
    unit: 'units/hour',
  });

  if (unitsPerHour <= 0) {
    // Dividing wages by zero output would produce Infinity and quietly poison every
    // downstream figure, so stop here with an explicit, explained result.
    explain.warn(
      'This configuration produces nothing (building level, base rate or abundance is zero), so per-unit costs are undefined.',
    );
    return explain.build<ProductionResult>({
      unitsPerHour: 0,
      unitsPerDay: 0,
      hourlyWages: params.wagesPerHourPerLevel * level,
      labourCostPerUnit: 0,
      inputCostPerUnit: null,
      transportCostPerUnit: 0,
      totalCostPerUnit: null,
      netRevenuePerUnit: null,
      profitPerUnit: null,
      profitPerHour: null,
      profitPerDay: null,
      margin: null,
      breakEvenSalePrice: null,
      incomplete: true,
    });
  }

  // ---- Labour ------------------------------------------------------------
  const robotMultiplier = useRobots ? ROBOT_WAGE_MULTIPLIER.value : 1;
  if (useRobots) explain.assume(assumptionFrom('Robot wage reduction', ROBOT_WAGE_MULTIPLIER));

  const hourlyWages = params.wagesPerHourPerLevel * level * robotMultiplier;
  explain.step({
    label: 'Hourly wage bill',
    formula: useRobots ? 'wages x level x robotMultiplier' : 'wages x level',
    result: hourlyWages,
    unit: '$/hour',
  });

  const labourCostPerUnit = (hourlyWages / unitsPerHour) * (1 + adminOverhead);
  explain.step({
    label: 'Labour per unit',
    formula: 'hourlyWages / unitsPerHour x (1 + adminOverhead)',
    result: labourCostPerUnit,
    unit: '$/unit',
  });

  // ---- Inputs ------------------------------------------------------------
  let inputCostPerUnit: number | null = 0;
  for (const line of params.inputs) {
    if (line.unitPrice === null) {
      // One unpriced input makes the whole cost figure a guess. Say so rather than
      // treating the missing price as free.
      inputCostPerUnit = null;
      explain.warn(`No price available for input "${line.resourceName}", so cost figures are incomplete.`);
      continue;
    }
    if (inputCostPerUnit !== null) inputCostPerUnit += line.amountPerUnit * line.unitPrice;
    explain.input({
      label: `Input: ${line.resourceName}`,
      value: line.unitPrice,
      unit: `$/unit x ${line.amountPerUnit}`,
      source: line.priceSource ?? 'market',
      observedAt: line.priceObservedAt ?? null,
    });
  }

  if (params.inputs.length > 0) {
    explain.step({
      label: 'Input cost per unit',
      formula: 'sum(amountPerUnit x unitPrice)',
      result: inputCostPerUnit,
      unit: '$/unit',
    });
  }

  // ---- Transport ---------------------------------------------------------
  const transportUnits = params.transportUnitsPerUnit ?? 0;
  const transportUnitCost = params.transportUnitCost ?? 0;
  const contractShare = channel === 'contract' ? CONTRACT_TRANSPORT_SHARE.value : 1;
  if (channel === 'contract' && transportUnits > 0) {
    explain.assume(assumptionFrom('Contract transport split', CONTRACT_TRANSPORT_SHARE));
  }
  const transportCostPerUnit = transportUnits * transportUnitCost * contractShare;
  if (transportUnits > 0) {
    explain
      .input({ label: 'Transport required', value: transportUnits, unit: 'transport units/unit', source: 'catalog' })
      .input({ label: 'Transport unit cost', value: transportUnitCost, unit: '$/transport unit', source: 'user' })
      .step({
        label: 'Transport per unit',
        formula:
          channel === 'contract'
            ? 'transportUnits x transportUnitCost x contractShare'
            : 'transportUnits x transportUnitCost',
        result: transportCostPerUnit,
        unit: '$/unit',
      });
    if (transportUnitCost === 0) {
      explain.warn(
        'Transport cost is set to $0, so delivery is treated as free. Set a transport unit cost for a realistic figure.',
      );
    }
  }

  const totalCostPerUnit =
    inputCostPerUnit === null ? null : inputCostPerUnit + labourCostPerUnit + transportCostPerUnit;
  explain.step({
    label: 'Total cost per unit',
    formula: 'inputCost + labourCost + transportCost',
    result: totalCostPerUnit,
    unit: '$/unit',
  });

  // ---- Revenue and profit ------------------------------------------------
  const feeMultiplier = channel === 'exchange' ? 1 - EXCHANGE_SELLER_FEE.value : 1;
  if (channel === 'exchange') explain.assume(assumptionFrom('Exchange seller fee', EXCHANGE_SELLER_FEE));

  const netRevenuePerUnit = params.salePrice === null ? null : params.salePrice * feeMultiplier;
  if (params.salePrice !== null) {
    explain
      .input({
        label: 'Sale price',
        value: params.salePrice,
        unit: '$/unit',
        source: params.salePriceObservedAt ? 'market' : 'user',
        observedAt: params.salePriceObservedAt ?? null,
      })
      .step({
        label: 'Net revenue per unit',
        formula: channel === 'exchange' ? 'salePrice x (1 - exchangeFee)' : 'salePrice',
        result: netRevenuePerUnit,
        unit: '$/unit',
      });
  } else {
    explain.warn('No sale price supplied — this is a cost breakdown only.');
  }

  const profitPerUnit =
    netRevenuePerUnit === null || totalCostPerUnit === null ? null : netRevenuePerUnit - totalCostPerUnit;
  if (profitPerUnit !== null) {
    explain.step({
      label: 'Profit per unit',
      formula: 'netRevenuePerUnit - totalCostPerUnit',
      result: profitPerUnit,
      unit: '$/unit',
    });
  }

  const profitPerHour = profitPerUnit === null ? null : profitPerUnit * unitsPerHour;
  if (profitPerHour !== null) {
    explain.step({
      label: 'Profit per hour',
      formula: 'profitPerUnit x unitsPerHour',
      result: profitPerHour,
      unit: '$/hour',
    });
  }

  const margin =
    profitPerUnit === null || params.salePrice === null || params.salePrice === 0
      ? null
      : profitPerUnit / params.salePrice;

  // Break-even: the gross price at which net revenue exactly covers total cost.
  // Solving salePrice x feeMultiplier = totalCost for salePrice.
  const breakEvenSalePrice = totalCostPerUnit === null ? null : totalCostPerUnit / feeMultiplier;
  if (breakEvenSalePrice !== null) {
    explain.step({
      label: 'Break-even sale price',
      formula: channel === 'exchange' ? 'totalCostPerUnit / (1 - exchangeFee)' : 'totalCostPerUnit',
      result: breakEvenSalePrice,
      unit: '$/unit',
    });
  }

  return explain.build<ProductionResult>({
    unitsPerHour,
    unitsPerDay: unitsPerHour * 24,
    hourlyWages,
    labourCostPerUnit,
    inputCostPerUnit,
    transportCostPerUnit,
    totalCostPerUnit,
    netRevenuePerUnit,
    profitPerUnit,
    profitPerHour,
    profitPerDay: profitPerHour === null ? null : profitPerHour * 24,
    margin,
    breakEvenSalePrice,
    incomplete: inputCostPerUnit === null,
  });
}

/**
 * Highest price you can pay for one input while still breaking even at a given
 * sale price. Answers "is this input listing worth buying?" directly.
 */
export function maximumViableInputPrice(
  params: ProductionParams,
  targetInputResourceId: number,
): Explained<number | null> {
  const explain = new ExplanationBuilder();
  const target = params.inputs.find((i) => i.resourceId === targetInputResourceId);

  if (!target) {
    explain.warn('That resource is not an input to this recipe.');
    return explain.build<number | null>(null);
  }
  if (params.salePrice === null) {
    explain.warn('A sale price is required to work backwards to a maximum input price.');
    return explain.build<number | null>(null);
  }
  if (target.amountPerUnit <= 0) {
    explain.warn('The recipe consumes none of this input, so no maximum price applies.');
    return explain.build<number | null>(null);
  }

  // Cost everything *except* the target input, then see what budget is left.
  const withoutTarget = calculateProduction({
    ...params,
    inputs: params.inputs.filter((i) => i.resourceId !== targetInputResourceId),
  });
  const other = withoutTarget.result;
  if (other.netRevenuePerUnit === null || other.totalCostPerUnit === null) {
    explain.warn('Another input has no known price, so the remaining budget cannot be determined.');
    return explain.build<number | null>(null);
  }

  const budgetPerOutputUnit = other.netRevenuePerUnit - other.totalCostPerUnit;
  const maxPrice = budgetPerOutputUnit / target.amountPerUnit;

  explain
    .input({ label: 'Sale price', value: params.salePrice, unit: '$/unit', source: 'user' })
    .input({ label: 'Input', value: target.resourceName, source: 'catalog' })
    .input({ label: 'Consumed per output unit', value: target.amountPerUnit, source: 'catalog' })
    .step({
      label: 'Budget left for this input',
      formula: 'netRevenuePerUnit - (all other costs per unit)',
      result: budgetPerOutputUnit,
      unit: '$/output unit',
    })
    .step({
      label: 'Maximum input price',
      formula: 'budgetPerOutputUnit / amountPerUnit',
      result: maxPrice,
      unit: '$/input unit',
    });

  for (const assumption of withoutTarget.assumptions) explain.assume(assumption);
  if (maxPrice <= 0) {
    explain.warn(
      'Even a free input would not break even at this sale price — the other costs already exceed net revenue.',
    );
  }

  return explain.build<number | null>(maxPrice);
}
