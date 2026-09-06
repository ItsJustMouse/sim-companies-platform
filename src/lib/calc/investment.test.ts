import { describe, expect, it } from 'vitest';
import { compareAllocations, evaluateInvestment, evaluateLoan } from './investment';

describe('evaluateInvestment', () => {
  it('computes payback from cost and hourly profit', () => {
    const result = evaluateInvestment({ cost: 1000, incrementalProfitPerHour: 10 }).result;
    expect(result.paybackHours).toBe(100);
    expect(result.paybackDays).toBeCloseTo(100 / 24, 10);
    expect(result.incrementalProfitPerDay).toBe(240);
  });

  it('returns null payback — not Infinity — when the investment earns nothing', () => {
    const zero = evaluateInvestment({ cost: 1000, incrementalProfitPerHour: 0 });
    expect(zero.result.paybackHours).toBeNull();
    expect(zero.result.roiOverHorizon).toBeLessThan(0);
    expect(zero.warnings.some((w) => w.includes('never pays for itself'))).toBe(true);
  });

  it('treats a profit-reducing investment as never paying back', () => {
    const result = evaluateInvestment({ cost: 1000, incrementalProfitPerHour: -5 }).result;
    expect(result.paybackHours).toBeNull();
    expect(result.netOverHorizon).toBeLessThan(-1000);
  });

  it('excludes lead time from earning hours', () => {
    const instant = evaluateInvestment({ cost: 100, incrementalProfitPerHour: 1, horizonHours: 100 }).result;
    const delayed = evaluateInvestment({
      cost: 100,
      incrementalProfitPerHour: 1,
      horizonHours: 100,
      leadTimeHours: 40,
    }).result;
    expect(instant.netOverHorizon).toBe(0);
    expect(delayed.netOverHorizon).toBe(-40);
    expect(delayed.breakEvenHoursIncludingLeadTime).toBe(140);
  });

  it('never reports negative earning hours when lead time exceeds the horizon', () => {
    const result = evaluateInvestment({
      cost: 100,
      incrementalProfitPerHour: 5,
      horizonHours: 10,
      leadTimeHours: 50,
    }).result;
    // Earning hours clamp at zero, so the loss is exactly the capital outlay.
    expect(result.netOverHorizon).toBe(-100);
  });

  it('annualises the horizon return', () => {
    // Doubling capital in a year is a 100% annualised return.
    const result = evaluateInvestment({
      cost: 100,
      incrementalProfitPerHour: 200 / (24 * 365),
      horizonHours: 24 * 365,
    }).result;
    expect(result.annualisedReturn).toBeCloseTo(1, 6);
  });

  it('reports no ROI for a zero-cost option instead of dividing by zero', () => {
    expect(evaluateInvestment({ cost: 0, incrementalProfitPerHour: 5 }).result.roiOverHorizon).toBeNull();
  });
});

describe('evaluateLoan', () => {
  it('computes interest and repayment', () => {
    const result = evaluateLoan({ principal: 10_000, interestRate: 0.05, termHours: 24 * 30 }).result;
    expect(result.totalInterest).toBe(500);
    expect(result.totalRepayment).toBe(10_500);
    expect(result.interestCostPerHour).toBeCloseTo(500 / 720, 10);
  });

  it('states the profit per hour needed to justify borrowing', () => {
    const result = evaluateLoan({ principal: 7_200, interestRate: 0.1, termHours: 720 }).result;
    expect(result.requiredProfitPerHour).toBeCloseTo(1, 10);
  });

  it('judges a loan worthwhile only when returns beat the interest', () => {
    const good = evaluateLoan({
      principal: 7_200,
      interestRate: 0.1,
      termHours: 720,
      expectedProfitPerHour: 2,
    }).result;
    const bad = evaluateLoan({
      principal: 7_200,
      interestRate: 0.1,
      termHours: 720,
      expectedProfitPerHour: 0.5,
    }).result;
    expect(good.worthwhile).toBe(true);
    expect(bad.worthwhile).toBe(false);
    expect(bad.netBenefit).toBeLessThan(0);
  });

  it('declines to judge without an expected return', () => {
    const result = evaluateLoan({ principal: 1000, interestRate: 0.05, termHours: 100 });
    expect(result.result.worthwhile).toBeNull();
    expect(result.warnings.some((w) => w.includes('No expected return'))).toBe(true);
  });

  it('always warns that projections are not guarantees', () => {
    const result = evaluateLoan({ principal: 1000, interestRate: 0.05, termHours: 100 });
    expect(result.warnings.some((w) => w.toLowerCase().includes('estimates'))).toBe(true);
  });

  it('handles a zero-length term without dividing by zero', () => {
    expect(evaluateLoan({ principal: 1000, interestRate: 0.05, termHours: 0 }).result.interestCostPerHour).toBe(0);
  });
});

describe('compareAllocations', () => {
  const options = [
    { label: 'Grapes', capitalRequired: 1000, profitPerHour: 12 },
    { label: 'Apples', capitalRequired: 500, profitPerHour: 20 },
    { label: 'Seeds', capitalRequired: 2000, profitPerHour: 5 },
  ];

  it('ranks by profit per hour and names the best option', () => {
    const result = compareAllocations(options).result;
    expect(result?.best.label).toBe('Apples');
    expect(result?.ranked.map((r) => r.label)).toEqual(['Apples', 'Grapes', 'Seeds']);
  });

  it('quantifies what each alternative gives up', () => {
    const ranked = compareAllocations(options).result?.ranked ?? [];
    expect(ranked[0]?.opportunityCostPerHour).toBe(0);
    expect(ranked[1]?.opportunityCostPerHour).toBe(8);
    expect(ranked[2]?.opportunityCostPerHour).toBe(15);
  });

  it('reports return on capital so cheap options are visible', () => {
    const ranked = compareAllocations(options).result?.ranked ?? [];
    expect(ranked[0]?.returnOnCapitalPerHour).toBeCloseTo(20 / 500, 10);
  });

  it('returns null rather than throwing on an empty comparison', () => {
    const result = compareAllocations([]);
    expect(result.result).toBeNull();
    expect(result.warnings).toContain('Nothing to compare.');
  });

  it('does not divide by zero for a no-capital option', () => {
    const ranked = compareAllocations([{ label: 'Free', capitalRequired: 0, profitPerHour: 1 }]).result?.ranked ?? [];
    expect(ranked[0]?.returnOnCapitalPerHour).toBeNull();
  });
});
