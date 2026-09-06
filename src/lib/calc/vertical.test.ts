import { describe, expect, it } from 'vitest';
import { compareVerticalIntegration, type VerticalIntegrationParams } from './vertical';
import type { ProductionParams } from './production';

const ownProduction: ProductionParams = {
  outputName: 'Alpha',
  baseUnitsPerHour: 10,
  buildingLevel: 1,
  wagesPerHourPerLevel: 50,
  inputs: [],
  salePrice: null,
};

const base: VerticalIntegrationParams = {
  inputName: 'Alpha',
  unitsNeededPerHour: 10,
  marketPrice: 8,
  ownProduction,
  alternativeProfitPerHour: null,
};

describe('compareVerticalIntegration', () => {
  it('recommends producing when in-house cash cost is lower and the building is idle', () => {
    // in-house: 50 $/h over 10 units = 5 $/unit, versus 8 $/unit on the market.
    const result = compareVerticalIntegration(base).result;
    expect(result.productionCostPerUnit).toBe(5);
    expect(result.purchaseCostPerUnit).toBe(8);
    expect(result.recommendation).toBe('produce');
    expect(result.savingPerHour).toBe(30);
  });

  it('warns that idle-building time is only free if the building is genuinely idle', () => {
    const result = compareVerticalIntegration(base);
    expect(result.warnings.some((w) => w.includes('otherwise sit idle'))).toBe(true);
  });

  it('reverses the answer once opportunity cost is counted', () => {
    // The building could earn $100/h elsewhere: 10 $/unit of forgone profit.
    const result = compareVerticalIntegration({ ...base, alternativeProfitPerHour: 100 }).result;
    expect(result.opportunityCostPerUnit).toBe(10);
    expect(result.effectiveProductionCostPerUnit).toBe(15);
    expect(result.naiveRecommendation).toBe('produce');
    expect(result.recommendation).toBe('buy');
    expect(result.opportunityCostChangesAnswer).toBe(true);
  });

  it('flags the reversal prominently in the explanation', () => {
    const result = compareVerticalIntegration({ ...base, alternativeProfitPerHour: 100 });
    expect(result.warnings.some((w) => w.includes('reverse this recommendation'))).toBe(true);
  });

  it('keeps recommending production when the alternative is weak', () => {
    const result = compareVerticalIntegration({ ...base, alternativeProfitPerHour: 10 }).result;
    expect(result.effectiveProductionCostPerUnit).toBe(6);
    expect(result.recommendation).toBe('produce');
    expect(result.opportunityCostChangesAnswer).toBe(false);
  });

  it('adds inbound transport to the delivered purchase cost', () => {
    const result = compareVerticalIntegration({ ...base, purchaseTransportCostPerUnit: 2 }).result;
    expect(result.purchaseCostPerUnit).toBe(10);
  });

  it('cannot decide when the Exchange has no offers', () => {
    const result = compareVerticalIntegration({ ...base, marketPrice: null });
    expect(result.result.recommendation).toBe('unknown');
    expect(result.result.savingPerHour).toBeNull();
    expect(result.warnings.some((w) => w.includes('no offers'))).toBe(true);
  });

  it('cannot decide when an in-house input has no price', () => {
    const result = compareVerticalIntegration({
      ...base,
      ownProduction: {
        ...ownProduction,
        inputs: [{ resourceId: 9, resourceName: 'Seed', amountPerUnit: 1, unitPrice: null }],
      },
    }).result;
    expect(result.productionCostPerUnit).toBeNull();
    expect(result.recommendation).toBe('unknown');
  });

  it('reports the capacity required and warns when one building is not enough', () => {
    const result = compareVerticalIntegration({ ...base, unitsNeededPerHour: 25 });
    expect(result.result.hoursOfProductionNeededPerHour).toBe(2.5);
    expect(result.warnings.some((w) => w.includes('2.50x the capacity'))).toBe(true);
  });

  it('does not warn about capacity when one building covers demand', () => {
    const result = compareVerticalIntegration({ ...base, unitsNeededPerHour: 5 });
    expect(result.warnings.some((w) => w.includes('capacity'))).toBe(false);
  });
});
