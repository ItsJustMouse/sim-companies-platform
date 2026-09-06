import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getHistory } from '@/lib/market/service';
import { REALMS } from '@/lib/game/constants';

export const dynamic = 'force-dynamic';

/**
 * Price history for one product over one range.
 *
 * Backs the chart's range buttons. Each range is fetched at the resolution that
 * range needs, so a one-day view gets raw observations and a one-year view gets
 * daily candles — instead of shipping a year of hourly points to draw a day.
 */

const RANGE_HOURS: Record<string, number> = {
  '1D': 24,
  '1W': 24 * 7,
  '1M': 24 * 30,
  '3M': 24 * 90,
  '1Y': 24 * 365,
  MAX: 24 * 365 * 5,
};

const querySchema = z.object({
  resourceId: z.coerce.number().int().min(0).max(100_000),
  realmId: z.coerce.number().int().refine((v) => REALMS.some((r) => r.id === v), 'Unknown realm'),
  quality: z.coerce.number().int().min(0).max(20).default(0),
  range: z.enum(['1D', '1W', '1M', '3M', '1Y', 'MAX']).default('1M'),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    resourceId: url.searchParams.get('resourceId'),
    realmId: url.searchParams.get('realmId') ?? 0,
    quality: url.searchParams.get('quality') ?? 0,
    range: url.searchParams.get('range') ?? '1M',
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', detail: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  const { resourceId, realmId, quality, range } = parsed.data;
  const history = await getHistory({
    realmId,
    resourceId,
    quality,
    rangeHours: RANGE_HOURS[range] as number,
  });

  return NextResponse.json(
    {
      points: history.points,
      resolution: history.resolution,
      collectionStartedAt: history.collectionStartedAt,
    },
    {
      headers: {
        // Matches the snapshot cadence: a chart a couple of minutes old is fine,
        // and this keeps range-flipping off the database entirely.
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=240',
      },
    },
  );
}
