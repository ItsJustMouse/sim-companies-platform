/**
 * Descriptive statistics over a price series.
 *
 * Every function here refuses to answer when the data cannot support an answer.
 * A "24h change" computed from two points three days apart is worse than no number
 * at all, because it looks authoritative — so the window tolerance is explicit and
 * a series that does not cover it returns null.
 */

export interface PricePoint {
  readonly at: string;
  readonly price: number;
}

export interface ChangeResult {
  readonly from: number;
  readonly to: number;
  readonly absolute: number;
  readonly percent: number;
  /** Timestamp of the earlier observation actually used. */
  readonly fromAt: string;
  readonly toAt: string;
}

/**
 * Change between the latest point and the closest point to `hoursAgo`.
 *
 * @param toleranceRatio How far the reference point may drift from the requested
 *   age, as a fraction of the window. 0.5 on a 24h window accepts a point aged
 *   12–36 hours; anything further away is not a 24-hour change.
 */
export function priceChange(
  series: readonly PricePoint[],
  hoursAgo: number,
  toleranceRatio = 0.5,
): ChangeResult | null {
  if (series.length < 2 || hoursAgo <= 0) return null;

  const sorted = [...series].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const latest = sorted[sorted.length - 1];
  if (!latest) return null;

  const latestMs = Date.parse(latest.at);
  const targetMs = latestMs - hoursAgo * 3_600_000;
  const toleranceMs = hoursAgo * 3_600_000 * toleranceRatio;

  let best: PricePoint | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const point of sorted) {
    if (point === latest) continue;
    const distance = Math.abs(Date.parse(point.at) - targetMs);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = point;
    }
  }

  if (!best || bestDistance > toleranceMs) return null;
  if (best.price === 0) return null;

  const absolute = latest.price - best.price;
  return {
    from: best.price,
    to: latest.price,
    absolute,
    percent: (absolute / best.price) * 100,
    fromAt: best.at,
    toAt: latest.at,
  };
}

/**
 * Volatility as the standard deviation of period-over-period returns, expressed as
 * a percentage. Return-based rather than price-based so a $500 product and a $0.50
 * product are directly comparable.
 */
export function volatility(series: readonly PricePoint[]): number | null {
  if (series.length < 3) return null;
  const sorted = [...series].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  const returns: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    if (!previous || !current || previous.price <= 0) continue;
    returns.push((current.price - previous.price) / previous.price);
  }
  if (returns.length < 2) return null;

  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  // Sample variance (n-1): we are estimating from a sample of the market's behaviour,
  // not describing a complete population.
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * 100;
}

export interface SeriesSummary {
  readonly latest: number | null;
  readonly latestAt: string | null;
  readonly high: number | null;
  readonly low: number | null;
  readonly average: number | null;
  readonly sampleCount: number;
  /** Where the latest price sits between the low and high, 0–1. */
  readonly positionInRange: number | null;
}

export function summarise(series: readonly PricePoint[]): SeriesSummary {
  if (series.length === 0) {
    return { latest: null, latestAt: null, high: null, low: null, average: null, sampleCount: 0, positionInRange: null };
  }

  const sorted = [...series].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const latest = sorted[sorted.length - 1];
  const prices = sorted.map((p) => p.price);
  const high = Math.max(...prices);
  const low = Math.min(...prices);
  const average = prices.reduce((sum, p) => sum + p, 0) / prices.length;

  return {
    latest: latest?.price ?? null,
    latestAt: latest?.at ?? null,
    high,
    low,
    average,
    sampleCount: prices.length,
    // A flat series has no range to be positioned within; report null, not 0 or 0.5.
    positionInRange: high > low && latest ? (latest.price - low) / (high - low) : null,
  };
}

/**
 * Simple moving average, aligned to the end of the series.
 *
 * Returns null for positions with insufficient history rather than back-filling,
 * so a chart never draws an average over data that does not exist.
 */
export function movingAverage(series: readonly PricePoint[], window: number): (number | null)[] {
  if (window < 1) return series.map(() => null);
  const out: (number | null)[] = [];
  let sum = 0;

  for (let i = 0; i < series.length; i += 1) {
    sum += series[i]?.price ?? 0;
    if (i >= window) sum -= series[i - window]?.price ?? 0;
    out.push(i >= window - 1 ? sum / window : null);
  }
  return out;
}

/**
 * Trend classification for at-a-glance reading.
 *
 * The 2% dead band stops noise being reported as direction: a product drifting a
 * fraction of a percent is flat, not "rising".
 */
export type Trend = 'rising' | 'falling' | 'flat' | 'unknown';

export function classifyTrend(change: ChangeResult | null, deadBandPercent = 2): Trend {
  if (!change) return 'unknown';
  if (change.percent > deadBandPercent) return 'rising';
  if (change.percent < -deadBandPercent) return 'falling';
  return 'flat';
}

/**
 * Liquidity score, 0–100.
 *
 * Combines depth (how many units are on offer) with breadth (how many independent
 * listings). A single enormous listing is less liquid than the same volume spread
 * across twenty sellers, because one seller withdrawing empties the book.
 * Logarithmic because the difference between 10 and 100 units matters far more than
 * between 10,000 and 10,090.
 */
export function liquidityScore(totalQuantity: number, offerCount: number): number | null {
  if (totalQuantity <= 0 || offerCount <= 0) return null;
  const depth = Math.log10(totalQuantity + 1) / 6; // saturates around 1,000,000 units
  const breadth = Math.log10(offerCount + 1) / 2; // saturates around 100 listings
  return Math.round(Math.min(100, (depth * 0.6 + breadth * 0.4) * 100));
}
