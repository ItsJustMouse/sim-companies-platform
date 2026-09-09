import { createHash } from 'node:crypto';
import { cache } from '@/lib/cache/store';

/**
 * Fixed-window rate limiter.
 *
 * Backed by the shared cache, so limits hold across replicas when Redis is
 * configured and degrade to per-instance when it is not. Fixed-window rather than a
 * sliding log because the endpoints being protected care about "roughly this many
 * requests per window", and a sliding window costs more storage and complexity than
 * that precision is worth.
 *
 * Fails open on a cache error. These limits protect against nuisance and accidental
 * cost amplification; availability should not depend on the cache being healthy.
 */

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAt: number;
}

interface HeaderReader {
  get(name: string): string | null;
}

/**
 * Produces a stable, non-reversible key for per-client limits without retaining the
 * source address in cache keys or logs.
 *
 * Caddy supplies the forwarding headers in production. The first X-Forwarded-For
 * value is the original client in that deployment.
 */
export function clientKeyFromHeaders(headerList: HeaderReader): string {
  const forwarded = headerList.get('x-forwarded-for')?.split(',')[0]?.trim();
  const raw = forwarded ?? headerList.get('x-real-ip') ?? 'unknown';
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

export async function rateLimit(args: {
  /** Stable identifier for the actor: user id, or a hashed client key. */
  key: string;
  /** Distinguishes limits, e.g. 'signin' from 'api-export'. */
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

    return {
      allowed: true,
      remaining: args.limit - used - 1,
      resetAt,
    };
  } catch {
    return {
      allowed: true,
      remaining: args.limit,
      resetAt,
    };
  }
}

export async function rateLimitRequest(
  request: Request,
  args: {
    scope: string;
    limit: number;
    windowSeconds: number;
  },
): Promise<RateLimitResult> {
  return rateLimit({
    ...args,
    key: clientKeyFromHeaders(request.headers),
  });
}

export function retryAfterSeconds(resetAt: number): number {
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
}
