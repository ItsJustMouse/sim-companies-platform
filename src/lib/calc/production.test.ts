import { describe, expect, it } from 'vitest';
import { calculateProduction, maximumViableInputPrice, type ProductionParams } from './production';
import { EXCHANGE_SELLER_FEE } from '@/lib/game/constants';

/**
 * Fixtures use round numbers so every expected value can be verified by hand from
 * the formula in the module docstring. They are not real game data.
 */
const base: ProductionParams = {
  outputName: 'Test Widget',
  baseUnitsPerHour: 10,
  buildingLevel: 1,
  wagesPerHourPerLevel: 100,
  inputs: [],
  salePrice: null,
};

describe('calculateProduction — output rate', () => {
  it('scales linearly with building level', () => {
    expect(calculateProduction({ ...base, buildingLevel: 4 }).result.unitsPerHour).toBe(40);
  });

  it('applies the production bonus multiplicatively', () => {
    expect(calculateProduction({ ...base, productionBonus: 0.25 }).result.unitsPerHour).toBe(12.5);
  });

  it('applies abundance for extraction buildings', () => {
    expect(calculateProduction({ ...base, abundance: 0.8 }).result.unitsPerHour).toBe(8);
  });

  it('reports units per day as 24x the hourly rate', () => {
    expect(calculateProduction(base).result.unitsPerDay).toBe(240);
  });
});

describe('calculateProduction — labour', () => {
  it('divides the wage bill across output', () => {
    // 100 $/h over 10 units/h = 10 $/unit
    expect(calculateProduction(base).result.labourCostPerUnit).toBe(10);
  });

  it('leaves labour per unit unchanged when level scales both wages and output', () => {
    const l1 = calculateProduction({ ...base, buildingLevel: 1 }).result.labourCostPerUnit;
    const l7 = calculateProduction({ ...base, buildingLevel: 7 }).result.labourCostPerUnit;
    expect(l7).toBeCloseTo(l1, 10);
  });

  it('applies administration overhead on top of wages', () => {
    expect(calculateProduction({ ...base, adminOverhead: 0.5 }).result.labourCostPerUnit).toBe(15);
  });

  it('reduces the wage bill when robots are enabled', () => {
    const result = calculateProduction({ ...base, useRobots: true }).result;
    expect(result.hourlyWages).toBeCloseTo(97, 10);
    expect(result.labourCostPerUnit).toBeCloseTo(9.7, 10);
  });

  it('records the robot multiplier as an explicit assumption', () => {
    const withRobots = calculateProduction({ ...base, useRobots: true });
    expect(withRobots.assumptions.some((a) => a.label === 'Robot wage reduction')).toBe(true);
    // Not assumed when the toggle is off.
    expect(calculateProduction(base).assumptions.some((a) => a.label === 'Robot wage reduction')).toBe(false);
  });
});

describe('calculateProduction — inputs', () => {
  const withInputs: ProductionParams = {
    ...base,
    inputs: [
      { resourceId: 1, resourceName: 'Alpha', amountPerUnit: 2, unitPrice: 3 },
      { resourceId: 2, resourceName: 'Beta', amountPerUnit: 0.5, unitPrice: 8 },
    ],
  };

  it('sums input cost across the recipe', () => {
    // 2*3 + 0.5*8 = 10
    expect(calculateProduction(withInputs).result.inputCostPerUnit).toBe(10);
  });

  it('refuses to treat an unpriced input as free', () => {
    const result = calculateProduction({
      ...withInputs,
      inputs: [...withInputs.inputs, { resourceId: 3, resourceName: 'Gamma', amountPerUnit: 1, unitPrice: null }],
    });
    expect(result.result.inputCostPerUnit).toBeNull();
    expect(result.result.totalCostPerUnit).toBeNull();
    expect(result.result.incomplete).toBe(true);
    expect(result.warnings.some((w) => w.includes('Gamma'))).toBe(true);
  });
});

describe('calculateProduction — revenue, profit and break-even', () => {
  const priced: ProductionParams = {
    ...base,
    inputs: [{ resourceId: 1, resourceName: 'Alpha', amountPerUnit: 2, unitPrice: 3 }],
    salePrice: 100,
  };

  it('deducts the exchange fee from gross revenue', () => {
    const result = calculateProduction(priced).result;
    expect(result.netRevenuePerUnit).toBeCloseTo(100 * (1 - EXCHANGE_SELLER_FEE.value), 10);
  });

  it('charges no exchange fee on contract sales', () => {
    const result = calculateProduction({ ...priced, saleChannel: 'contract' }).result;
    expect(result.netRevenuePerUnit).toBe(100);
  });

  it('computes profit per unit, hour and day consistently', () => {
    const result = calculateProduction(priced).result;
    // cost = inputs 6 + labour 10 = 16; net revenue = 97; profit = 81
    expect(result.totalCostPerUnit).toBe(16);
    expect(result.profitPerUnit).toBeCloseTo(81, 10);
    expect(result.profitPerHour).toBeCloseTo(810, 10);
    expect(result.profitPerDay).toBeCloseTo(810 * 24, 10);
  });

  it('reports margin against gross sale price', () => {
    expect(calculateProduction(priced).result.margin).toBeCloseTo(81 / 100, 10);
  });

  it('produces a break-even price that yields exactly zero profit', () => {
    const breakEven = calculateProduction(priced).result.breakEvenSalePrice;
    expect(breakEven).not.toBeNull();
    const atBreakEven = calculateProduction({ ...priced, salePrice: breakEven }).result;
    expect(atBreakEven.profitPerUnit).toBeCloseTo(0, 9);
  });

  it('reports a loss rather than clamping at zero', () => {
    const result = calculateProduction({ ...priced, salePrice: 5 }).result;
    expect(result.profitPerUnit).toBeLessThan(0);
    expect(result.profitPerHour).toBeLessThan(0);
  });

  it('returns a cost breakdown with no profit figures when no sale price is given', () => {
    const result = calculateProduction({ ...priced, salePrice: null });
    expect(result.result.profitPerUnit).toBeNull();
    expect(result.result.totalCostPerUnit).toBe(16);
    expect(result.warnings.some((w) => w.includes('cost breakdown'))).toBe(true);
  });
});

