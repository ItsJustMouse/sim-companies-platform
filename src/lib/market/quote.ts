import type { MarketOffer, MarketQuote } from '@/lib/game/types';

/**
 * Collapses a raw order book into the summary the product actually displays.
 *
 * Two decisions here are load-bearing and are surfaced in the UI's methodology notes:
 *
 * 1. "Price at quality Q" is the cheapest offer of quality **>= Q**, not exactly Q.
 *    A buyer who needs at least Q is satisfied by anything better, so the effective
 *    price they pay is the cheapest acceptable offer. Pricing exact-match only would
 *    overstate the cost of high quality whenever a cheap better-quality lot exists.
 *
 * 2. Averages are quantity-weighted. A single unit listed at an absurd price should
 *    not move the average as much as a 10,000-unit lot at the going rate.
 */
export function buildQuote(
  offers: readonly MarketOffer[],
  args: { resourceId: number; realmId: number; observedAt?: string },
): MarketQuote {
  const observedAt = args.observedAt ?? new Date().toISOString();

  if (offers.length === 0) {
    return {
      resourceId: args.resourceId,
      realmId: args.realmId,
      lowestPrice: null,
      pricesByQuality: {},
      totalQuantity: 0,
      offerCount: 0,
      weightedAveragePrice: null,
      medianPrice: null,
      highestPrice: null,
      qualitiesAvailable: [],
      observedAt,
    };
  }

  const sortedByPrice = [...offers].sort((a, b) => a.price - b.price);
  const prices = sortedByPrice.map((o) => o.price);

  let totalQuantity = 0;
  let weightedSum = 0;
  for (const offer of offers) {
    totalQuantity += offer.quantity;
    weightedSum += offer.price * offer.quantity;
  }

  const qualities = [...new Set(offers.map((o) => o.quality))].sort((a, b) => a - b);

  // For each quality present, the cheapest offer that satisfies "at least this quality".
  const pricesByQuality: Record<number, number> = {};
  const maxQuality = qualities[qualities.length - 1] ?? 0;
  for (let quality = qualities[0] ?? 0; quality <= maxQuality; quality += 1) {
    const eligible = sortedByPrice.find((o) => o.quality >= quality);
    if (eligible) pricesByQuality[quality] = eligible.price;
  }

  return {
    resourceId: args.resourceId,
    realmId: args.realmId,
    lowestPrice: prices[0] ?? null,
    pricesByQuality,
    totalQuantity,
    offerCount: offers.length,
    weightedAveragePrice: totalQuantity > 0 ? weightedSum / totalQuantity : null,
    medianPrice: median(prices),
    highestPrice: prices[prices.length - 1] ?? null,
    qualitiesAvailable: qualities,
    observedAt,
  };
}

function median(sorted: readonly number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const a = sorted[mid - 1];
  const b = sorted[mid];
  return a !== undefined && b !== undefined ? (a + b) / 2 : null;
}

/**
 * Depth-aware fill price: what you would actually pay per unit to buy `units` now,
 * walking the book from the cheapest acceptable offer upwards.
 *
 * Returns `null` when the book cannot fill the order — a partial fill quoted as a
 * full one would understate cost exactly when it matters most.
 */
export function fillPrice(
  offers: readonly MarketOffer[],
  args: { units: number; minQuality?: number },
): { averageUnitPrice: number; totalCost: number; worstUnitPrice: number } | null {
  if (args.units <= 0) return null;
  const minQuality = args.minQuality ?? 0;
  const eligible = offers.filter((o) => o.quality >= minQuality).sort((a, b) => a.price - b.price);

  let remaining = args.units;
  let totalCost = 0;
  let worstUnitPrice = 0;

  for (const offer of eligible) {
    const take = Math.min(remaining, offer.quantity);
    totalCost += take * offer.price;
    worstUnitPrice = offer.price;
    remaining -= take;
    if (remaining <= 0) break;
  }

  if (remaining > 0) return null;
  return { averageUnitPrice: totalCost / args.units, totalCost, worstUnitPrice };
}
