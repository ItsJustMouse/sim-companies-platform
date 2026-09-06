import { absoluteTime, relativeTime } from '@/lib/util/format';
import { Badge } from './primitives';

/**
 * The data-freshness contract, made visible.
 *
 * Every price in Ledgerforge is a measurement taken at a moment, from a source we do
 * not control. This component is how the product says so. "Real time" here means
 * "as current as the game's API legitimately allows" — never instantaneous — and a
 * value we cannot vouch for is labelled rather than quietly displayed.
 */

export type FreshnessKind = 'live' | 'stale' | 'stored' | 'unavailable' | 'collected' | 'derived' | 'fixture';

const LABELS: Record<FreshnessKind, { label: string; tone: 'up' | 'warn' | 'neutral' | 'danger' | 'accent'; help: string }> = {
  live: {
    label: 'Live',
    tone: 'up',
    help: 'Read from the Sim Companies API within the last few minutes.',
  },
  stale: {
    label: 'Stale',
    tone: 'warn',
    help: 'The last successful read is older than our freshness window. Shown because an old price beats no price, but treat it with care.',
  },
  stored: {
    label: 'From our records',
    tone: 'warn',
    help: 'The game API is unreachable. This is the most recent observation Ledgerforge recorded.',
  },
  unavailable: {
    label: 'Unavailable',
    tone: 'danger',
    help: 'We have no price for this product — neither live nor recorded.',
  },
  collected: {
    label: 'Collected by Ledgerforge',
    tone: 'accent',
    help: 'History recorded by our own snapshots. The game does not publish price history, so this series starts when we started collecting.',
  },
  derived: {
    label: 'Calculated',
    tone: 'neutral',
    help: 'Computed by Ledgerforge from market prices and game data, not read directly from the game.',
  },
  fixture: {
    label: 'Sample data',
    tone: 'danger',
    help: 'Synthetic development data. These are not real Sim Companies prices.',
  },
};

export function FreshnessBadge({ kind }: { kind: FreshnessKind }) {
  const meta = LABELS[kind];
  return (
    <Badge tone={meta.tone} title={meta.help}>
      {meta.label}
    </Badge>
  );
}

export function DataAge({
  observedAt,
  prefix = 'Updated',
  className,
}: {
  observedAt: string | null | undefined;
  prefix?: string;
  className?: string;
}) {
  return (
    <span className={className} title={observedAt ? absoluteTime(observedAt) : undefined}>
      {prefix} {relativeTime(observedAt)}
    </span>
  );
}

export function FreshnessLine({
  kind,
  observedAt,
  note,
}: {
  kind: FreshnessKind;
  observedAt: string | null | undefined;
  note?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
      <FreshnessBadge kind={kind} />
      <DataAge observedAt={observedAt} />
      {note ? <span className="text-[var(--text-faint)]">· {note}</span> : null}
    </div>
  );
}
