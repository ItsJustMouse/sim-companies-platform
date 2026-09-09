import { NextResponse } from 'next/server';
import { z } from 'zod';
import { DEFAULT_REALM_ID, REALMS } from '@/lib/game/constants';
import { getMarketOverview, getHistory } from '@/lib/market/service';
import { scanOpportunities, sortOpportunities } from '@/lib/market/opportunities';
import { toCsv } from '@/lib/util/csv';
import { rateLimitRequest, retryAfterSeconds } from '@/lib/util/rate-limit';

export const dynamic = 'force-dynamic';

const PUBLIC_BETA_OPPORTUNITIES_ENABLED: boolean = false;

/**
 * Data export.
 *
 * Serves the same figures the pages show, in a form a spreadsheet can read. Capped
 * per dataset so a single request cannot ask the database for an unbounded range —
 * an export endpoint is the easiest place to accidentally build a denial-of-service
 * lever against your own database.
 *
 * CSV cells go through `toCsv`, which neutralises formula injection.
 */

const querySchema = z.object({
  dataset: z.enum(['market', 'history', 'opportunities']),
  format: z.enum(['csv', 'json']).default('csv'),
  realmId: z.coerce.number().int().refine((v) => REALMS.some((r) => r.id === v), 'Unknown realm').default(DEFAULT_REALM_ID),
  resourceId: z.coerce.number().int().min(0).max(1_000_000).optional(),
  quality: z.coerce.number().int().min(0).max(20).default(0),
  rangeHours: z.coerce.number().int().min(1).max(24 * 365 * 3).default(24 * 30),
});

export async function GET(request: Request) {
  const requestLimit = await rateLimitRequest(request, {
    scope: 'api-export',
    limit: 20,
    windowSeconds: 300,
  });

  if (!requestLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again shortly.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSeconds(requestLimit.resetAt)),
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', detail: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
      { status: 400 },
    );
  }

  const { dataset, format, realmId, resourceId, quality, rangeHours } = parsed.data;

  if (dataset === 'history') {
    if (resourceId === undefined) {
      return NextResponse.json({ error: 'history export requires resourceId' }, { status: 400 });
    }
    const history = await getHistory({ realmId, resourceId, quality, rangeHours });
    const rows = history.points.map((point) => ({ observed_at: point.at, price: point.price }));
    return respond(rows, format, `simconomist-history-${resourceId}-q${quality}`, ['observed_at', 'price']);
  }

  if (dataset === 'opportunities') {
    if (!PUBLIC_BETA_OPPORTUNITIES_ENABLED) {
      return NextResponse.json(
        { error: 'This dataset is not available in the v0.1 Public Beta.' },
        { status: 404 },
      );
    }

    const scan = await scanOpportunities(realmId);
    const rows = sortOpportunities(scan.opportunities, 'profitPerHour').map((o) => ({
      product: o.resource.name,
      product_id: o.resource.id,
      category: o.resource.category,
      building: o.building?.name ?? null,
      sale_price: o.salePrice,
      cost_per_unit: o.costPerUnit,
      profit_per_unit: o.profitPerUnit,
      profit_per_hour: o.profitPerHour,
      margin: o.margin,
      break_even_price: o.breakEvenSalePrice,
      liquidity: o.liquidity,
      volatility_7d: o.volatility7d,
      change_24h_percent: o.change24h,
      observed_at: o.observedAt,
    }));
    return respond(rows, format, 'simconomist-opportunities');
  }

  const overview = await getMarketOverview(realmId);
  const rows = overview.rows.map((row) => ({
    product: row.resource.name,
    product_id: row.resource.id,
    category: row.resource.category,
    price: row.quote?.lowestPrice ?? null,
    median_price: row.quote?.medianPrice ?? null,
    weighted_average_price: row.quote?.weightedAveragePrice ?? null,
    total_quantity: row.quote?.totalQuantity ?? null,
    offer_count: row.quote?.offerCount ?? null,
    change_1h_percent: row.change1h?.percent ?? null,
    change_24h_percent: row.change24h?.percent ?? null,
    change_7d_percent: row.change7d?.percent ?? null,
    volatility_7d: row.volatility7d,
    liquidity: row.liquidity,
    observed_at: row.observedAt,
  }));

  return respond(rows, format, 'simconomist-market');
}

function respond(
  rows: readonly Record<string, unknown>[],
  format: 'csv' | 'json',
  filename: string,
  columns?: readonly string[],
): NextResponse {
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === 'json') {
    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        source: 'Simconomist — independent Sim Companies companion. Figures are observations, not official data.',
        rowCount: rows.length,
        rows,
      },
      {
        headers: {
          'Content-Disposition': `attachment; filename="${filename}-${stamp}.json"`,
          'Cache-Control': 'private, max-age=60',
        },
      },
    );
  }

  return new NextResponse(toCsv(rows, columns), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}-${stamp}.csv"`,
      'Cache-Control': 'private, max-age=60',
    },
  });
}
