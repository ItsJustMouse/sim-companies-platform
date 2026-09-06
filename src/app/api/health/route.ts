import { NextResponse } from 'next/server';
import { databaseHealth } from '@/lib/db/client';
import { cache } from '@/lib/cache/store';
import { upstreamHealth } from '@/lib/upstream/api';

export const dynamic = 'force-dynamic';

/**
 * Health endpoint for load balancers, uptime monitors and the container healthcheck.
 *
 * Returns 200 while the application can still serve users and 503 only when it cannot.
 * The database is the one hard dependency: without it every page falls back to an
 * empty state, which is a degraded site rather than a working one. A failing cache or
 * an unreachable game API are reported but do not fail the check, because the site
 * genuinely still works — that is what all the fallbacks are for, and flapping a
 * healthcheck on a recoverable dependency causes an outage instead of preventing one.
 *
 * Deliberately terse: no error messages, no versions, no configuration. Detail lives
 * behind /admin.
 */
export async function GET() {
  const [database, cacheHealth] = await Promise.all([
    databaseHealth(),
    cache()
      .health()
      .catch(() => ({ backend: 'unknown', ok: false })),
  ]);

  const upstream = upstreamHealth();
  const healthy = database.ok;

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      checks: {
        database: database.ok ? 'ok' : 'failing',
        cache: cacheHealth.ok ? 'ok' : 'degraded',
        upstream: !upstream.enabled ? 'disabled' : upstream.circuit.state === 'closed' ? 'ok' : 'degraded',
      },
      timestamp: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
