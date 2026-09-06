import { cache, type CacheEntry } from './store';
import { log } from '@/lib/util/logger';

/**
 * Stale-while-revalidate read-through cache.
 *
 * This is the mechanism that keeps Ledgerforge from generating one upstream request
 * per visitor. Ten thousand people asking for grape prices in the same minute produce
 * at most one call to the game's servers:
 *
 *   fresh      → served from cache, no upstream call
 *   stale      → served from cache immediately, one background refresh kicked off
 *   missing    → one caller fetches, everyone else waits on that same promise
 *   upstream down → last known value is served, flagged `stale`, never silently
 *
 * The `stale` flag is propagated all the way to the UI. A number whose age we cannot
 * vouch for is always labelled as such.
 */

export type Freshness = 'fresh' | 'stale' | 'missing';

export interface SwrResult<T> {
  readonly value: T;
  readonly freshness: Freshness;
  readonly storedAt: string;
  readonly ageSeconds: number;
  /** Set when the value is being served despite an upstream failure. */
  readonly degraded: boolean;
}

interface SwrOptions {
  /** Seconds the value is considered current. */
  freshSeconds: number;
  /** Seconds the value may still be served after going stale. */
  staleSeconds: number;
}

/** De-duplicates concurrent misses for the same key within this process. */
const inFlight = new Map<string, Promise<unknown>>();
/** Guards against stacking background refreshes for the same key. */
const revalidating = new Set<string>();

export async function swr<T>(key: string, options: SwrOptions, loader: () => Promise<T>): Promise<SwrResult<T>> {
  const store = cache();
  const now = Date.now();
  const cached = await store.get<T>(key);

  if (cached) {
    const isFresh = now < cached.freshUntil;
    if (isFresh) return present(cached, 'fresh', false);

    // Stale but usable: return immediately and refresh out of band.
    void revalidate(key, options, loader);
    return present(cached, 'stale', false);
  }

  // Cold miss: one loader runs, all concurrent callers share its result.
  const existing = inFlight.get(key);
  if (existing) {
    const value = (await existing) as T;
    return {
      value,
      freshness: 'fresh',
      storedAt: new Date().toISOString(),
      ageSeconds: 0,
      degraded: false,
    };
  }

  const promise = loader()
    .then(async (value) => {
      await write(key, value, options);
      return value;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, promise);

  const value = (await promise) as T;
  return { value, freshness: 'fresh', storedAt: new Date().toISOString(), ageSeconds: 0, degraded: false };
}

/**
 * Like `swr`, but never throws when a cached value exists.
 *
 * Used on read paths where showing a slightly old number beats showing an error —
 * which is most of the public site. The result is flagged `degraded` so the UI can
 * say plainly that the upstream is unreachable.
 */
export async function swrTolerant<T>(
  key: string,
  options: SwrOptions,
  loader: () => Promise<T>,
): Promise<SwrResult<T> | null> {
  try {
    return await swr(key, options, loader);
  } catch (error) {
    const cached = await cache().get<T>(key);
    if (cached) {
      log.warn('serving stale cache after upstream failure', { key, error });
      return present(cached, 'stale', true);
    }
    log.error('cache miss and upstream failure', { key, error });
    return null;
  }
}

async function revalidate<T>(key: string, options: SwrOptions, loader: () => Promise<T>): Promise<void> {
  if (revalidating.has(key)) return;
  revalidating.add(key);
  try {
    const value = await loader();
    await write(key, value, options);
  } catch (error) {
    // Background refresh failures are expected during an upstream outage. The stale
    // value keeps being served; there is nothing to escalate to the caller.
    log.warn('background revalidation failed', { key, error });
  } finally {
    revalidating.delete(key);
  }
}

async function write<T>(key: string, value: T, options: SwrOptions): Promise<void> {
  const now = Date.now();
  const entry: CacheEntry<T> = {
    value,
    storedAt: now,
    freshUntil: now + options.freshSeconds * 1000,
  };
  await cache().set(key, entry, options.freshSeconds + options.staleSeconds);
}

function present<T>(entry: CacheEntry<T>, freshness: Freshness, degraded: boolean): SwrResult<T> {
  return {
    value: entry.value,
    freshness,
    storedAt: new Date(entry.storedAt).toISOString(),
    ageSeconds: Math.max(0, Math.round((Date.now() - entry.storedAt) / 1000)),
    degraded,
  };
}

/** Test seam: clears in-process coordination state. */
export function resetSwrForTests(): void {
  inFlight.clear();
  revalidating.clear();
}
