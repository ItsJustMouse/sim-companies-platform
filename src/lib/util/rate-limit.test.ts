import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStore, setCacheForTests } from '@/lib/cache/store';
import {
  clientKeyFromHeaders,
  rateLimit,
  retryAfterSeconds,
} from '@/lib/util/rate-limit';

describe('rateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-09T00:00:00.000Z'));
    setCacheForTests(new MemoryStore());
  });

  afterEach(() => {
    setCacheForTests(null);
    vi.useRealTimers();
  });

  it('allows requests through the configured limit and rejects the next one', async () => {
    const args = {
      key: 'client-a',
      scope: 'test',
      limit: 2,
      windowSeconds: 60,
    };

    expect((await rateLimit(args)).allowed).toBe(true);
    expect((await rateLimit(args)).allowed).toBe(true);

    const blocked = await rateLimit(args);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('allows requests again in the next fixed window', async () => {
    const args = {
      key: 'client-a',
      scope: 'test',
      limit: 1,
      windowSeconds: 60,
    };

    expect((await rateLimit(args)).allowed).toBe(true);
    expect((await rateLimit(args)).allowed).toBe(false);

    vi.advanceTimersByTime(60_000);

    expect((await rateLimit(args)).allowed).toBe(true);
  });

  it('hashes forwarded client addresses without exposing the raw address', () => {
    const headers = new Headers({
      'x-forwarded-for': '203.0.113.25, 10.0.0.1',
    });

    const key = clientKeyFromHeaders(headers);

    expect(key).toHaveLength(32);
    expect(key).not.toContain('203.0.113.25');
    expect(key).toBe(clientKeyFromHeaders(headers));
  });

  it('uses x-real-ip when x-forwarded-for is absent', () => {
    const first = clientKeyFromHeaders(new Headers({ 'x-real-ip': '203.0.113.25' }));
    const second = clientKeyFromHeaders(new Headers({ 'x-real-ip': '203.0.113.26' }));

    expect(first).not.toBe(second);
  });

  it('produces a positive Retry-After value', () => {
    expect(retryAfterSeconds(Date.now() + 5_000)).toBe(5);
    expect(retryAfterSeconds(Date.now() - 1_000)).toBe(1);
  });
});
