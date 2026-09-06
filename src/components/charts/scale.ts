/**
 * Chart scaling helpers.
 *
 * Ledgerforge draws its own charts rather than pulling in a charting library. The
 * charts we need are few and specific (a price series, a sparkline, a heatmap), a
 * library would add 50–150 kB to every page that shows one, and theming a
 * third-party renderer to match our tokens costs more than drawing the marks.
 */

export interface Scale {
  (value: number): number;
  domain: readonly [number, number];
  range: readonly [number, number];
}

export function linearScale(domain: readonly [number, number], range: readonly [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  // A zero-width domain would divide by zero; map everything to the range midpoint,
  // which draws a flat line rather than producing NaN coordinates.
  const span = d1 - d0;
  const fn = ((value: number) => (span === 0 ? (r0 + r1) / 2 : r0 + ((value - d0) / span) * (r1 - r0))) as Scale;
  fn.domain = domain;
  fn.range = range;
  return fn;
}

/**
 * Axis ticks at human-friendly intervals (1, 2, 2.5, 5, 10 x 10^n).
 * Chosen over evenly-spaced ticks because readers anchor on round numbers.
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];

  const rawStep = (max - min) / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalised = rawStep / magnitude;
  const step = (normalised >= 7.5 ? 10 : normalised >= 3.5 ? 5 : normalised >= 1.5 ? 2 : 1) * magnitude;

  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= max + step * 1e-9 && ticks.length < 24; value += step) {
    // Floating-point accumulation drifts; snap each tick back onto the step grid.
    ticks.push(Math.round(value / step) * step);
  }
  return ticks;
}

/** Pads a domain so the series never touches the plot edges. */
export function padDomain(min: number, max: number, ratio = 0.08): [number, number] {
  if (min === max) {
    const pad = Math.abs(min) * ratio || 1;
    return [min - pad, max + pad];
  }
  const pad = (max - min) * ratio;
  return [min - pad, max + pad];
}

/** SVG path for a polyline, skipping null gaps rather than bridging them. */
export function linePath(points: readonly (readonly [number, number] | null)[]): string {
  let path = '';
  let pendingMove = true;
  for (const point of points) {
    if (!point) {
      pendingMove = true;
      continue;
    }
    const [x, y] = point;
    path += `${pendingMove ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)} `;
    pendingMove = false;
  }
  return path.trim();
}

export function areaPath(points: readonly (readonly [number, number])[], baseline: number): string {
  if (points.length === 0) return '';
  const first = points[0] as readonly [number, number];
  const last = points[points.length - 1] as readonly [number, number];
  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  return `${line} L${last[0].toFixed(2)},${baseline.toFixed(2)} L${first[0].toFixed(2)},${baseline.toFixed(2)} Z`;
}
