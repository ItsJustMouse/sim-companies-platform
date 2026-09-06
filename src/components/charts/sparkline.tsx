import { linePath, linearScale, padDomain } from './scale';

/**
 * Inline trend indicator for table rows.
 *
 * Server-rendered with no interactivity: in a table of hundreds of rows, an
 * interactive chart per row would cost far more than it tells the reader. Colour
 * follows direction, and `aria-hidden` keeps it out of the accessibility tree because
 * the adjacent change column already states the same thing in words.
 */
export function Sparkline({
  values,
  width = 88,
  height = 24,
}: {
  values: readonly number[];
  width?: number;
  height?: number;
}) {
  if (values.length < 2) {
    return <span className="inline-block text-[var(--text-faint)]" style={{ width }} aria-hidden="true">—</span>;
  }

  const [min, max] = padDomain(Math.min(...values), Math.max(...values), 0.12);
  const x = linearScale([0, values.length - 1], [1, width - 1]);
  const y = linearScale([min, max], [height - 2, 2]);
  const coords = values.map((value, index) => [x(index), y(value)] as const);

  const first = values[0] as number;
  const last = values[values.length - 1] as number;
  const stroke = last > first ? 'var(--up)' : last < first ? 'var(--down)' : 'var(--flat)';

  return (
    <svg width={width} height={height} aria-hidden="true" className="overflow-visible">
      <path d={linePath(coords)} fill="none" stroke={stroke} strokeWidth={1.35} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
