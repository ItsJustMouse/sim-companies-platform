'use client';

import { useMemo, useState } from 'react';
import { compareAllocations } from '@/lib/calc/investment';
import { Card, CardHeader } from '@/components/ui/primitives';
import { ExplanationPanel } from '@/components/ui/explanation';
import { Answer, NumberField } from './fields';
import { money } from '@/lib/util/format';

interface Option {
  id: number;
  label: string;
  capital: number;
  profitPerHour: number;
}

/**
 * Capital allocation.
 *
 * Answers "where should this money go" by making the cost of each alternative
 * explicit. Opportunity cost is the whole output: the best option is obvious, what
 * matters is knowing what the others give up.
 */
export function AllocationCalculator() {
  const [options, setOptions] = useState<Option[]>([
    { id: 1, label: 'Option A', capital: 100_000, profitPerHour: 120 },
    { id: 2, label: 'Option B', capital: 250_000, profitPerHour: 260 },
    { id: 3, label: 'Option C', capital: 50_000, profitPerHour: 70 },
  ]);

  const calculation = useMemo(
    () =>
      compareAllocations(
        options.map((option) => ({
          label: option.label.trim() || 'Unnamed',
          capitalRequired: option.capital,
          profitPerHour: option.profitPerHour,
        })),
      ),
    [options],
  );

  const ranked = calculation.result?.ranked ?? [];

  function update(id: number, patch: Partial<Option>) {
    setOptions((current) => current.map((option) => (option.id === id ? { ...option, ...patch } : option)));
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="What are you choosing between?"
          description="Add each way you could deploy the same capital, with the profit per hour you expect from it."
        />
        <div className="space-y-4 p-4 sm:p-5">
          {options.map((option) => (
            <div key={option.id} className="grid gap-3 sm:grid-cols-[1fr_150px_150px_auto] sm:items-end">
              <label className="block">
                <span className="block text-xs font-medium text-[var(--text-muted)]">Name</span>
                <input
                  type="text"
                  value={option.label}
                  maxLength={60}
                  onChange={(event) => update(option.id, { label: event.target.value })}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm"
                />
              </label>
              <NumberField
                label="Capital"
                unit="$"
                value={option.capital}
                min={0}
                max={1e12}
                step={1000}
                onChange={(value) => update(option.id, { capital: value })}
              />
              <NumberField
                label="Profit"
                unit="$/hour"
                value={option.profitPerHour}
                min={-1e9}
                max={1e9}
                step={1}
                onChange={(value) => update(option.id, { profitPerHour: value })}
              />
              <button
                type="button"
                onClick={() => setOptions((current) => current.filter((o) => o.id !== option.id))}
                disabled={options.length <= 2}
                className="h-[34px] rounded-md border border-[var(--border)] px-2.5 text-sm text-[var(--text-muted)] disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() =>
              setOptions((current) => [
                ...current,
                {
                  id: Math.max(0, ...current.map((o) => o.id)) + 1,
                  label: `Option ${String.fromCharCode(65 + current.length)}`,
                  capital: 100_000,
                  profitPerHour: 0,
                },
              ])
            }
            disabled={options.length >= 10}
            className="rounded-md border border-[var(--border-strong)] px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Add option
          </button>
        </div>
      </Card>

      {calculation.result ? (
        <>
          <Answer
            label="Best use of this capital"
            value={calculation.result.best.label}
            tone="up"
            sub={`${money(calculation.result.best.profitPerHour)}/hour on ${money(calculation.result.best.capitalRequired)}`}
          />

          <Card>
            <CardHeader title="Ranked, with what each alternative costs you" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <caption className="sr-only">Capital allocation options ranked by profit per hour</caption>
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                    <th scope="col" className="px-4 py-2 font-medium">Option</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Capital</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Profit / hour</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Return on capital</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Opportunity cost</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((row, index) => (
                    <tr key={row.label} className="border-b border-[var(--border)] last:border-0">
                      <th scope="row" className="px-4 py-2 text-left font-normal">
                        {index === 0 ? <span className="mr-1.5 text-[var(--up)]" aria-hidden="true">★</span> : null}
                        {row.label}
                      </th>
                      <td className="tnum px-4 py-2 text-right text-[var(--text-muted)]">{money(row.capitalRequired)}</td>
                      <td className="tnum px-4 py-2 text-right font-medium">{money(row.profitPerHour)}</td>
                      <td className="tnum px-4 py-2 text-right text-[var(--text-muted)]">
                        {row.returnOnCapitalPerHour === null
                          ? '—'
                          : `${(row.returnOnCapitalPerHour * 100).toFixed(4)}% /h`}
                      </td>
                      <td className="tnum px-4 py-2 text-right text-[var(--down)]">
                        {row.opportunityCostPerHour === 0 ? '—' : `-${money(row.opportunityCostPerHour)}/h`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--text-faint)]">
              Return on capital shows which option does most with the least money — useful when capital, not building
              slots, is your constraint. Opportunity cost is what you give up per hour by choosing that row instead of
              the best one.
            </p>
          </Card>

          <Card>
            <CardHeader title="Working" />
            <div className="p-4 sm:p-5">
              <ExplanationPanel explanation={calculation} />
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
