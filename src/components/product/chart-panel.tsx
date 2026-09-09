'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { PriceChart, type ChartPoint } from '@/components/charts/price-chart';
import { movingAverage } from '@/lib/market/statistics';

/**
 * Chart with range and overlay controls.
 *
 * All ranges are served from one payload rather than re-fetching per range: the
 * whole series for a product is a few kilobytes, so switching range is instant and
 * costs the server nothing. The moving average is opt-in — an indicator nobody asked
 * for is clutter.
 */

const RANGES = [
  { key: '1D', hours: 24 },
  { key: '1W', hours: 24 * 7 },
  { key: '1M', hours: 24 * 30 },
  { key: '3M', hours: 24 * 90 },
  { key: '1Y', hours: 24 * 365 },
  { key: 'MAX', hours: Number.POSITIVE_INFINITY },
] as const;

type RangeKey = (typeof RANGES)[number]['key'];

export function ChartPanel({
  points,
  collectionStartedAt,
  productName,
  resourceId,
  realmId,
  quality = 0,
  initialRange = '1M',
}: {
  points: readonly ChartPoint[];
  collectionStartedAt: string | null;
  productName: string;
  resourceId: number;
  realmId: number;
  quality?: number;
  initialRange?: RangeKey;
}) {
  const [range, setRange] = useState<RangeKey>(initialRange);
  const [showAverage, setShowAverage] = useState(false);
  // Ranges already fetched, keyed by range. Held in state rather than a ref because
  // it is read during render; the server-rendered range seeds it, so the first paint
  // needs no request at all.
  const [seriesByRange, setSeriesByRange] = useState<ReadonlyMap<RangeKey, readonly ChartPoint[]>>(
    () => new Map([[initialRange, points]]),
  );
  // Loading is derived, not stored: a range is loading exactly while it has no
  // fetched series. Keeping it as state would mean writing state from inside the
  // effect that starts the request, which cascades an extra render.
  // A single clock read per mount. Calling Date.now() during render would make the
  // component non-idempotent, and the range cut-offs do not need to move mid-session.
  const [now] = useState(() => Date.now());
  const loading = !seriesByRange.has(range);

  useEffect(() => {
    if (seriesByRange.has(range)) return;

    const controller = new AbortController();
    const params = new URLSearchParams({
      resourceId: String(resourceId),
      realmId: String(realmId),
      quality: String(quality),
      range,
    });

    fetch(`/api/history?${params.toString()}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data: { points?: ChartPoint[] }) => {
        setSeriesByRange((current) => new Map(current).set(range, data.points ?? []));
      })
      .catch(() => {
        // Leave the range unfetched so a later attempt can retry; the chart keeps
        // showing whatever it last had rather than blanking.
      });

    return () => controller.abort();
  }, [range, resourceId, realmId, quality, seriesByRange]);

  const visible = useMemo(() => {
    const fetched = seriesByRange.get(range);
    if (fetched) return [...fetched];
    // Not yet loaded: narrow whatever we already have so the chart still says
    // something truthful while the request is in flight.
    const hours = RANGES.find((r) => r.key === range)?.hours ?? 24 * 30;
    if (!Number.isFinite(hours)) return [...points];
    const cutoff = now - hours * 3_600_000;
    return points.filter((point) => Date.parse(point.at) >= cutoff);
  }, [points, range, seriesByRange, now]);

  const overlay = useMemo(() => {
    if (!showAverage || visible.length < 8) return undefined;
    // Roughly a seventh of the window, so the average smooths without lagging so far
    // behind that it stops describing the visible series.
    const window = Math.max(3, Math.round(visible.length / 7));
    return { label: `${window}-point average`, values: movingAverage(visible, window) };
  }, [showAverage, visible]);

  // Which ranges the collected history can actually support. Offering "1Y" on two
  // weeks of data invites the reader to believe we have a year of it.
  const earliest = collectionStartedAt ? Date.parse(collectionStartedAt) : points[0] ? Date.parse(points[0].at) : null;
  const availableHours = earliest ? (now - earliest) / 3_600_000 : 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Chart range">
          {RANGES.map((option) => {
            const supported = !Number.isFinite(option.hours) || option.hours <= availableHours * 1.35;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setRange(option.key)}
                disabled={!supported}
                aria-pressed={range === option.key}
                title={supported ? undefined : 'Not enough collected history for this range yet'}
                className={clsx(
                  'rounded px-2 py-1 text-xs font-medium transition-colors',
                  range === option.key
                    ? 'bg-[var(--surface-hover)] text-[var(--text)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--surface-muted)]',
                  !supported && 'cursor-not-allowed opacity-35',
                )}
              >
                {option.key}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          {loading ? <span className="text-xs text-[var(--text-faint)]">Loading…</span> : null}
        <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <input
            type="checkbox"
            checked={showAverage}
            onChange={(event) => setShowAverage(event.target.checked)}
            className="accent-[var(--accent)]"
          />
          Moving average
        </label>
        </div>
      </div>

      <PriceChart
        points={visible}
        overlay={overlay}
        label={`${productName} price`}
        collectionStartedAt={collectionStartedAt}
      />

      <p className="mt-2 text-xs text-[var(--text-faint)]">
        {visible.length > 0
          ? `${visible.length} observations. `
          : ''}
        Price history is recorded by Simconomist — the game publishes only the current order book, so this series
        begins when our collection did
        {collectionStartedAt ? ` (${new Date(collectionStartedAt).toISOString().slice(0, 10)})` : ''}.
      </p>
    </div>
  );
}
