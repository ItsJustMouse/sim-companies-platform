import { z } from 'zod';
import { env } from '@/lib/env';
import { log } from '@/lib/util/logger';
import { UpstreamError } from './errors';

/**
 * The single point through which every Sim Companies API request passes.
 *
 * Nothing else in the codebase may call the game's servers. Centralising it lets us
 * honour the operators' request that third-party tools stay light on their
 * infrastructure (see docs/SIMCOMPANIES_API_RESEARCH.md):
 *
 *   - a process-wide minimum interval between requests (serialised queue)
 *   - in-flight de-duplication, so N concurrent callers asking for the same path
 *     produce exactly one network request
 *   - bounded retries with exponential backoff and jitter, only for retryable failures
 *   - a circuit breaker that stops hammering an upstream that is already failing
 *   - GET only — the API guide states non-GET access is monitored, and a read-only
 *     analytics tool has no business issuing writes
 */

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------

export type CircuitState = 'closed' | 'open' | 'half-open';

interface BreakerConfig {
  readonly failureThreshold: number;
  readonly openMs: number;
}

class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private halfOpenInFlight = false;

  constructor(private readonly config: BreakerConfig) {}

  state(now = Date.now()): CircuitState {
    if (this.failures < this.config.failureThreshold) return 'closed';
    if (now - this.openedAt >= this.config.openMs) return 'half-open';
    return 'open';
  }

  /** Returns false when the request must not be attempted. */
  tryAcquire(now = Date.now()): boolean {
    const state = this.state(now);
    if (state === 'closed') return true;
    if (state === 'open') return false;
    // half-open: let a single probe through
    if (this.halfOpenInFlight) return false;
    this.halfOpenInFlight = true;
    return true;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.halfOpenInFlight = false;
  }

  recordFailure(now = Date.now()): void {
    this.failures += 1;
    this.halfOpenInFlight = false;
    if (this.failures >= this.config.failureThreshold) this.openedAt = now;
  }

  snapshot(now = Date.now()) {
    return {
      state: this.state(now),
      consecutiveFailures: this.failures,
      retryAt: this.state(now) === 'open' ? new Date(this.openedAt + this.config.openMs).toISOString() : null,
    };
  }
}

// ---------------------------------------------------------------------------
// Serialised, paced request queue
// ---------------------------------------------------------------------------

class RequestPacer {
  private tail: Promise<unknown> = Promise.resolve();
  private lastStart = 0;

