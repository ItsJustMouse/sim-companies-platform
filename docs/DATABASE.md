# Database

PostgreSQL 16+. Schema in `src/lib/db/schema.ts`, migrations in `drizzle/`.

## Why the schema is split the way it is

Five groups, separated because they have different retention rules, different privacy
weight and different growth curves — not for tidiness.

| Group | Tables | Retention | If lost |
| --- | --- | --- | --- |
| Game catalog | `resources`, `buildings`, `recipes` | Rebuilt on every sync | Nothing — re-fetch |
| Market history | `market_snapshots`, `market_candles` | Snapshots ~3 weeks, candles indefinitely | **Irreplaceable** |
| Accounts | `users`, `sessions`, `login_tokens` | Until deleted; sessions expire | Users re-register |
| Workspace | `watchlists`, `alerts`, `alert_events`, `linked_companies`, `company_snapshots` | Until deleted | User-visible loss |
| Operations | `job_runs`, `metric_counters`, `system_flags` | Rolling | Nothing |

The catalog is disposable and the history is not. That distinction drives the backup
policy: **if you back up one thing, back up market history.**

## Market history: the shape that matters

### `market_snapshots` — one row per resource per sweep

The whole order book collapsed to a summary. Storing individual offers would multiply
the row count by two orders of magnitude and add nothing the product plots: offers are
transient, and what we chart is the book's shape over time.

```
PRIMARY KEY (realm_id, resource_id, observed_at)
INDEX       (observed_at)
```

The primary key serves the dominant query — one resource over a time range — directly
and in order. The secondary index serves the cross-sectional query ("everything as of
time T") used by the overview and mover calculations.

`prices_by_quality` is a JSONB document: it is always read whole, never filtered on,
and its keys vary per product. Columns would mean a sparse dozen-column table.

**Growth:** roughly `products × sweeps/day` rows. At 200 products every 15 minutes that
is ~19k rows/day, ~7M/year before pruning. Comfortable for Postgres.

### `market_candles` — downsampled OHLC

```
PRIMARY KEY (realm_id, resource_id, quality, interval, bucket_start)
INDEX       (interval, bucket_start)
```

A one-year chart reads ~365 daily candles instead of ~35,000 snapshots. Built for
qualities 0–5 only: every quality would multiply the table for series almost nobody
charts, and raw snapshots still hold every quality for the rare case.

Reads fall back to aggregating snapshots on the fly when candles are absent, so a
fresh install charts correctly from its first snapshot rather than showing an empty
graph over data it demonstrably holds.

### Why not TimescaleDB

Considered and rejected for now. Its wins — automatic partitioning, compression,
continuous aggregates — start mattering somewhere north of 100M rows. We reach that in
several years, and it would cost a Postgres extension the managed providers charge
extra for, plus a migration path if we ever move. Plain tables with a scheduled
downsampling job give the same read performance at this scale.

**Revisit when** snapshots pass ~50M rows or the downsampling job takes more than a
few minutes. Migration is additive: enable the extension, convert to hypertables,
replace the job with continuous aggregates. No application change.

## Indexes, and why each exists

| Index | Serves |
| --- | --- |
| `resources_realm_slug_idx` (unique) | `/exchange/<slug>` — the hot lookup for every product page |
| `buildings_realm_slug_idx` (unique) | `/buildings/<slug>` |
| `market_snapshots` PK | Chart queries, in sort order |
| `market_snapshots_observed_idx` | Market-wide "as of" queries |
| `market_candles_range_idx` | Range scans within an interval |
| `sessions_user_idx` | "Sign out everywhere" |
| `sessions_expiry_idx` | Expiry sweep |
| `alerts_scan_idx` (enabled, realm, resource) | The evaluator's scan, which is the only frequent alert query |
| `users_email_idx` (unique) | Login, and the constraint that prevents duplicate accounts |

Deliberately **not** indexed: `alert_events` beyond its lookup index (append-mostly,
read rarely), and `metric_counters` beyond its primary key.

## Conventions

- `snake_case` columns, `camelCase` in TypeScript. Drizzle maps between them.
- Timestamps are always `timestamptz`. A naive timestamp in a system whose whole
  purpose is comparing observations across time is a bug waiting to happen.
- Money is `double precision`. Game prices are already floats and are display values,
  not ledger entries; `numeric` would cost arithmetic speed across millions of rows for
  a precision guarantee nothing here needs.
- Composite natural keys where one exists (realm + resource + time). Surrogate ids only
  where rows have no natural identity.
- JSONB for documents that are always read whole and never filtered on.

## Operations

```bash
npm run db:generate            # write a migration from schema changes
npm run db:migrate             # apply pending migrations
npm run db:studio              # browse
```

Migrations are plain SQL in `drizzle/`, reviewed like any other code. Apply them as a
release step **before** the new version starts serving.

### Backup

```bash
# Everything
pg_dump "$DATABASE_URL" --format=custom --file=backup.dump

# The part that matters: history only
pg_dump "$DATABASE_URL" --format=custom \
  --table=market_snapshots --table=market_candles \
  --file=history.dump
```

Restore with `pg_restore --clean --if-exists -d "$DATABASE_URL" backup.dump`.
Managed providers' point-in-time recovery covers the general case; the history-only
dump is worth taking separately because it is the only data that cannot be rebuilt.

### Housekeeping

The `prune-history` job handles retention. Snapshot volume makes autovacuum worth
watching:

```sql
SELECT relname, n_dead_tup, last_autovacuum
FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 10;
```

### Sizing

| Users | Database | Notes |
| --- | --- | --- |
| 100 | 1 GB, shared CPU | Free tiers are fine |
| 1,000 | 5 GB, 1 vCPU | Watch snapshot growth |
| 10,000 | 20 GB, 2 vCPU | Add a read replica for public pages |
| 100,000 | 100 GB, 4+ vCPU | Consider Timescale; partition snapshots by month |

Market data is identical for everyone, so read load scales with traffic while write
load stays flat — one collector, whatever the user count. That is the property that
makes this cheap to run.