describe('calculateProduction — transport', () => {
  const shipped: ProductionParams = {
    ...base,
    salePrice: 100,
    transportUnitsPerUnit: 2,
    transportUnitCost: 5,
  };

  it('charges full transport on exchange sales', () => {
    expect(calculateProduction(shipped).result.transportCostPerUnit).toBe(10);
  });

  it('halves transport on contract sales, and says that it assumed so', () => {
    const result = calculateProduction({ ...shipped, saleChannel: 'contract' });
    expect(result.result.transportCostPerUnit).toBe(5);
    expect(result.assumptions.some((a) => a.label === 'Contract transport split')).toBe(true);
  });

  it('warns when transport is priced at zero', () => {
    const result = calculateProduction({ ...shipped, transportUnitCost: 0 });
    expect(result.warnings.some((w) => w.includes('$0'))).toBe(true);
  });
});

describe('calculateProduction — degenerate inputs', () => {
  it('does not divide by zero when nothing is produced', () => {
    const result = calculateProduction({ ...base, buildingLevel: 0, salePrice: 50 });
    expect(result.result.unitsPerHour).toBe(0);
    expect(result.result.labourCostPerUnit).toBe(0);
    expect(result.result.profitPerHour).toBeNull();
    expect(Number.isFinite(result.result.hourlyWages)).toBe(true);
    expect(result.warnings.some((w) => w.includes('produces nothing'))).toBe(true);
  });

  it('handles a zero base rate the same way', () => {
    expect(calculateProduction({ ...base, baseUnitsPerHour: 0 }).result.unitsPerHour).toBe(0);
  });

  it('treats a negative building level as zero rather than producing negative output', () => {
    expect(calculateProduction({ ...base, buildingLevel: -3 }).result.unitsPerHour).toBe(0);
  });

  it('stays finite at extreme market prices', () => {
    const result = calculateProduction({ ...base, salePrice: 1e12 }).result;
    expect(Number.isFinite(result.profitPerHour ?? Number.NaN)).toBe(true);
  });
});

describe('maximumViableInputPrice', () => {
  const params: ProductionParams = {
    ...base,
    salePrice: 100,
    inputs: [
      { resourceId: 1, resourceName: 'Alpha', amountPerUnit: 2, unitPrice: 3 },
      { resourceId: 2, resourceName: 'Beta', amountPerUnit: 1, unitPrice: 4 },
    ],
  };

  it('finds the price at which the recipe exactly breaks even', () => {
    const max = maximumViableInputPrice(params, 1).result;
    expect(max).not.toBeNull();
    // Paying exactly that much should wipe out the profit.
    const atMax = calculateProduction({
      ...params,
      inputs: params.inputs.map((i) => (i.resourceId === 1 ? { ...i, unitPrice: max } : i)),
    }).result;
    expect(atMax.profitPerUnit).toBeCloseTo(0, 9);
  });

  it('returns null for a resource the recipe does not use', () => {
    const result = maximumViableInputPrice(params, 999);
    expect(result.result).toBeNull();
    expect(result.warnings.some((w) => w.includes('not an input'))).toBe(true);
  });

  it('returns null without a sale price', () => {
    expect(maximumViableInputPrice({ ...params, salePrice: null }, 1).result).toBeNull();
  });

  it('warns when the recipe cannot break even even with a free input', () => {
    const result = maximumViableInputPrice({ ...params, salePrice: 1 }, 1);
    expect(result.result).toBeLessThanOrEqual(0);
    expect(result.warnings.some((w) => w.includes('free input'))).toBe(true);
  });
});

describe('explanations', () => {
  it('records every input, step and the calculation time', () => {
    const result = calculateProduction({ ...base, salePrice: 100 });
    expect(result.inputs.length).toBeGreaterThan(0);
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.steps.every((s) => s.formula.length > 0)).toBe(true);
    expect(Date.parse(result.calculatedAt)).not.toBeNaN();
  });

  it('does not repeat the same assumption twice', () => {
    const result = calculateProduction({ ...base, salePrice: 100, useRobots: true });
    const labels = result.assumptions.map((a) => a.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
