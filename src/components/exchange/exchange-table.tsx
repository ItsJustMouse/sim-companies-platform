'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Delta } from '@/components/ui/primitives';
import { Sparkline } from '@/components/charts/sparkline';
import { WatchButton } from './watch-button';
import { useWatchlist } from '@/lib/watchlist/store';
import { compactNumber, money, relativeTime } from '@/lib/util/format';

/**
 * The Exchange table.
 *
 * A serialisable snapshot of the market is rendered on the server and handed to this
 * component, which owns only sorting, filtering and column visibility. Filtering
 * client-side keeps every interaction instant across a few hundred rows and avoids a
 * round trip for what is really a view preference.
 */

export interface ExchangeRow {
  id: number;
  name: string;
  slug: string;
  category: string | null;
  price: number | null;
  pricesByQuality: Record<number, number>;
  change1h: number | null;
  change24h: number | null;
  change7d: number | null;
  volatility: number | null;
  liquidity: number | null;
  /** null means this snapshot did not inspect the full order book. */
  quantity: number | null;
  offers: number | null;
  spark: number[];
  observedAt: string | null;
}

type SortKey =
  | 'name'
  | 'price'
  | 'change1h'
  | 'change24h'
  | 'change7d'
  | 'volatility'
  | 'liquidity'
  | 'quantity'
  | 'offers';

interface Column {
  key: SortKey;
  label: string;
  numeric: boolean;
  hint?: string;
  optional?: boolean;
}

const COLUMNS: Column[] = [
  { key: 'name', label: 'Product', numeric: false },
  { key: 'price', label: 'Price', numeric: true, hint: 'Cheapest current offer at the selected quality' },
  { key: 'change1h', label: '1h', numeric: true, optional: true },
  { key: 'change24h', label: '24h', numeric: true },
  { key: 'change7d', label: '7d', numeric: true },
  {
    key: 'volatility',
    label: 'Volatility',
    numeric: true,
    hint: 'Standard deviation of period-over-period returns across the last 7 days',
    optional: true,
  },
  { key: 'liquidity', label: 'Liquidity', numeric: true, hint: 'Depth and breadth of the order book, 0-100' },
  { key: 'quantity', label: 'Supply', numeric: true, hint: 'Total units currently on offer' },
  { key: 'offers', label: 'Listings', numeric: true, optional: true },
];

