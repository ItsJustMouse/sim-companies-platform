import { describe, expect, it } from 'vitest';
import { classifyTrend, liquidityScore, movingAverage, priceChange, summarise, volatility } from './statistics';
import type { PricePoint } from './statistics';

const HOUR = 3_600_000;
const base = Date.parse('2026-03-01T00:00:00.000Z');

function series(...entries: [hoursBeforeEnd: number, price: number][]): PricePoint[] {
  return entries.map(([hours, price]) => ({ at: new Date(base - hours * HOUR).toISOString(), price }));
}

describe('priceChange', () => {
  it('computes change against the closest point to the requested age', () => {
    const change = priceChange(series([24, 100], [0, 110]), 24);
    expect(change?.from).toBe(100);
    expect(change?.to).toBe(110);
    expect(change?.absolute).toBe(10);
    expect(change?.percent).toBeCloseTo(10, 10);
  });

  it('reports declines as negative', () => {
    expect(priceChange(series([24, 200], [0, 150]), 24)?.percent).toBeCloseTo(-25, 10);
  });

  it('refuses to answer when no observation is near the requested window', () => {
    // Nothing within 12–36 hours of the latest point.
    expect(priceChange(series([200, 100], [0, 110]), 24)).toBeNull();
  });

  it('accepts a point inside the tolerance band', () => {
    expect(priceChange(series([20, 100], [0, 110]), 24)).not.toBeNull();
  });

  it('needs at least two points', () => {
    expect(priceChange(series([0, 100]), 24)).toBeNull();
    expect(priceChange([], 24)).toBeNull();
  });

  it('does not divide by a zero reference price', () => {
    expect(priceChange(series([24, 0], [0, 110]), 24)).toBeNull();
  });

  it('rejects a non-positive window', () => {
    expect(priceChange(series([24, 100], [0, 110]), 0)).toBeNull();
  });

  it('sorts unordered input before comparing', () => {
    const unordered = [...series([0, 110], [24, 100])];
    expect(priceChange(unordered, 24)?.from).toBe(100);
  });
});

describe('volatility', () => {
  it('is zero for a perfectly flat series', () => {
    expect(volatility(series([3, 10], [2, 10], [1, 10], [0, 10]))).toBeCloseTo(0, 10);
  });

  it('is larger for a more erratic series', () => {
    const calm = volatility(series([3, 100], [2, 101], [1, 100], [0, 101])) ?? 0;
    const wild = volatility(series([3, 100], [2, 160], [1, 90], [0, 150])) ?? 0;
    expect(wild).toBeGreaterThan(calm);
  });

  it('compares products of different price levels on the same scale', () => {
    // Both series move by the same proportion, so volatility should match.
    const cheap = volatility(series([3, 1], [2, 1.1], [1, 1], [0, 1.1]));
    const dear = volatility(series([3, 1000], [2, 1100], [1, 1000], [0, 1100]));
    expect(cheap).toBeCloseTo(dear ?? 0, 8);
  });

  it('needs enough points to estimate', () => {
    expect(volatility(series([1, 10], [0, 11]))).toBeNull();
    expect(volatility([])).toBeNull();
  });

  it('skips non-positive prices rather than producing infinities', () => {
    const result = volatility(series([3, 0], [2, 10], [1, 11], [0, 12]));
    expect(result === null || Number.isFinite(result)).toBe(true);
  });
});

describe('summarise', () => {
  it('reports high, low, average and latest', () => {
    const summary = summarise(series([3, 10], [2, 30], [1, 20], [0, 25]));
    expect(summary.high).toBe(30);
    expect(summary.low).toBe(10);
    expect(summary.latest).toBe(25);
    expect(summary.average).toBeCloseTo(21.25, 10);
    expect(summary.sampleCount).toBe(4);
  });

  it('places the latest price within its range', () => {
    // 25 sits three quarters of the way between 10 and 30.
    expect(summarise(series([3, 10], [2, 30], [1, 20], [0, 25])).positionInRange).toBeCloseTo(0.75, 10);
  });

  it('has no range position when every price is identical', () => {
    expect(summarise(series([1, 10], [0, 10])).positionInRange).toBeNull();
  });

  it('returns nulls for an empty series', () => {
    const summary = summarise([]);
    expect(summary.latest).toBeNull();
    expect(summary.high).toBeNull();
    expect(summary.sampleCount).toBe(0);
  });
});

describe('movingAverage', () => {
  it('leaves leading positions null instead of back-filling', () => {
    const result = movingAverage(series([3, 10], [2, 20], [1, 30], [0, 40]), 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBeCloseTo(20, 10);
    expect(result[3]).toBeCloseTo(30, 10);
  });

  it('handles a window of one as the identity', () => {
    expect(movingAverage(series([1, 5], [0, 7]), 1)).toEqual([5, 7]);
  });

  it('returns all nulls for a nonsensical window', () => {
    expect(movingAverage(series([1, 5], [0, 7]), 0)).toEqual([null, null]);
  });
});

describe('classifyTrend', () => {
  const change = (percent: number) => ({
    from: 100,
    to: 100 + percent,
    absolute: percent,
    percent,
    fromAt: '',
    toAt: '',
  });

  it('ignores movement inside the dead band', () => {
    expect(classifyTrend(change(1))).toBe('flat');
    expect(classifyTrend(change(-1))).toBe('flat');
  });

  it('classifies clear moves', () => {
    expect(classifyTrend(change(9))).toBe('rising');
    expect(classifyTrend(change(-9))).toBe('falling');
  });

  it('is unknown without a change measurement', () => {
    expect(classifyTrend(null)).toBe('unknown');
  });
});

describe('liquidityScore', () => {
  it('rates a deep, broad book above a thin one', () => {
    const deep = liquidityScore(500_000, 80) ?? 0;
    const thin = liquidityScore(50, 2) ?? 0;
    expect(deep).toBeGreaterThan(thin);
  });

  it('rates spread-out volume above the same volume from one seller', () => {
    const concentrated = liquidityScore(10_000, 1) ?? 0;
    const distributed = liquidityScore(10_000, 40) ?? 0;
    expect(distributed).toBeGreaterThan(concentrated);
  });

  it('stays within 0–100', () => {
    const extreme = liquidityScore(1e12, 1e6) ?? 0;
    expect(extreme).toBeLessThanOrEqual(100);
    expect(extreme).toBeGreaterThanOrEqual(0);
  });

  it('has no score for an empty book', () => {
    expect(liquidityScore(0, 0)).toBeNull();
    expect(liquidityScore(100, 0)).toBeNull();
  });
});
