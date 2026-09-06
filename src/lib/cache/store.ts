import type Redis from 'ioredis';
import { env } from '@/lib/env';
import { log } from '@/lib/util/logger';

/**
 * Cache abstraction with two backends.
 *
 * Redis is used when `REDIS_URL` is configured; otherwise an in-process Map takes
 * over. The fallback is deliberate rather than a stub: a single-instance deployment
 * (the expected shape at launch) works correctly without paying for Redis, and the
 * upgrade path is one environment variable. The trade-off — no cross-instance sharing
 * — is documented in docs/DEPLOYMENT.md.
 */

export interface CacheEntry<T> {
  readonly value: T;
  /** When the value was written. Drives freshness/staleness display. */
  readonly storedAt: number;
  /** After this instant the value is stale but still servable. */
  readonly freshUntil: number;
}

export interface CacheStore {
  get<T>(key: string): Promise<CacheEntry<T> | null>;
  set<T>(key: string, entry: CacheEntry<T>, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Best-effort health probe for the admin dashboard. */
  health(): Promise<{ backend: 'redis' | 'memory'; ok: boolean; detail?: string; entries?: number }>;
}

class MemoryStore implements CacheStore {
  private readonly map = new Map<string, { entry: CacheEntry<unknown>; expiresAt: number }>();
  /** Bounds memory use on a long-running process; the cache is an optimisation, not storage. */
  private readonly maxEntries = 5_000;

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const hit = this.map.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
      this.map.delete(key);
      return null;
    }
    return hit.entry as CacheEntry<T>;
  }

  async set<T>(key: string, entry: CacheEntry<T>, ttlSeconds: number): Promise<void> {
    if (this.map.size >= this.maxEntries) {
      // Evict the oldest insertion; Map preserves insertion order.
      const oldest = this.map.keys().next();
      if (!oldest.done) this.map.delete(oldest.value);
    }
    this.map.set(key, { entry, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    this.map.delete(key);
  }

  async health() {
    return { backend: 'memory' as const, ok: true, entries: this.map.size };
  }
}

class RedisStore implements CacheStore {
  constructor(private readonly client: Redis) {}

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    try {
      const raw = await this.client.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as CacheEntry<T>;
    } catch (error) {
      // A cache outage must degrade to "no cache", never to an error page.
      log.warn('cache read failed', { key, error });
      return null;
    }
  }

  async set<T>(key: string, entry: CacheEntry<T>, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(entry), 'EX', Math.max(1, Math.ceil(ttlSeconds)));
    } catch (error) {
      log.warn('cache write failed', { key, error });
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      log.warn('cache delete failed', { key, error });
    }
  }

  async health() {
    try {
      const pong = await this.client.ping();
      return { backend: 'redis' as const, ok: pong === 'PONG' };
    } catch (error) {
      return { backend: 'redis' as const, ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }
}

let store: CacheStore | null = null;

export function cache(): CacheStore {
  if (store) return store;
  const url = env().REDIS_URL;
  if (!url) {
    store = new MemoryStore();
    return store;
  }
  // Imported lazily so the dependency is never loaded in deployments without Redis.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RedisCtor = require('ioredis') as typeof import('ioredis').default;
  const client = new RedisCtor(url, {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    lazyConnect: false,
  });
  client.on('error', (error: Error) => log.warn('redis error', { error }));
  store = new RedisStore(client);
  return store;
}

/** Test seam. */
export function setCacheForTests(next: CacheStore | null): void {
  store = next;
}

export { MemoryStore };
