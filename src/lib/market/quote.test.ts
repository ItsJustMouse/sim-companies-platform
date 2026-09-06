import { describe, expect, it } from 'vitest';
import { buildQuote, fillPrice } from './quote';
import type { MarketOffer } from '@/lib/game/types';

function offer(price: number, quantity: number, quality: number): MarketOffer {
  return { resourceId: 1, price, quantity, quality, sellerName: null };
}

describe('buildQuote', () => {
  const observedAt = '2026-01-01T00:00:00.000Z';

  it('returns nulls rather than zeros for an empty order book', () => {
    const quote = buildQuote([], { resourceId: 1, realmId: 0, observedAt });
    expect(quote.lowestPrice).toBeNull();
    expect(quote.weightedAveragePrice).toBeNull();
    expect(quote.medianPrice).toBeNull();
    expect(quote.highestPrice).toBeNull();
    // Counts are genuinely zero, which is a measurement rather than a gap.
    expect(quote.totalQuantity).toBe(0);
    expect(quote.offerCount).toBe(0);
  });

  it('summarises a simple book', () => {
    const quote = buildQuote([offer(10, 100, 0), offer(12, 50, 0), offer(20, 10, 0)], {
      resourceId: 1,
      realmId: 0,
      observedAt,
    });
    expect(quote.lowestPrice).toBe(10);
    expect(quote.highestPrice).toBe(20);
    expect(quote.offerCount).toBe(3);
    expect(quote.totalQuantity).toBe(160);
    expect(quote.medianPrice).toBe(12);
    // (10*100 + 12*50 + 20*10) / 160
    expect(quote.weightedAveragePrice).toBeCloseTo(1800 / 160, 10);
  });

  it('weights the average by quantity, not by listing count', () => {
    const quote = buildQuote([offer(100, 1, 0), offer(10, 999, 0)], {
      resourceId: 1,
      realmId: 0,
      observedAt,
    });
    // A one-unit outlier must barely move the average.
    expect(quote.weightedAveragePrice).toBeLessThan(11);
  });

  it('averages the two middle values for an even-sized book', () => {
    const quote = buildQuote([offer(10, 1, 0), offer(20, 1, 0), offer(30, 1, 0), offer(40, 1, 0)], {
      resourceId: 1,
      realmId: 0,
      observedAt,
    });
    expect(quote.medianPrice).toBe(25);
  });

  it('prices quality Q as the cheapest offer of quality >= Q', () => {
    // Q2 is cheaper than Q1 here, so a buyer needing Q1 should be quoted the Q2 price.
    const quote = buildQuote([offer(50, 10, 0), offer(90, 10, 1), offer(70, 10, 2)], {
      resourceId: 1,
      realmId: 0,
      observedAt,
    });
    expect(quote.pricesByQuality[0]).toBe(50);
    expect(quote.pricesByQuality[1]).toBe(70);
    expect(quote.pricesByQuality[2]).toBe(70);
    expect(quote.qualitiesAvailable).toEqual([0, 1, 2]);
  });

  it('omits qualities the book cannot satisfy', () => {
    const quote = buildQuote([offer(50, 10, 0)], { resourceId: 1, realmId: 0, observedAt });
    expect(quote.pricesByQuality[1]).toBeUndefined();
  });
});

describe('fillPrice', () => {
  const book = [offer(10, 100, 0), offer(12, 100, 1), offer(30, 100, 3)];

  it('walks the book upwards and blends the price', () => {
    const result = fillPrice(book, { units: 150 });
    expect(result).not.toBeNull();
    // 100 units at 10 + 50 units at 12 = 1600 over 150 units
    expect(result?.totalCost).toBe(1600);
    expect(result?.averageUnitPrice).toBeCloseTo(1600 / 150, 10);
    expect(result?.worstUnitPrice).toBe(12);
  });

  it('quotes only offers meeting the minimum quality', () => {
    const result = fillPrice(book, { units: 50, minQuality: 3 });
    expect(result?.averageUnitPrice).toBe(30);
  });

  it('returns null when the book cannot fill the order', () => {
    expect(fillPrice(book, { units: 10_000 })).toBeNull();
    expect(fillPrice(book, { units: 500, minQuality: 3 })).toBeNull();
  });

  it('rejects non-positive order sizes', () => {
    expect(fillPrice(book, { units: 0 })).toBeNull();
    expect(fillPrice(book, { units: -5 })).toBeNull();
  });
});