  /** Runs `fn` such that consecutive runs are at least `minIntervalMs` apart. */
  schedule<T>(fn: () => Promise<T>, minIntervalMs: number): Promise<T> {
    const run = this.tail.then(async () => {
      const wait = this.lastStart + minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastStart = Date.now();
      return fn();
    });
    // Keep the chain alive regardless of individual failures.
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface UpstreamStats {
  requests: number;
  failures: number;
  retries: number;
  coalesced: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastErrorMessage: string | null;
  totalLatencyMs: number;
}

export interface FetchOptions {
  /** Overrides the default timeout for slow endpoints. */
  timeoutMs?: number;
  /** Skips in-flight de-duplication (rarely needed). */
  noCoalesce?: boolean;
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export class SimCompaniesHttpClient {
  private readonly pacer = new RequestPacer();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly breaker = new CircuitBreaker({ failureThreshold: 5, openMs: 60_000 });
  private readonly stats: UpstreamStats = {
    requests: 0,
    failures: 0,
    retries: 0,
    coalesced: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastErrorMessage: null,
    totalLatencyMs: 0,
  };

  /**
   * Fetches `path` and validates it against `schema`.
   *
   * @param path Absolute path beginning with `/`, e.g. `/api/v3/market/0/1/`.
   */
  async get<T>(path: string, schema: z.ZodType<T>, options: FetchOptions = {}): Promise<T> {
    const config = env();
    if (!config.UPSTREAM_ENABLED) {
      throw new UpstreamError({
        kind: 'disabled',
        message: 'Upstream requests are disabled by configuration (UPSTREAM_ENABLED=false).',
        path,
      });
    }

    if (!options.noCoalesce) {
      const existing = this.inFlight.get(path);
      if (existing) {
        this.stats.coalesced += 1;
        return (await existing) as T;
      }
    }

    const promise = this.execute(path, schema, options).finally(() => {
      this.inFlight.delete(path);
    });
    if (!options.noCoalesce) this.inFlight.set(path, promise);
    return promise;
  }

  private async execute<T>(path: string, schema: z.ZodType<T>, options: FetchOptions): Promise<T> {
    const config = env();
    const maxAttempts = config.UPSTREAM_MAX_RETRIES + 1;
    let lastError: UpstreamError | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (!this.breaker.tryAcquire()) {
        throw new UpstreamError({
          kind: 'circuit-open',
          message: 'Upstream circuit breaker is open after repeated failures; serving cached data only.',
          path,
        });
      }

      try {
        const body = await this.pacer.schedule(
          () => this.request(path, options.timeoutMs ?? config.UPSTREAM_TIMEOUT_MS),
          config.UPSTREAM_MIN_INTERVAL_MS,
        );
        this.breaker.recordSuccess();

        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          // A shape change is not retryable — it needs a code change, so fail loudly.
          const detail = parsed.error.issues
            .slice(0, 5)
            .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
            .join('; ');
          throw new UpstreamError({
            kind: 'invalid-response',
            message: `Upstream response did not match the expected shape (${detail}).`,
            path,
          });
        }
        return parsed.data;
      } catch (error) {
        const upstreamError =
          error instanceof UpstreamError
            ? error
            : new UpstreamError({ kind: 'network', message: String(error), path, retryable: true, cause: error });

        if (upstreamError.kind !== 'invalid-response') this.breaker.recordFailure();
        this.stats.failures += 1;
        this.stats.lastFailureAt = new Date().toISOString();
        this.stats.lastErrorMessage = upstreamError.message;
        lastError = upstreamError;

        if (!upstreamError.retryable || attempt === maxAttempts) throw upstreamError;

        this.stats.retries += 1;
        // Exponential backoff with full jitter, capped so a request never hangs for minutes.
        const backoff = Math.min(8_000, 2 ** (attempt - 1) * 500);
        await sleep(Math.random() * backoff);
        log.warn('upstream retry', { path, attempt, kind: upstreamError.kind });
      }
    }

    /* c8 ignore next */
    throw lastError ?? new UpstreamError({ kind: 'network', message: 'Unknown upstream failure', path });
  }

  private async request(path: string, timeoutMs: number): Promise<unknown> {
    const config = env();
    const url = new URL(path, config.SIMCOMPANIES_BASE_URL).toString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    this.stats.requests += 1;

    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': config.SIMCOMPANIES_USER_AGENT,
        },
        // Caching is our responsibility, not the fetch layer's.
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new UpstreamError({
          kind: response.status === 429 ? 'rate-limited' : 'http',
          message: `Upstream returned HTTP ${response.status} for ${path}.`,
          path,
          status: response.status,
          retryable: RETRYABLE_STATUS.has(response.status),
        });
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('json')) {
        // Typically an HTML error/challenge page — retrying immediately will not help.
        throw new UpstreamError({
          kind: 'invalid-response',
          message: `Expected JSON from ${path} but received "${contentType}".`,
          path,
          status: response.status,
        });
      }

      const body: unknown = await response.json();
      const latency = Date.now() - startedAt;
      this.stats.totalLatencyMs += latency;
      this.stats.lastSuccessAt = new Date().toISOString();
      log.debug('upstream ok', { path, latencyMs: latency });
      return body;
    } catch (error) {
      if (error instanceof UpstreamError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new UpstreamError({
          kind: 'timeout',
          message: `Upstream request to ${path} timed out after ${timeoutMs}ms.`,
          path,
          retryable: true,
        });
      }
      throw new UpstreamError({
        kind: 'network',
        message: `Network failure calling ${path}: ${error instanceof Error ? error.message : String(error)}`,
        path,
        retryable: true,
        cause: error,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  health() {
    const { requests, failures, retries, coalesced, lastSuccessAt, lastFailureAt, lastErrorMessage, totalLatencyMs } =
      this.stats;
    const successes = Math.max(0, requests - failures);
    return {
      enabled: env().UPSTREAM_ENABLED,
      baseUrl: env().SIMCOMPANIES_BASE_URL,
      circuit: this.breaker.snapshot(),
      requests,
      failures,
      retries,
      coalesced,
      averageLatencyMs: successes > 0 ? Math.round(totalLatencyMs / successes) : null,
      lastSuccessAt,
      lastFailureAt,
      lastErrorMessage,
    };
  }
}

/** Process-wide singleton — the pacer and breaker are only meaningful when shared. */
let singleton: SimCompaniesHttpClient | null = null;

export function httpClient(): SimCompaniesHttpClient {
  singleton ??= new SimCompaniesHttpClient();
  return singleton;
}

export const __testing = { CircuitBreaker, RequestPacer, sleep };
