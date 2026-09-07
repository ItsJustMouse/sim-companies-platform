import { cache as requestCache } from 'react';
import { cacheKeys, cachePolicy } from '@/lib/cache/keys';
import { swrTolerant } from '@/lib/cache/swr';
import { fetchMarketOffers } from '@/lib/upstream/api';
import { log } from '@/lib/util/logger';
import { safeRead } from '@/lib/db/client';
import type { MarketOffer, MarketQuote, Resource } from '@/lib/game/types';
import { getResources } from '@/lib/catalog/service';
import { buildQuote } from './quote';
import * as repo from './repository';
import { classifyTrend, liquidityScore, priceChange, volatility, type ChangeResult, type PricePoint } from './statistics';

/**
 * The read API the product's pages use for market data.
 *
 * Pages never touch the upstream client or the cache directly: they ask this module
 * for a quote and receive it with its freshness attached, so "how old is this
 * number" is answerable at every level of the UI.
 */

export interface QuoteResult {
  readonly quote: MarketQuote | null;
  readonly offers: readonly MarketOffer[];
  readonly freshness: 'live' | 'stale' | 'stored' | 'unavailable';
  readonly observedAt: string | null;
  readonly ageSeconds: number | null;
}

export async function getQuote(realmId: number, resourceId: number): Promise<QuoteResult> {
  const cached = await swrTolerant(cacheKeys.marketOffers(realmId, resourceId), cachePolicy.market, () =>
    fetchMarketOffers(realmId, resourceId),
  );

  if (cached) {
    const quote = buildQuote(cached.value, { resourceId, realmId, observedAt: cached.storedAt });
    return {
      quote,
      offers: cached.value,
      freshness: cached.degraded || cached.freshness === 'stale' ? 'stale' : 'live',
      observedAt: cached.storedAt,
      ageSeconds: cached.ageSeconds,
    };
  }

  // Upstream unreachable and nothing cached: fall back to our own last observation.
  const snapshot = await safeRead(() => repo.latestSnapshot(realmId, resourceId), null, 'latestSnapshot');
  if (!snapshot) {
    return { quote: null, offers: [], freshness: 'unavailable', observedAt: null, ageSeconds: null };
  }

  return {
    quote: snapshotToQuote(snapshot),
    offers: [],
    freshness: 'stored',
    observedAt: snapshot.observedAt.toISOString(),
    ageSeconds: Math.round((Date.now() - snapshot.observedAt.getTime()) / 1000),
  };
}

export function snapshotToQuote(snapshot: {
  realmId: number;
  resourceId: number;
  observedAt: Date;
  source: string;
  lowestPrice: number | null;
  highestPrice: number | null;
  medianPrice: number | null;
  weightedAveragePrice: number | null;
  totalQuantity: number | null;
  offerCount: number | null;
  pricesByQuality: unknown;
}): MarketQuote {
  const pricesByQuality = (snapshot.pricesByQuality ?? {}) as Record<string, number>;
  const qualities = Object.keys(pricesByQuality)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  return {
    resourceId: snapshot.resourceId,
    realmId: snapshot.realmId,
    source: snapshot.source === 'ticker' ? 'ticker' : 'order-book',
    lowestPrice: snapshot.lowestPrice,
    highestPrice: snapshot.highestPrice,
    medianPrice: snapshot.medianPrice,
    weightedAveragePrice: snapshot.weightedAveragePrice,
    totalQuantity: snapshot.totalQuantity,
    offerCount: snapshot.offerCount,
    pricesByQuality: Object.fromEntries(qualities.map((q) => [q, pricesByQuality[String(q)] as number])),
    qualitiesAvailable: qualities,
    observedAt: snapshot.observedAt.toISOString(),
  };
}

/** One row of the Exchange table. */
export interface MarketRow {
  readonly resource: Resource;
  readonly quote: MarketQuote | null;
  readonly change1h: ChangeResult | null;
  readonly change24h: ChangeResult | null;
  readonly change7d: ChangeResult | null;
  readonly volatility7d: number | null;
  readonly liquidity: number | null;
  readonly trend: ReturnType<typeof classifyTrend>;
  readonly high30d: number | null;
  readonly low30d: number | null;
  readonly observedAt: string | null;
}

