import { cache } from '@/lib/cache/store';

/**
 * Fixed-window rate limiter.
 *
 * Backed by the shared cache, so limits hold across replicas when Redis is
 * configured and degrade to per-instance when it is not. Fixed-window rather than a
 * sliding log because the endpoints being protected — sending login emails, writing
 * alerts — care about "roughly this many per minute", and a sliding window costs
 * more storage and complexity than that precision is worth.
 *
 * Fails **open** on a cache error. A rate limiter that fails closed turns a cache
 * outage into a total outage; these limits guard against nuisance and cost, not
 * against a determined attacker, for whom the real defences are elsewhere.
 */

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAt: number;
}

export async function rateLimit(args: {
  /** Stable identifier for the actor: user id, or a hashed client key. */
  key: string;
  /** Distinguishes limits, e.g. 'login' from 'alert-create'. */
  scope: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const window = Math.floor(Date.now() / (args.windowSeconds * 1000));
  const cacheKey = `lf:v1:ratelimit:${args.scope}:${args.key}:${window}`;
  const resetAt = (window + 1) * args.windowSeconds * 1000;

  try {
    const store = cache();
    const existing = await store.get<number>(cacheKey);
    const used = typeof existing?.value === 'number' ? existing.value : 0;

    if (used >= args.limit) {
      return { allowed: false, remaining: 0, resetAt };
    }

    await store.set(
      cacheKey,
      { value: used + 1, storedAt: Date.now(), freshUntil: resetAt },
      args.windowSeconds + 1,
    );

    return { allowed: true, remaining: args.limit - used - 1, resetAt };
  } catch {
    return { allowed: true, remaining: args.limit, resetAt };
  }
}
