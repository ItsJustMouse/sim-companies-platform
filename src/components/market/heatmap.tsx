import Link from 'next/link';
import { money, percent } from '@/lib/util/format';

/**
 * Category heatmap.
 *
 * A treemap-ish grid where area is meaningless and only colour carries information —
 * deliberately. Sizing tiles by supply or price would encode a second variable that
 * readers habitually misread as importance. Colour intensity maps to 24-hour change,
 * and every tile states its number, so the chart is readable without relying on
 * colour at all.
 */
export function MarketHeatmap({
  cells,
}: {
  cells: readonly { id: number; name: string; slug: string; category: string | null; change: number | null; price: number | null }[];
}) {
  const grouped = new Map<string, typeof cells>();
  for (const cell of cells) {
    const key = cell.category ?? 'Uncategorised';
    grouped.set(key, [...(grouped.get(key) ?? []), cell]);
  }

  return (
    <div className="space-y-5">
      {[...grouped.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([category, items]) => (
          <section key={category}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-faint)]">
              {category}
              <span className="ml-2 font-normal normal-case text-[var(--text-muted)]">{items.length} products</span>
            </h3>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
              {[...items]
                .sort((a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity))
                .map((cell) => (
                  <Link
                    key={cell.id}
                    href={`/exchange/${cell.slug}`}
                    style={{ backgroundColor: tint(cell.change) }}
                    className="rounded-md border border-[var(--border)] p-2.5 transition-opacity hover:opacity-85"
                  >
                    <span className="block truncate text-xs font-medium text-[var(--text)]">{cell.name}</span>
                    <span className="tnum mt-0.5 block text-sm font-semibold text-[var(--text)]">
                      {percent(cell.change)}
                    </span>
                    <span className="tnum block text-[11px] text-[var(--text-muted)]">{money(cell.price)}</span>
                  </Link>
                ))}
            </div>
          </section>
        ))}
    </div>
  );
}

/**
 * Maps a percentage change to a translucent tint.
 *
 * `color-mix` against the theme's own up/down tokens keeps the scale correct in both
 * light and dark without a second palette, and the alpha stays low enough that text
 * on top keeps its contrast ratio.
 */
function tint(change: number | null): string {
  if (change === null) return 'transparent';
  // Saturates at ±10%: beyond that the difference between "big move" and "huge move"
  // is better read from the number than from a shade.
  const intensity = Math.min(1, Math.abs(change) / 10);
  const token = change >= 0 ? 'var(--up)' : 'var(--down)';
  return `color-mix(in oklab, ${token} ${(intensity * 26).toFixed(1)}%, transparent)`;
}
