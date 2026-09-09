import { NextResponse } from 'next/server';
import { z } from 'zod';
import { search } from '@/lib/search';
import { rateLimitRequest, retryAfterSeconds } from '@/lib/util/rate-limit';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  q: z.string().min(1).max(80),
  limit: z.coerce.number().int().min(1).max(25).optional(),
});

/**
 * Search endpoint backing the header combobox.
 *
 * Input is validated and length-capped: an unbounded query string would be a cheap
 * way to make the server do arbitrary edit-distance work.
 */
export async function GET(request: Request) {
  const requestLimit = await rateLimitRequest(request, {
    scope: 'api-search',
    limit: 120,
    windowSeconds: 60,
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
  const parsed = querySchema.safeParse({
    q: url.searchParams.get('q') ?? '',
    limit: url.searchParams.get('limit') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ hits: [] }, { status: 400 });
  }

  const hits = await search(parsed.data.q, parsed.data.limit ?? 12);
  return NextResponse.json(
    { hits },
    {
      headers: {
        // Search results depend only on the catalog, which changes rarely.
        'Cache-Control': 'private, max-age=30',
      },
    },
  );
}
