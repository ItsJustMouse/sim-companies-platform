# Market data pipeline

## The constraint everything follows from

**The game publishes the current order book and nothing else.** No history, no
aggregates, no traded volume. Every chart on this site is therefore made of
observations we recorded ourselves, and a series cannot begin before our collection
did.

The second constraint: the API is undocumented, unsupported, and its operators ask
third-party tools not to poll aggressively. So the design goal is not "collect as much
as possible" but **collect enough, as gently as possible, and be honest about the
gaps.**

## Flow

```
Sim Companies API
      │  one paced request per resource per sweep
      ▼
fetchMarketOffers ──► buildQuote ──► market_snapshots
                                          │
                                          ├──► buildCandles ──► market_candles (1h, 1d)
                                          │
                                          └──► pruneHistory (retention)
```

Reads take the reverse path, choosing resolution by range:

```
≤ 48h    → raw snapshots
≤ 120d   → 1h candles
> 120d   → 1d candles
```

with an on-the-fly aggregation fallback when candles are absent, so a fresh install
charts correctly from its first snapshot.

## Collection

`snapshotMarket` (`src/lib/jobs/ingest.ts`) sweeps every resource in the catalog and
writes one summary row each.

**One timestamp for the whole sweep.** Every row in a sweep shares `observed_at`, so a
cross-sectional query returns a coherent picture rather than a smear across several
minutes. This is what makes "top gainers" comparable between products.

**Failures are per-resource.** One bad response does not abandon the sweep; the count
is recorded in `job_runs.detail`.

**Exactly one collector.** A Postgres advisory lock guarantees it across replicas and
through a rolling deploy. Two collectors would double our request rate against the
game's servers, which is the one thing this system must never do.

Default cadence is 15 minutes (`MARKET_SNAPSHOT_INTERVAL_MINUTES`). Raise it if you
run many products or want to be gentler; nothing in the product assumes a specific
interval.

## What a snapshot holds

| Field | Meaning |
| --- | --- |
| `lowest_price` | Cheapest open offer — the headline price |
| `highest_price` | Dearest open offer |
| `median_price` | Middle of the book by listing |
| `weighted_average_price` | Quantity-weighted mean |
| `total_quantity` | Units on offer across all qualities |
| `offer_count` | Number of listings |
| `prices_by_quality` | Cheapest offer satisfying each quality level |

Two decisions here are load-bearing and are surfaced in the UI's methodology notes:

**Price at quality Q is the cheapest offer of quality ≥ Q**, not exactly Q. A buyer
needing at least Q is satisfied by anything better, so the effective price is the
cheapest acceptable offer. Exact-match pricing would overstate the cost of quality
whenever a cheap better-quality lot exists — and it is why a higher quality sometimes
shows a *lower* price than the one below it.

**Averages are quantity-weighted.** A single unit listed at an absurd price should not
move the average as much as a 10,000-unit lot at the going rate.

## Downsampling

`buildCandles` aggregates in Postgres — moving rows into Node to reduce them would be
the same work plus a network transfer.

- Runs every 30 minutes over a trailing window (10 days for hourly, 120 for daily), so
  its cost stays flat as history grows and a job that has been failing for a while
  repairs itself on the next success.
- Buckets are upserted, so re-running is safe and idempotent.
- Qualities 0–5 only. Every quality would multiply the table for series almost nobody
  charts; raw snapshots retain all of them.
- `sample_count` records how many observations a bucket was built from. A candle from
  two samples is not the same claim as one from twelve.

## Retention

| Data | Kept | Why |
| --- | --- | --- |
| Raw snapshots | 21 days | Enough for high-resolution recent charts; the expensive rows |
| 1h candles | 400 days | Covers a year of intraday detail |
| 1d candles | Indefinitely | Cheap, and unreconstructable once raw rows are gone |

Constants in `src/lib/jobs/ingest.ts`. **Never shorten daily-candle retention without
a backup** — that data cannot be re-fetched from anywhere.

## Derived statistics

All in `src/lib/market/statistics.ts`, and all refuse to answer when the data cannot
support an answer.

**Price change** compares the latest observation against the one closest to the
requested age, and only if it falls within a tolerance band (±50% of the window by
default). A "24h change" computed from points three days apart is worse than no number,
because it looks authoritative. Outside the band the UI shows a dash.

**Volatility** is the standard deviation of period-over-period *returns*, as a
percentage, so a $0.50 product and a $500 product compare directly.

**Liquidity (0–100)** combines depth with breadth, logarithmically. Ten thousand units
from one seller is more fragile than the same volume across forty — one withdrawal
empties the book. The difference between 10 and 100 units matters far more than between
10,000 and 10,090, hence the log.

**Traded volume is not available.** The API exposes open offers, not completed trades,
so supply and listing depth are proxies. The `market-ticker` endpoint may expose real
trades; see the research doc's open questions.

## Failure modes and what the reader sees

| Failure | Behaviour | Shown as |
| --- | --- | --- |
| One resource fails mid-sweep | Others continue | Older `observed_at` on that product |
| Whole sweep fails | Previous snapshots stand | Ageing "updated" label, then **Stale** |
| Upstream down for hours | Cache then database fallback | **From our records** badge |
| Empty order book | Recorded as zero offers | `—`, never `$0` |
| Collector stopped | Data ages | Warning on `/status` past 30 and 120 minutes |

The `/status` page is public for exactly this reason: this product asks people to make
in-game money decisions on its numbers, so how current those numbers are should not
require an admin login.

## Running it

```bash
npm run worker                       # long-running scheduler
npm run worker:once                  # one full pass
npm run worker:once snapshot         # just a sweep
npm run worker:once catalog          # just the catalog
npm run worker:once candles prune    # aggregate and prune
```

Both topologies are supported: a persistent worker, or a platform cron invoking
`worker:once`. The advisory lock makes them safe to mix.
