'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Card, CardHeader, Delta, Badge } from '@/components/ui/primitives';
import { compactNumber, money, ratioAsPercent } from '@/lib/util/format';

/**
 * Opportunity scanner.
 *
 * The ranking is recomputed on the client whenever assumptions change, which keeps
 * "what if my building were level 8 with 15% overhead" instant. The heavy work —
 * pricing every recipe against the market — was already done on the server; this
 * only rescales it.
 *
 * Each row can be expanded to show exactly why it ranks where it does. A scanner
 * that produces a leaderboard without a reason is a slot machine, not a tool.
 */

export interface ScannerRow {
  id: number;
  name: string;
  slug: string;
  category: string | null;
  buildingName: string | null;
  buildingCost: number | null;
  salePrice: number | null;
  /** Cost components at the server baseline: level 1, no bonus, no overhead. */
  baseLabourPerUnit: number;
  baseInputCostPerUnit: number | null;
  baseTransportPerUnit: number;
  baseUnitsPerHour: number;
  netRevenuePerUnit: number | null;
  breakEvenSalePrice: number | null;
  liquidity: number | null;
  volatility: number | null;
  change24h: number | null;
  /**
   * Exchange depth from a full order-book observation.
   * null means the ticker supplied price only.
   */
  quantity: number | null;
  offers: number | null;
  inputNames: string[];
  reasons: string[];
  cautions: string[];
  incomplete: boolean;
}

type SortKey = 'profitPerHour' | 'profitPerUnit' | 'margin' | 'returnOnBuildCost' | 'liquidity' | 'change24h';

const SORTS: { key: SortKey; label: string; hint: string }[] = [
  { key: 'profitPerHour', label: 'Profit / hour', hint: 'Most money per hour of building time' },
  { key: 'profitPerUnit', label: 'Profit / unit', hint: 'Best margin per item produced' },
  { key: 'margin', label: 'Margin', hint: 'Profit as a share of sale price' },
  { key: 'returnOnBuildCost', label: 'Return on build cost', hint: 'Profit per hour per dollar of construction cost' },
  { key: 'liquidity', label: 'Liquidity', hint: 'How easily the market absorbs your output' },
  { key: 'change24h', label: '24h move', hint: 'Biggest recent price movement' },
];

interface Computed extends ScannerRow {
  unitsPerHour: number;
  labourPerUnit: number;
  costPerUnit: number | null;
  profitPerUnit: number | null;
  profitPerHour: number | null;
  margin: number | null;
  returnOnBuildCost: number | null;
}

