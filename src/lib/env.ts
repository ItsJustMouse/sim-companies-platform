import { z } from 'zod';

/**
 * Environment configuration.
 *
 * Parsed once, lazily, on the server. Client code must never import this module —
 * only values explicitly re-exported through `publicConfig` are safe for the browser.
 *
 * Production requires the full set; development falls back to local defaults so the
 * app can be started with `docker compose up` and nothing else.
 */

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** Canonical public origin, used for absolute URLs, sitemaps and cookies. */
  APP_URL: z.url().default('http://localhost:3000'),

  // ---- Datastores -------------------------------------------------------
  DATABASE_URL: z.string().min(1).default('postgres://postgres:postgres@localhost:5432/ledgerforge'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  /** Optional. When absent the app uses an in-process cache (single instance only). */
  REDIS_URL: z.string().min(1).optional(),

  // ---- Upstream (Sim Companies) ----------------------------------------
  SIMCOMPANIES_BASE_URL: z.url().default('https://www.simcompanies.com'),
  /**
   * Contact string sent in User-Agent so the game operators can identify and reach us.
   * See docs/SIMCOMPANIES_API_RESEARCH.md — being identifiable is part of using the
   * undocumented API responsibly.
   */
  SIMCOMPANIES_USER_AGENT: z
    .string()
    .min(1)
    .default('Ledgerforge/0.1 (+https://ledgerforge.app; independent Sim Companies companion)'),
  /** Minimum milliseconds between two upstream requests, process-wide. */
  UPSTREAM_MIN_INTERVAL_MS: z.coerce.number().int().min(0).default(1_100),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(15_000),
  UPSTREAM_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  /**
   * Hard off-switch. When false the upstream client refuses to make network calls and
   * every read is served from cache/database. Used in CI, tests and offline sandboxes.
   */
  UPSTREAM_ENABLED: bool.default(true),

  // ---- Ingestion --------------------------------------------------------
  /** Whether this process should run the background scheduler. */
  WORKER_ENABLED: bool.default(false),
  /** Minutes between full exchange sweeps. Upstream guidance is conservative. */
  MARKET_SNAPSHOT_INTERVAL_MINUTES: z.coerce.number().int().min(5).default(15),
  CATALOG_SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(30).default(720),

  // ---- Platform auth ----------------------------------------------------
  /**
   * 32+ byte secret used to derive signing/encryption keys. Required in production.
   * Generate with: openssl rand -base64 48
   */
  AUTH_SECRET: z.string().min(32).optional(),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),

  // ---- Email (magic links, alerts) --------------------------------------
  SMTP_URL: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).default('Ledgerforge <no-reply@ledgerforge.app>'),

  // ---- Admin ------------------------------------------------------------
  /** Comma-separated list of email addresses granted admin access. */
  ADMIN_EMAILS: z.string().default(''),

  // ---- Observability ----------------------------------------------------
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

function parse(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const value = parsed.data;

  // Production must not silently run on development defaults.
  if (value.NODE_ENV === 'production') {
    const missing: string[] = [];
    if (!value.AUTH_SECRET) missing.push('AUTH_SECRET');
    if (value.DATABASE_URL.includes('postgres:postgres@localhost')) missing.push('DATABASE_URL');
    if (missing.length > 0) {
      throw new Error(
        `Missing required production environment variables: ${missing.join(', ')}. See .env.example.`,
      );
    }
  }
  return value;
}

export function env(): Env {
  cached ??= parse();
  return cached;
}

/** Test seam: clears the memoised environment. */
export function resetEnvForTests(): void {
  cached = null;
}

export function adminEmails(): ReadonlySet<string> {
  return new Set(
    env()
      .ADMIN_EMAILS.split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isProduction(): boolean {
  return env().NODE_ENV === 'production';
}
