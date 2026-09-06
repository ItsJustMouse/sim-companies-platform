import type { ReactNode } from 'react';
import clsx from 'clsx';

/**
 * Shared presentational primitives.
 *
 * Kept deliberately small: a handful of composable pieces used everywhere beats a
 * component library whose options nobody remembers. Everything here is a server
 * component — no client JavaScript is shipped for layout or typography.
 */

export function Card({
  children,
  className,
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article' | 'aside';
}) {
  return (
    <Tag
      className={clsx(
        'rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)]',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  description,
  action,
  level = 2,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  level?: 2 | 3 | 4;
}) {
  const Heading = `h${level}` as const;
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <Heading className="text-sm font-semibold tracking-tight text-[var(--text)]">{title}</Heading>
        {description ? <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
  size = 'md',
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'neutral' | 'up' | 'down' | 'warn';
  size?: 'md' | 'lg';
}) {
  const toneClass =
    tone === 'up'
      ? 'text-[var(--up)]'
      : tone === 'down'
        ? 'text-[var(--down)]'
        : tone === 'warn'
          ? 'text-[var(--warn)]'
          : 'text-[var(--text)]';

  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-faint)]">{label}</div>
      <div className={clsx('tnum mt-1 font-semibold', size === 'lg' ? 'text-2xl' : 'text-lg', toneClass)}>{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-[var(--text-muted)]">{hint}</div> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  title,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'up' | 'down' | 'warn' | 'danger' | 'accent';
  title?: string;
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-[var(--surface-muted)] text-[var(--text-muted)] border-[var(--border)]',
    up: 'bg-[var(--up-soft)] text-[var(--up)] border-transparent',
    down: 'bg-[var(--down-soft)] text-[var(--down)] border-transparent',
    warn: 'bg-[var(--warn-soft)] text-[var(--warn)] border-transparent',
    danger: 'bg-[var(--danger-soft)] text-[var(--danger)] border-transparent',
    accent: 'bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] text-[var(--accent)] border-transparent',
  };
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/**
 * Signed change, with an arrow so direction is legible without relying on colour.
 * This is the accessibility contract for every red/green figure in the product.
 */
export function Delta({ percent, className }: { percent: number | null | undefined; className?: string }) {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) {
    return <span className={clsx('tnum text-[var(--text-faint)]', className)}>—</span>;
  }
  const up = percent > 0.0001;
  const down = percent < -0.0001;
  return (
    <span
      className={clsx(
        'tnum font-medium',
        up ? 'text-[var(--up)]' : down ? 'text-[var(--down)]' : 'text-[var(--flat)]',
        className,
      )}
    >
      <span aria-hidden="true">{up ? '▲' : down ? '▼' : '■'}</span>{' '}
      {percent >= 0 ? '+' : ''}
      {percent.toFixed(2)}%
      <span className="sr-only">{up ? ' increase' : down ? ' decrease' : ' unchanged'}</span>
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
      <p className="max-w-md text-sm text-[var(--text-muted)]">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warn' | 'danger';
  title?: ReactNode;
  children: ReactNode;
}) {
  const tones = {
    info: 'border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-muted)]',
    warn: 'border-transparent bg-[var(--warn-soft)] text-[var(--warn)]',
    danger: 'border-transparent bg-[var(--danger-soft)] text-[var(--danger)]',
  } as const;

  return (
    <div className={clsx('rounded-[var(--radius-card)] border px-4 py-3 text-sm', tones[tone])}>
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      <div className="[&_a]:underline [&_a]:underline-offset-2">{children}</div>
    </div>
  );
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-[var(--text)]">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-[var(--text-muted)]">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={clsx('animate-pulse rounded bg-[var(--surface-muted)]', className)}
      aria-hidden="true"
    />
  );
}
