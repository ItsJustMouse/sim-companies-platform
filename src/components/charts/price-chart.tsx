'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { areaPath, linePath, linearScale, niceTicks, padDomain } from './scale';
import { money } from '@/lib/util/format';

/**
 * Price chart.
 *
 * Reads like a market chart rather than a decorative one: a thin line over a faint
 * area fill, a right-hand price axis, and a crosshair that reports the exact value
 * under the pointer. It measures its own container so text stays at its natural size
 * instead of being stretched by a scaled viewBox.
 *
 * Interaction is pointer-based, so it works with mouse, touch and pen, and the
 * keyboard path (arrow keys) moves the same cursor for readers who do not use one.
 */

export interface ChartPoint {
  at: string;
  price: number;
}

interface Props {
  points: readonly ChartPoint[];
  /** Optional overlay, e.g. a moving average. Nulls leave gaps. */
  overlay?: { label: string; values: readonly (number | null)[] } | undefined;
  height?: number;
  label?: string;
  /** Collection start, shown when the series does not cover the requested range. */
  collectionStartedAt?: string | null;
}

const PADDING = { top: 12, right: 58, bottom: 24, left: 8 };

export function PriceChart({ points, overlay, height = 320, label = 'Price', collectionStartedAt }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [cursor, setCursor] = useState<number | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    setWidth(element.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  const geometry = useMemo(() => {
    if (points.length === 0 || width <= 0) return null;

    const plotWidth = Math.max(1, width - PADDING.left - PADDING.right);
    const plotHeight = Math.max(1, height - PADDING.top - PADDING.bottom);

    const times = points.map((p) => Date.parse(p.at));
    const prices = points.map((p) => p.price);
    const overlayValues = (overlay?.values ?? []).filter((v): v is number => v !== null);

    const [yMin, yMax] = padDomain(
      Math.min(...prices, ...overlayValues),
      Math.max(...prices, ...overlayValues),
    );

    const x = linearScale(
      [times[0] as number, times[times.length - 1] as number],
      [PADDING.left, PADDING.left + plotWidth],
    );
    const y = linearScale([yMin, yMax], [PADDING.top + plotHeight, PADDING.top]);

    const coords = points.map((p, i) => [x(times[i] as number), y(p.price)] as const);
    const overlayCoords = overlay
      ? overlay.values.map((value, i) => (value === null ? null : ([x(times[i] as number), y(value)] as const)))
      : [];

    return {
      x,
      y,
      coords,
      overlayCoords,
      times,
      plotHeight,
      baseline: PADDING.top + plotHeight,
      yTicks: niceTicks(yMin, yMax, 5),
    };
  }, [points, overlay, width, height]);

  const nearestIndex = useCallback(
    (clientX: number): number | null => {
      const element = containerRef.current;
      if (!element || !geometry) return null;
      const rect = element.getBoundingClientRect();
      const localX = clientX - rect.left;

      let best = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      geometry.coords.forEach(([cx], index) => {
        const distance = Math.abs(cx - localX);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      });
      return best;
    },
    [geometry],
  );

  if (points.length === 0) {
    return (
      <div
        ref={containerRef}
        style={{ height }}
        className="flex flex-col items-center justify-center gap-1 rounded-[var(--radius-card)] border border-dashed border-[var(--border)] px-6 text-center"
      >
        <p className="text-sm font-medium text-[var(--text-muted)]">No price history yet</p>
        <p className="max-w-md text-xs text-[var(--text-faint)]">
          {collectionStartedAt
            ? `Ledgerforge has been recording this market since ${new Date(collectionStartedAt).toISOString().slice(0, 10)}. There are no observations inside the selected range.`
            : 'The game does not publish price history, so this chart fills in from our own snapshots as they are collected.'}
        </p>
      </div>
    );
  }

  const active = cursor !== null ? points[cursor] : null;
  const activeCoord = cursor !== null && geometry ? geometry.coords[cursor] : null;
  const first = points[0] as ChartPoint;
  const last = points[points.length - 1] as ChartPoint;
  const rising = last.price >= first.price;
  const stroke = rising ? 'var(--up)' : 'var(--down)';

  return (
    <div ref={containerRef} className="relative w-full select-none" style={{ height }}>
      {geometry && width > 0 ? (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${label} chart, ${points.length} observations from ${first.at} to ${last.at}.`}
          className="touch-none"
          tabIndex={0}
          onPointerMove={(event) => setCursor(nearestIndex(event.clientX))}
          onPointerLeave={() => setCursor(null)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') {
              event.preventDefault();
              setCursor((c) => Math.min(points.length - 1, (c ?? 0) + 1));
            } else if (event.key === 'ArrowLeft') {
              event.preventDefault();
              setCursor((c) => Math.max(0, (c ?? points.length - 1) - 1));
            } else if (event.key === 'Escape') {
              setCursor(null);
            }
          }}
        >
          <defs>
            <linearGradient id="lf-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Horizontal gridlines and the right-hand price axis. */}
          {geometry.yTicks.map((tick) => {
            const ty = geometry.y(tick);
            return (
              <g key={tick}>
                <line
                  x1={PADDING.left}
                  x2={width - PADDING.right}
                  y1={ty}
                  y2={ty}
                  stroke="var(--grid)"
                  strokeWidth={1}
                />
                <text
                  x={width - PADDING.right + 8}
                  y={ty + 3.5}
                  fontSize={10.5}
                  fill="var(--text-faint)"
                  className="tnum"
                >
                  {money(tick, { compact: true })}
                </text>
              </g>
            );
          })}

          <path d={areaPath(geometry.coords, geometry.baseline)} fill="url(#lf-area)" />
          <path
            d={linePath(geometry.coords)}
            fill="none"
            stroke={stroke}
            strokeWidth={1.75}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {overlay && geometry.overlayCoords.length > 0 ? (
            <path
              d={linePath(geometry.overlayCoords)}
              fill="none"
              stroke="var(--color-steel-400)"
              strokeWidth={1.25}
              strokeDasharray="4 3"
              opacity={0.85}
            />
          ) : null}

          {activeCoord ? (
            <g>
              <line
                x1={activeCoord[0]}
                x2={activeCoord[0]}
                y1={PADDING.top}
                y2={geometry.baseline}
                stroke="var(--border-strong)"
                strokeWidth={1}
              />
              <circle cx={activeCoord[0]} cy={activeCoord[1]} r={3.5} fill={stroke} stroke="var(--surface)" strokeWidth={1.5} />
            </g>
          ) : null}

          {/* Time axis: first, middle and last only — a dense axis competes with the data. */}
          {[0, Math.floor(points.length / 2), points.length - 1].map((index, position) => {
            const point = points[index];
            if (!point || !geometry.coords[index]) return null;
            return (
              <text
                key={index}
                x={geometry.coords[index]?.[0]}
                y={height - 8}
                fontSize={10.5}
                fill="var(--text-faint)"
                textAnchor={position === 0 ? 'start' : position === 2 ? 'end' : 'middle'}
              >
                {formatTick(point.at, first.at, last.at)}
              </text>
            );
          })}
        </svg>
      ) : null}

      {active && activeCoord ? (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs shadow-lg"
          style={{
            left: Math.min(Math.max(0, activeCoord[0] - 60), Math.max(0, width - 150)),
            top: 6,
          }}
        >
          <div className="tnum font-semibold">{money(active.price)}</div>
          <div className="text-[var(--text-faint)]">{new Date(active.at).toISOString().replace('T', ' ').slice(0, 16)} UTC</div>
        </div>
      ) : null}

      <div className="sr-only" role="status" aria-live="polite">
        {active ? `${money(active.price)} at ${active.at}` : ''}
      </div>
    </div>
  );
}

function formatTick(at: string, first: string, last: string): string {
  const spanHours = (Date.parse(last) - Date.parse(first)) / 3_600_000;
  const date = new Date(at);
  if (spanHours <= 48) return date.toISOString().slice(11, 16);
  return date.toISOString().slice(5, 10);
}