export function ExchangeTable({ rows, qualities }: { rows: readonly ExchangeRow[]; qualities: readonly number[] }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [quality, setQuality] = useState(0);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'quantity', dir: 'desc' });
  const [showOptional, setShowOptional] = useState(false);
  const [onlyWatched, setOnlyWatched] = useState(false);
  const watchedIds = useWatchlist();
  const watched = useMemo(() => new Set(watchedIds), [watchedIds]);

  const categories = useMemo(
    () => [...new Set(rows.map((r) => r.category).filter((c): c is string => Boolean(c)))].sort(),
    [rows],
  );

  const priceOf = (row: ExchangeRow) => (quality === 0 ? row.price : (row.pricesByQuality[quality] ?? null));

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (onlyWatched && !watched.has(row.id)) return false;
      if (category !== 'all' && row.category !== category) return false;
      if (needle && !row.name.toLowerCase().includes(needle)) return false;
      return true;
    });

    const value = (row: ExchangeRow): number | string | null => {
      switch (sort.key) {
        case 'name':
          return row.name;
        case 'price':
          return quality === 0 ? row.price : (row.pricesByQuality[quality] ?? null);
        case 'change1h':
          return row.change1h;
        case 'change24h':
          return row.change24h;
        case 'change7d':
          return row.change7d;
        case 'volatility':
          return row.volatility;
        case 'liquidity':
          return row.liquidity;
        case 'quantity':
          return row.quantity;
        case 'offers':
          return row.offers;
      }
    };

    return [...filtered].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      if (typeof av === 'string' || typeof bv === 'string') {
        const result = String(av).localeCompare(String(bv));
        return sort.dir === 'asc' ? result : -result;
      }
      // An unmeasurable row always sinks, in either direction: "unknown" is not the
      // smallest value, and floating it to the top would misrepresent the market.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return sort.dir === 'asc' ? av - bv : bv - av;
    });
  }, [rows, query, category, sort, quality, onlyWatched, watched]);

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'name' ? 'asc' : 'desc' },
    );
  }

  const columns = COLUMNS.filter((c) => showOptional || !c.optional);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter products…"
          aria-label="Filter products by name"
          className="min-w-[180px] flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm"
        />

        <label className="sr-only" htmlFor="exchange-category">Category</label>
        <select
          id="exchange-category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm"
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <label className="sr-only" htmlFor="exchange-quality">Quality</label>
        <select
          id="exchange-quality"
          value={quality}
          onChange={(event) => setQuality(Number(event.target.value))}
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm"
          title="Prices shown are the cheapest offer at this quality or better"
        >
          {qualities.map((q) => (
            <option key={q} value={q}>{q === 0 ? 'Any quality' : `Quality ${q}+`}</option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setOnlyWatched((v) => !v)}
          aria-pressed={onlyWatched}
          className={clsx(
            'rounded-md border px-2.5 py-1.5 text-sm',
            onlyWatched
              ? 'border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_12%,transparent)] text-[var(--accent)]'
              : 'border-[var(--border)] text-[var(--text-muted)]',
          )}
        >
          Watchlist{watched.size > 0 ? ` (${watched.size})` : ''}
        </button>

        <button
          type="button"
          onClick={() => setShowOptional((v) => !v)}
          aria-pressed={showOptional}
          className="rounded-md border border-[var(--border)] px-2.5 py-1.5 text-sm text-[var(--text-muted)]"
        >
          {showOptional ? 'Fewer columns' : 'More columns'}
        </button>
      </div>

      <p className="mb-2 text-xs text-[var(--text-muted)]" role="status" aria-live="polite">
        Showing {visible.length} of {rows.length} products
        {quality > 0 ? ` · prices are the cheapest offer at quality ${quality} or better` : ''}
      </p>

      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border)]">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <caption className="sr-only">
            Exchange prices, supply and recent movement for every tracked product. Sortable by column.
          </caption>
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)]">
              <th scope="col" className="w-9 px-2 py-2"><span className="sr-only">Watch</span></th>
              {columns.map((column) => {
                const isSorted = sort.key === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    title={column.hint}
                    aria-sort={isSorted ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={clsx('px-3 py-2 font-medium', column.numeric ? 'text-right' : 'text-left')}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className="inline-flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text)]"
                    >
                      {column.label}
                      <span aria-hidden="true" className="text-[9px]">
                        {isSorted ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}
                      </span>
                    </button>
                  </th>
                );
              })}
              <th scope="col" className="px-3 py-2 text-right font-medium text-[var(--text-muted)]">30d</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 2} className="px-4 py-10 text-center text-[var(--text-muted)]">
                  No products match these filters.
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr key={row.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-muted)]">
                  <td className="px-2 py-1.5">
                    <WatchButton resourceId={row.id} name={row.name} watched={watched.has(row.id)} />
                  </td>
                  <td className="px-3 py-1.5">
                    <Link href={`/exchange/${row.slug}`} className="font-medium hover:text-[var(--accent)]">
                      {row.name}
                    </Link>
                    <span className="ml-2 text-xs text-[var(--text-faint)]">{row.category}</span>
                  </td>
                  <td className="tnum px-3 py-1.5 text-right font-medium" title={`Updated ${relativeTime(row.observedAt)}`}>
                    {money(priceOf(row))}
                  </td>
                  {showOptional ? (
                    <td className="px-3 py-1.5 text-right"><Delta percent={row.change1h} /></td>
                  ) : null}
                  <td className="px-3 py-1.5 text-right"><Delta percent={row.change24h} /></td>
                  <td className="px-3 py-1.5 text-right"><Delta percent={row.change7d} /></td>
                  {showOptional ? (
                    <td className="tnum px-3 py-1.5 text-right text-[var(--text-muted)]">
                      {row.volatility === null ? '—' : `${row.volatility.toFixed(1)}%`}
                    </td>
                  ) : null}
                  <td className="tnum px-3 py-1.5 text-right text-[var(--text-muted)]">{row.liquidity ?? '—'}</td>
                  <td className="tnum px-3 py-1.5 text-right text-[var(--text-muted)]">{compactNumber(row.quantity)}</td>
                  {showOptional ? (
                    <td className="tnum px-3 py-1.5 text-right text-[var(--text-muted)]">{row.offers ?? '—'}</td>
                  ) : null}
                  <td className="px-3 py-1.5 text-right">
                    <span className="inline-flex justify-end"><Sparkline values={row.spark} /></span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
