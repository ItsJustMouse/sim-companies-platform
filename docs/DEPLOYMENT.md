# Deployment

## The shape that matters

Two processes, one database:

| Process | Scales with | Count |
| --- | --- | --- |
| **Web** | Traffic | As many as needed |
| **Worker** | Nothing | **Exactly one** |

The worker is the only thing that talks to the game's API on a schedule. A Postgres
advisory lock makes a second worker harmless rather than harmful, but the intended
topology is one. Two collectors would double our request rate against servers whose
operators asked third parties to be gentle.

This is also why the product is cheap to run: market data is identical for every
visitor, so read traffic scales while upstream traffic stays flat.

## Recommended: Fly.io + Neon + Upstash

| Component | Service | Cost at launch |
| --- | --- | --- |
| Web | Fly.io, 1–2 shared-cpu-1x | $0–5/mo |
| Worker | Fly.io, 1 shared-cpu-1x | $2/mo |
| Postgres | Neon | $0 (free tier) |
| Redis | Upstash | $0 (free tier) |
| DNS/CDN | Cloudflare | $0 |
| **Total** | | **$0–10/mo** |

**Why this over Vercel:** Vercel is excellent for the web tier, but the worker is a
long-running process, which its serverless model does not fit. Splitting the worker
onto a second provider adds an account and a deploy pipeline to save nothing. Fly runs
both from one Dockerfile with one deploy.

**Why Neon:** scale-to-zero suits a workload whose write rate is one sweep per 15
minutes, and branching makes migration testing genuinely easy.

**Why Upstash:** per-request pricing suits bursty cache traffic. Redis is optional
anyway — a single web instance is correct with the in-process cache.

### Alternatives worth considering

| Option | When it wins | Watch out for |
| --- | --- | --- |
| Railway | Simplest possible setup; both processes plus Postgres in one project | Costs more as you grow |
| Vercel + a worker elsewhere | Best-in-class web performance and preview deploys | Two providers; function timeouts |
| Single VPS (Hetzner ~€5) | Cheapest at scale; no vendor lock-in | You own backups, patching and uptime |
| AWS/GCP | Existing organisational commitment | Substantial complexity for this workload |

## Environment

Every variable is documented in `.env.example` and validated at startup by
`src/lib/env.ts`, which **refuses to boot** in production on development defaults.

Required in production:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Rejected if it points at the local default |
| `AUTH_SECRET` | 32+ bytes. `openssl rand -base64 48` |
| `APP_URL` | Real https origin. Used for cookies, sitemap and magic links |

Worth setting: `REDIS_URL` (before scaling past one web instance), `SMTP_URL` (sign-in
is disabled in production without it), `ADMIN_EMAILS`, `SIMCOMPANIES_USER_AGENT` with a
real contact URL.

**On the worker only:** `WORKER_ENABLED=true`. Web instances must leave it false, or
every replica collects duplicate snapshots.

## Docker

`Dockerfile` builds a multi-stage image using Next's standalone output (~150 MB). The
same image runs both processes:

```bash
docker build -t simconomist .

# Web
docker run -p 3000:3000 --env-file .env.production simconomist

# Worker
docker run --env-file .env.production -e WORKER_ENABLED=true simconomist npm run worker
```

Local development uses `docker compose up -d` for Postgres and Redis, with the app on
the host so hot reload stays fast.

## Release procedure

```bash
npm run verify                 # typecheck, lint, test, build
npm run db:migrate             # BEFORE the new version serves traffic
# deploy web
# deploy worker
curl -fsS https://<host>/api/health
```

Migrations are additive and backwards-compatible, so a brief overlap of versions is
safe. **Do not** deploy a version that reads a column its migration has not created.

### Bootstrapping a fresh deployment

```bash
npm run db:migrate
npm run worker:once snapshot    # consume one coordinated market-collection slot
npm run worker:once candles     # aggregate any observations already available
```

Catalog sync is intentionally disabled until its aggregate upstream endpoints are
verified. The market ticker can create partial resource rows as live market data
arrives, so a fresh deployment does not need to force catalog collection first.

A single `snapshot` invocation does not sweep every realm or product. The
coordinator chooses one overdue realm ticker or one deep order-book target, and the
long-running worker fills the dataset over time. Charts therefore fill in gradually;
the site is honest about the short history in the meantime.

## Health and monitoring

- `/api/health` — liveness and dependency status for uptime checks.
- `/status` — public data freshness. Alert if the last snapshot exceeds 60 minutes.
- `/admin` — job history, upstream circuit state, latency, failure counts.

Structured JSON logs go to stdout; ship them wherever you like. The logger redacts
credential-shaped keys defensively, but the rule is that secrets never reach it.

**The alert that matters most:** last snapshot older than 60 minutes. Everything else
degrades visibly; a stopped collector degrades silently.

## Backups

Managed Postgres point-in-time recovery covers the general case. Take a separate
history-only dump anyway:

```bash
pg_dump "$DATABASE_URL" --format=custom \
  --table=market_snapshots --table=market_candles --file=history.dump
```

Market history is the only data that cannot be rebuilt — the game publishes no
history, so what we did not record is gone. Test a restore before you need one.

## Scaling path

| Users | Change | Added cost |
| --- | --- | --- |
| 100 | Nothing. One web, one worker, free tiers | $0–10/mo |
| 1,000 | Add Redis so caching is shared; 2 web instances | $15–25/mo |
| 10,000 | Larger Postgres; CDN caching on public pages; read replica | $50–100/mo |
| 100,000 | Partition snapshots by month or move to Timescale; multi-region web | $200–400/mo |

Nothing here needs re-architecting to get from the first row to the last. The single
collector stays single the whole way — that is the property that keeps costs flat.

### Cost drivers, largest first

1. **Database storage and IOPS.** Snapshot volume. Managed by retention.
2. **Bandwidth.** Mitigated by CDN caching on public pages.
3. **Compute.** Modest — pages are cached and the worker is idle most of the time.
4. **Email.** Only for alerts and sign-in. Free tiers cover a long way.
5. **Redis.** Optional until multi-instance.

Upstream API usage does **not** scale with users, by design.

### If costs need cutting

- Raise `MARKET_SNAPSHOT_INTERVAL_MINUTES` from 15 to 30 — halves snapshot growth,
  costs a little chart resolution.
- Shorten raw snapshot retention below 21 days.
- Reduce candle qualities from 0–5 to 0–2.
- Increase page `revalidate` windows.

Do **not** cut daily-candle retention. That is the irreplaceable dataset.
