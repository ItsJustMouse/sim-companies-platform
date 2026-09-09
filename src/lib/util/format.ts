/**
 * Presentation helpers.
 *
 * Formatting lives in one place because "what does an unknown value look like" is a
 * product decision, not a per-component one. The answer throughout Simconomist is an
 * em dash: a missing price is never rendered as $0.00, which would read as free.
 */

const UNKNOWN = '—';

export function money(value: number | null | undefined, options: { decimals?: number; compact?: boolean } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNKNOWN;

  if (options.compact && Math.abs(value) >= 10_000) {
    return `$${compactNumber(value)}`;
  }

  // Cheap goods trade in fractions of a cent, expensive ones in whole dollars.
  // Fixed 2dp would round a $0.019 commodity to $0.02 and hide a 5% difference.
  const decimals =
    options.decimals ??
    (Math.abs(value) >= 1000 ? 0 : Math.abs(value) >= 10 ? 2 : Math.abs(value) >= 0.1 ? 3 : 4);

  return `$${value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

export function compactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNKNOWN;
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function number(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNKNOWN;
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function percent(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNKNOWN;
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
}

/** Ratio (0.15) rendered as a percentage (15.0%), without a forced sign. */
export function ratioAsPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNKNOWN;
  return `${(value * 100).toFixed(decimals)}%`;
}

export function duration(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours) || hours < 0) return UNKNOWN;
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  const days = hours / 24;
  if (days < 60) return `${days.toFixed(1)} days`;
  return `${(days / 30.44).toFixed(1)} months`;
}

/** Compact relative age, e.g. "4 min ago". Used for every data-freshness label. */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 'unknown';

  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  const days = Math.round(seconds / 86_400);
  if (days < 45) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return `${Math.round(days / 30.44)} months ago`;
}

export function absoluteTime(iso: string | null | undefined): string {
  if (!iso) return UNKNOWN;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return UNKNOWN;
  return date.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

export { UNKNOWN };