export interface MarketOverview {
  readonly rows: readonly MarketRow[];
  readonly observedAt: string | null;
  readonly collectionStartedAt: string | null;
  /** True when prices come from our stored snapshots rather than a live read. */
  readonly degraded: boolean;
  /** Products with no price data at all — surfaced honestly rather than hidden. */
  readonly unpricedCount: number;
}

/**
 * Market-wide view.
 *
 * Built entirely from stored snapshots rather than by fetching every order book on
 * request: a live sweep would be hundreds of upstream calls per page view, which is
 * exactly what the API guidance asks third parties not to do. The background
 * collector keeps the snapshots current; this read is pure database.
 */
export const getMarketOverview = requestCache(async function getMarketOverview(
  realmId: number,
): Promise<MarketOverview> {
  const [{ data: resources }, latest, collectionStartedAt] = await Promise.all([
    getResources(realmId),
    safeRead(() => repo.latestSnapshotPerResource(realmId), new Map(), 'latestSnapshotPerResource'),
    safeRead(() => repo.collectionStart(realmId), null, 'collectionStart'),
  ]);

  const since30d = new Date(Date.now() - 30 * 24 * 3_600_000);
  const histories = await safeRead(
    () => repo.historyForResources(realmId, [...latest.keys()], since30d),
    new Map(),
    'historyForResources',
  );

  let newestObservation: string | null = null;
  let unpricedCount = 0;

  const rows: MarketRow[] = resources.map((resource) => {
    const snapshot = latest.get(resource.id);
    const quote = snapshot ? snapshotToQuote(snapshot) : null;
    const series: PricePoint[] = histories.get(resource.id) ?? [];

    if (!quote || quote.lowestPrice === null) unpricedCount += 1;
    if (snapshot) {
      const at = snapshot.observedAt.toISOString();
      if (!newestObservation || at > newestObservation) newestObservation = at;
    }

    const last7d = series.filter((p) => Date.parse(p.at) >= Date.now() - 7 * 24 * 3_600_000);
    const change24h = priceChange(series, 24);
    const prices = series.map((p) => p.price);

    return {
      resource,
      quote,
      change1h: priceChange(series, 1),
      change24h,
      change7d: priceChange(series, 24 * 7),
      volatility7d: volatility(last7d),
      liquidity:
        quote && quote.totalQuantity !== null && quote.offerCount !== null
          ? liquidityScore(quote.totalQuantity, quote.offerCount)
          : null,
      trend: classifyTrend(change24h),
      high30d: prices.length > 0 ? Math.max(...prices) : null,
      low30d: prices.length > 0 ? Math.min(...prices) : null,
      observedAt: snapshot?.observedAt.toISOString() ?? null,
    };
  });

  return {
    rows,
    observedAt: newestObservation,
    collectionStartedAt,
    degraded: latest.size === 0,
    unpricedCount,
  };
});

export interface HistoryResult {
  readonly points: PricePoint[];
  readonly resolution: string;
  readonly collectionStartedAt: string | null;
  readonly candles: Awaited<ReturnType<typeof repo.readHistory>>['candles'];
}

export async function getHistory(args: {
  realmId: number;
  resourceId: number;
  quality?: number;
  rangeHours: number;
}): Promise<HistoryResult> {
  const from = new Date(Date.now() - args.rangeHours * 3_600_000);
  const series = await safeRead(
    () =>
      repo.readHistory({
        realmId: args.realmId,
        resourceId: args.resourceId,
        quality: args.quality ?? 0,
        from,
      }),
    { points: [], candles: [], resolution: 'raw' as const, collectionStartedAt: null },
    'readHistory',
  );
  return {
    points: series.points,
    resolution: series.resolution,
    collectionStartedAt: series.collectionStartedAt,
    candles: series.candles,
  };
}

/** Persists a sweep. Used by the ingestion worker, never by a request path. */
export async function persistQuotes(quotes: readonly MarketQuote[]): Promise<number> {
  try {
    return await repo.recordSnapshots(quotes);
  } catch (error) {
    log.error('failed to persist market snapshots', { error, count: quotes.length });
    return 0;
  }
}

export { repo as marketRepository };