export function ScannerView({ rows, observedAt }: { rows: readonly ScannerRow[]; observedAt: string | null }) {
  const [level, setLevel] = useState(1);
  const [productionBonus, setProductionBonus] = useState(0);
  const [adminOverhead, setAdminOverhead] = useState(0);
  const [sort, setSort] = useState<SortKey>('profitPerHour');
  const [category, setCategory] = useState('all');
  const [hideLosers, setHideLosers] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  const categories = useMemo(
    () => [...new Set(rows.map((r) => r.category).filter((c): c is string => Boolean(c)))].sort(),
    [rows],
  );

  const computed = useMemo<Computed[]>(() => {
    return rows.map((row) => {
      // Output and the wage bill both scale with level, so labour per unit is
      // unchanged by it — only the production bonus and overhead move that number.
      // Level changes throughput, and therefore profit per hour.
      const unitsPerHour = row.baseUnitsPerHour * level * (1 + productionBonus);
      // Labour per unit is independent of building level (wages and output both
      // scale with it) but not of the production bonus, which raises output without
      // raising wages, nor of overhead, which multiplies the wage bill.
      const labourPerUnit = (row.baseLabourPerUnit / (1 + productionBonus)) * (1 + adminOverhead);

      const costPerUnit =
        row.baseInputCostPerUnit === null ? null : row.baseInputCostPerUnit + labourPerUnit + row.baseTransportPerUnit;

      const profitPerUnit =
        costPerUnit === null || row.netRevenuePerUnit === null ? null : row.netRevenuePerUnit - costPerUnit;
      const profitPerHour = profitPerUnit === null ? null : profitPerUnit * unitsPerHour;

      return {
        ...row,
        unitsPerHour,
        labourPerUnit,
        costPerUnit,
        profitPerUnit,
        profitPerHour,
        margin: profitPerUnit === null || !row.salePrice ? null : profitPerUnit / row.salePrice,
        returnOnBuildCost:
          profitPerHour === null || !row.buildingCost || row.buildingCost <= 0 ? null : profitPerHour / row.buildingCost,
      };
    });
  }, [rows, level, productionBonus, adminOverhead]);

  const visible = useMemo(() => {
    const filtered = computed.filter((row) => {
      if (category !== 'all' && row.category !== category) return false;
      if (hideLosers && (row.profitPerHour ?? -1) <= 0) return false;
      return true;
    });

    const value = (row: Computed): number | null => {
      switch (sort) {
        case 'profitPerHour':
          return row.profitPerHour;
        case 'profitPerUnit':
          return row.profitPerUnit;
        case 'margin':
          return row.margin;
        case 'returnOnBuildCost':
          return row.returnOnBuildCost;
        case 'liquidity':
          return row.liquidity;
        case 'change24h':
          return row.change24h;
      }
    };

    return [...filtered].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      if (av === null && bv === null) return a.name.localeCompare(b.name);
      if (av === null) return 1;
      if (bv === null) return -1;
      return bv - av;
    });
  }, [computed, sort, category, hideLosers]);

  const unassessable = computed.filter((r) => r.profitPerHour === null).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Your assumptions"
          description="Everything below is recalculated from these. Change them to match your company."
        />
        <div className="grid gap-4 p-4 sm:grid-cols-3 sm:p-5">
          <Field
            label="Building level"
            value={level}
            min={1}
            max={100}
            step={1}
            onChange={setLevel}
            hint="Scales output and wages together, so profit per hour scales with it."
          />
          <Field
            label="Production bonus (%)"
            value={productionBonus * 100}
            min={0}
            max={200}
            step={1}
            onChange={(v) => setProductionBonus(v / 100)}
            hint="Extra output speed from levelling. Raises output without raising wages."
          />
          <Field
            label="Administration overhead (%)"
            value={adminOverhead * 100}
            min={0}
            max={200}
            step={0.5}
            onChange={(v) => setAdminOverhead(v / 100)}
            hint="Multiplies your labour cost. Find it on your company's overview."
          />
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="scanner-sort">Rank by</label>
        <select
          id="scanner-sort"
          value={sort}
          onChange={(event) => setSort(event.target.value as SortKey)}
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm"
          title={SORTS.find((s) => s.key === sort)?.hint}
        >
          {SORTS.map((option) => (
            <option key={option.key} value={option.key}>Rank by: {option.label}</option>
          ))}
        </select>

        <label className="sr-only" htmlFor="scanner-category">Category</label>
        <select
          id="scanner-category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm"
        >
          <option value="all">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <button
          type="button"
          onClick={() => setHideLosers((v) => !v)}
          aria-pressed={hideLosers}
          className={clsx(
            'rounded-md border px-2.5 py-1.5 text-sm',
            hideLosers ? 'border-[var(--border-strong)] text-[var(--text)]' : 'border-[var(--border)] text-[var(--text-muted)]',
          )}
        >
          {hideLosers ? 'Hiding unprofitable' : 'Showing unprofitable'}
        </button>

        <span className="text-xs text-[var(--text-muted)]" role="status" aria-live="polite">
          {visible.length} products
          {unassessable > 0 ? ` · ${unassessable} could not be assessed` : ''}
        </span>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border)]">
        <table className="w-full min-w-[880px] border-collapse text-sm">
          <caption className="sr-only">Products ranked by profitability under your assumptions</caption>
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-muted)]">
              <th scope="col" className="px-3 py-2 text-left font-medium">#</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Product</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Sale price</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Cost / unit</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Profit / unit</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Profit / hour</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Margin</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Liquidity</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">24h</th>
              <th scope="col" className="px-3 py-2 text-right font-medium"><span className="sr-only">Details</span></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-[var(--text-muted)]">
                  Nothing is profitable under these assumptions. Try a lower administration overhead, or turn off
                  &ldquo;hiding unprofitable&rdquo; to see the full picture.
                </td>
              </tr>
            ) : (
              visible.map((row, index) => (
                <FragmentRow
                  key={row.id}
                  row={row}
                  rank={index + 1}
                  expanded={expanded === row.id}
                  onToggle={() => setExpanded((current) => (current === row.id ? null : row.id))}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs leading-relaxed text-[var(--text-faint)]">
        Ranked using prices observed {observedAt ? new Date(observedAt).toISOString().replace('T', ' ').slice(0, 16) : 'recently'} UTC.
        Sale revenue is net of the Exchange fee; inputs are priced at the cheapest current listing, which may not
        cover the quantity you need. A high ranking is a starting point for a decision, not a guarantee — the
        products that look best are often the ones whose price just spiked.
      </p>
    </div>
  );
}

function FragmentRow({
  row,
  rank,
  expanded,
  onToggle,
}: {
  row: Computed;
  rank: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-b border-[var(--border)] hover:bg-[var(--surface-muted)]">
        <td className="tnum px-3 py-1.5 text-[var(--text-faint)]">{rank}</td>
        <td className="px-3 py-1.5">
          <Link href={`/exchange/${row.slug}`} className="font-medium hover:text-[var(--accent)]">{row.name}</Link>
          <span className="ml-2 text-xs text-[var(--text-faint)]">{row.buildingName ?? row.category}</span>
        </td>
        <td className="tnum px-3 py-1.5 text-right">{money(row.salePrice)}</td>
        <td className="tnum px-3 py-1.5 text-right text-[var(--text-muted)]">{money(row.costPerUnit)}</td>
        <td className={clsx('tnum px-3 py-1.5 text-right', (row.profitPerUnit ?? 0) >= 0 ? 'text-[var(--up)]' : 'text-[var(--down)]')}>
          {money(row.profitPerUnit)}
        </td>
        <td className={clsx('tnum px-3 py-1.5 text-right font-semibold', (row.profitPerHour ?? 0) >= 0 ? 'text-[var(--up)]' : 'text-[var(--down)]')}>
          {money(row.profitPerHour, { compact: true })}
        </td>
        <td className="tnum px-3 py-1.5 text-right text-[var(--text-muted)]">{ratioAsPercent(row.margin)}</td>
        <td className="tnum px-3 py-1.5 text-right text-[var(--text-muted)]">{row.liquidity ?? '—'}</td>
        <td className="px-3 py-1.5 text-right"><Delta percent={row.change24h} /></td>
        <td className="px-3 py-1.5 text-right">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="rounded px-1.5 py-0.5 text-xs text-[var(--accent)] hover:underline"
          >
            {expanded ? 'Hide' : 'Why?'}
          </button>
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)]">
          <td colSpan={10} className="px-4 py-3">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
                  Cost breakdown
                </h3>
                <dl className="space-y-0.5 text-xs">
                  <Row label="Inputs" value={money(row.baseInputCostPerUnit)} />
                  <Row label="Labour + overhead" value={money(row.labourPerUnit)} />
                  <Row label="Transport" value={money(row.baseTransportPerUnit)} />
                  <Row label="Net revenue" value={money(row.netRevenuePerUnit)} />
                  <Row label="Break-even sale price" value={money(row.breakEvenSalePrice)} />
                  <Row label="Output" value={`${compactNumber(row.unitsPerHour)} units/hour`} />
                </dl>
                {row.inputNames.length > 0 ? (
                  <p className="mt-1.5 text-xs text-[var(--text-faint)]">Inputs: {row.inputNames.join(', ')}</p>
                ) : null}
              </div>

              <div>
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
                  Why it ranks here
                </h3>
                {row.reasons.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">No standout strengths — it ranks purely on the numbers.</p>
                ) : (
                  <ul className="space-y-1 text-xs text-[var(--text-muted)]">
                    {row.reasons.map((reason) => <li key={reason}>· {reason}</li>)}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
                  Before you commit
                </h3>
                {row.cautions.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">Nothing unusual flagged.</p>
                ) : (
                  <ul className="space-y-1 text-xs text-[var(--warn)]">
                    {row.cautions.map((caution) => <li key={caution}>! {caution}</li>)}
                  </ul>
                )}
                <p className="mt-2 text-xs text-[var(--text-faint)]">
                  {row.quantity !== null && row.offers !== null
                    ? `${compactNumber(row.quantity)} units on offer across ${row.offers} listings.`
                    : 'Exchange depth was not measured in this market snapshot.'}
                </p>
                {row.incomplete ? <div className="mt-1.5"><Badge tone="warn">Incomplete costs</Badge></div> : null}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="tnum text-[var(--text)]">{value}</dd>
    </div>
  );
}

function Field({
  label,
  value,
  min,
  max,
  step,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  hint: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--text-muted)]">
        {label}
        <input
          type="number"
          value={Number.isFinite(value) ? Number(value.toFixed(2)) : 0}
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            const next = Number(event.target.value);
            // Clamp rather than reject: a typo should not silently produce an
            // absurd ranking that looks authoritative.
            if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
          }}
          className="tnum mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--text)]"
        />
      </label>
      <p className="mt-1 text-xs text-[var(--text-faint)]">{hint}</p>
    </div>
  );
}
