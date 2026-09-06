'use client';

import type { ReactNode } from 'react';
import clsx from 'clsx';

/**
 * Form controls shared by every calculator.
 *
 * Two rules run through all of them:
 *
 *   1. Every input has a visible label and a plain-language hint. A calculator whose
 *      fields only make sense to someone who already knows the answer is useless to
 *      the beginners this product is partly for.
 *   2. Numeric input is clamped, never rejected silently. A typo that produces an
 *      absurd but confidently-rendered result is worse than a corrected value.
 */

export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 1e12,
  step = 1,
  unit,
  hint,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block">
        <span className="block text-xs font-medium text-[var(--text-muted)]">
          {label}
          {unit ? <span className="ml-1 text-[var(--text-faint)]">({unit})</span> : null}
        </span>
        <input
          type="number"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : 0}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (event.target.value === '') {
              onChange(min);
              return;
            }
            if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
          }}
          className={clsx(
            'tnum mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--text)]',
            disabled && 'opacity-50',
          )}
        />
      </label>
      {hint ? <p className="mt-1 text-xs leading-snug text-[var(--text-faint)]">{hint}</p> : null}
    </div>
  );
}

export function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  hint?: ReactNode;
}) {
  return (
    <div>
      <label className="block">
        <span className="block text-xs font-medium text-[var(--text-muted)]">{label}</span>
        <select
          value={String(value)}
          onChange={(event) => {
            const raw = event.target.value;
            const match = options.find((option) => String(option.value) === raw);
            if (match) onChange(match.value);
          }}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--text)]"
        >
          {options.map((option) => (
            <option key={String(option.value)} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {hint ? <p className="mt-1 text-xs leading-snug text-[var(--text-faint)]">{hint}</p> : null}
    </div>
  );
}

export function ToggleField({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: ReactNode;
}) {
  return (
    <div>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 accent-[var(--accent)]"
        />
        <span className="text-xs font-medium text-[var(--text-muted)]">{label}</span>
      </label>
      {hint ? <p className="mt-1 pl-6 text-xs leading-snug text-[var(--text-faint)]">{hint}</p> : null}
    </div>
  );
}

/**
 * Headline answer.
 *
 * Progressive disclosure in one component: the simple answer is large and first, the
 * qualifier sits under it, and the detailed working lives in the explanation panel
 * further down the page.
 */
export function Answer({
  label,
  value,
  tone = 'neutral',
  sub,
}: {
  label: string;
  value: ReactNode;
  tone?: 'neutral' | 'up' | 'down';
  sub?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-faint)]">{label}</div>
      <div
        className={clsx(
          'tnum mt-1 text-2xl font-semibold',
          tone === 'up' ? 'text-[var(--up)]' : tone === 'down' ? 'text-[var(--down)]' : 'text-[var(--text)]',
        )}
      >
        {value}
      </div>
      {sub ? <div className="mt-1 text-xs text-[var(--text-muted)]">{sub}</div> : null}
    </div>
  );
}
