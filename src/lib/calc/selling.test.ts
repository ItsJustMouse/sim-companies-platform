import { describe, expect, it } from 'vitest';
import { calculateRetail, evaluateQualityStep, type QualityStepParams, type RetailParams } from './selling';
import { EXCHANGE_SELLER_FEE } from '@/lib/game/constants';

const FEE = EXCHANGE_SELLER_FEE.value;

const retailBase: RetailParams = {
  productName: 'Test Good',
  unitCost: 10,
  retailPrice: 20,
  unitsSoldPerHour: 100,
  storeWagesPerHour: 300,
  exchangePrice: 15,
};

describe('calculateRetail', () => {
  it('computes revenue, cost of goods and labour', () => {
    const result = calculateRetail(retailBase).result;
    expect(result.revenuePerHour).toBe(2000);
    expect(result.costOfGoodsPerHour).toBe(1000);
    expect(result.labourCostPerHour).toBe(300);
    expect(result.profitPerHour).toBe(700);
  });

  it('applies administration overhead to store wages', () => {
    const result = calculateRetail({ ...retailBase, adminOverhead: 0.2 }).result;
    expect(result.labourCostPerHour).toBe(360);
  });

  it('includes inbound transport in the cost of goods', () => {
    const result = calculateRetail({ ...retailBase, transportCostPerUnit: 1 }).result;
    expect(result.costOfGoodsPerHour).toBe(1100);
  });

  it('compares against the Exchange net of its fee', () => {
    const result = calculateRetail(retailBase).result;
    // (15 * 0.97 - 10) * 100
    expect(result.exchangeProfitPerHour).toBeCloseTo((15 * (1 - FEE) - 10) * 100, 8);
    expect(result.recommendation).toBe('retail');
  });

  it('recommends the Exchange when store wages outweigh the retail premium', () => {
    const result = calculateRetail({ ...retailBase, retailPrice: 15.5, storeWagesPerHour: 900 }).result;
    expect(result.recommendation).toBe('exchange');
    expect(result.retailAdvantagePerHour).toBeLessThan(0);
  });

  it('states the throughput needed to beat the Exchange', () => {
    const result = calculateRetail(retailBase).result;
    expect(result.breakEvenThroughput).not.toBeNull();
    // At exactly that throughput, retail and Exchange should tie.
    const atBreakEven = calculateRetail({
      ...retailBase,
      unitsSoldPerHour: result.breakEvenThroughput as number,
    }).result;
    expect(atBreakEven.retailAdvantagePerHour ?? 0).toBeCloseTo(0, 6);
  });

  it('has no break-even throughput when retail prices below Exchange net', () => {
    const result = calculateRetail({ ...retailBase, retailPrice: 5 });
    expect(result.result.breakEvenThroughput).toBeNull();
    expect(result.warnings.some((w) => w.includes('no amount of throughput'))).toBe(true);
  });

  it('cannot compare without an Exchange price', () => {
    const result = calculateRetail({ ...retailBase, exchangePrice: null });
    expect(result.result.recommendation).toBe('unknown');
    expect(result.warnings.some((w) => w.includes('cannot be compared'))).toBe(true);
  });

  it('records that throughput is observed rather than modelled', () => {
    const result = calculateRetail(retailBase);
    expect(result.assumptions.some((a) => a.label.includes('measured, not modelled'))).toBe(true);
  });

  it('shows a store selling nothing as losing its wage bill', () => {
    const result = calculateRetail({ ...retailBase, unitsSoldPerHour: 0 });
    expect(result.result.profitPerHour).toBe(-300);
    expect(result.warnings.some((w) => w.includes('still pays wages'))).toBe(true);
  });
});

const qualityBase: QualityStepParams = {
  productName: 'Test Good',
  fromQuality: 0,
  toQuality: 1,
  priceAtFrom: 100,
  priceAtTo: 120,
  costAtFrom: 50,
  extraCostPerUnit: 10,
  unitsPerHourAtFrom: 10,
};

describe('evaluateQualityStep', () => {
  it('reads the premium from the market rather than assuming one', () => {
    const result = evaluateQualityStep(qualityBase).result;
    expect(result.pricePremium).toBe(20);
    expect(result.premiumPercent).toBeCloseTo(20, 8);
  });

  it('judges the step worthwhile when it raises profit per hour', () => {
    const result = evaluateQualityStep(qualityBase).result;
    expect(result.profitPerHourAtTo).toBeGreaterThan(result.profitPerHourAtFrom as number);
    expect(result.worthwhile).toBe(true);
  });

  it('rejects the step when the extra cost exceeds the premium', () => {
    const result = evaluateQualityStep({ ...qualityBase, extraCostPerUnit: 40 }).result;
    expect(result.worthwhile).toBe(false);
  });

  it('counts a throughput penalty against the higher quality', () => {
    const result = evaluateQualityStep({ ...qualityBase, throughputPenalty: 0.5 }).result;
    expect(result.profitPerHourAtTo).toBeLessThan(result.profitPerHourAtFrom as number);
    expect(result.worthwhile).toBe(false);
  });

  it('warns when per-unit and per-hour disagree', () => {
    const result = evaluateQualityStep({ ...qualityBase, throughputPenalty: 0.5 });
    expect(result.result.profitPerUnitAtTo).toBeGreaterThan(result.result.profitPerUnitAtFrom as number);
    expect(result.warnings.some((w) => w.includes('less per hour'))).toBe(true);
  });

  it('states the maximum extra cost that still pays', () => {
    const result = evaluateQualityStep(qualityBase).result;
    const max = result.maximumJustifiedExtraCost as number;
    // Spending exactly that much should make the two qualities equally profitable.
    const atMax = evaluateQualityStep({ ...qualityBase, extraCostPerUnit: max }).result;
    expect(atMax.profitPerHourAtTo).toBeCloseTo(atMax.profitPerHourAtFrom as number, 6);
  });

  it('declines to answer when a quality has no market price', () => {
    const result = evaluateQualityStep({ ...qualityBase, priceAtTo: null });
    expect(result.result.worthwhile).toBeNull();
    expect(result.result.pricePremium).toBeNull();
    expect(result.warnings.some((w) => w.includes('no offer'))).toBe(true);
  });
});
