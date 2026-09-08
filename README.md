<div align="center">
  <img src="public/logo-mark.svg" width="72" height="72" alt="">
  <h1>Ledgerforge</h1>
  <p><strong>Price the market. Plan the production.</strong></p>
  <p>Independent market intelligence, analytics and production tools for <em>Sim Companies</em> players.</p>
</div>

---

> **Not affiliated with Sim Companies.** Ledgerforge is an independent, unofficial
> companion tool. All game names, marks and content belong to their respective owners.

## What it does

Working out whether a production line is worth running currently means a spreadsheet,
several browser tabs, and arithmetic that is easy to get subtly wrong. Ledgerforge does
that arithmetic once, correctly, and shows its working.

- **Exchange** — every product with live price, supply, listing depth, movement,
  volatility and a liquidity score.
- **Price history** — the game publishes none, so we collect our own and chart it.
- **Opportunity scanner** — every product ranked by what it would actually earn you,
  with the cost breakdown and the reasons for its ranking.
- **Eight calculators** — production, buy-or-build, break-even, retail, quality, ROI,
  loans and capital allocation. Each shows its formula and assumptions.
- **Company advisor** — describe your buildings, get numbered findings. Runs in your
  browser; nothing is sent to us.
- **Beginner centre** — seven guides written for someone who has never calculated a
  margin.

## The principles

**Never invent data.** An unknown price renders as `—`, never `$0.00`. A percentage
change with no comparable observation is a dash. Where the game publishes no mechanic,
we say we inferred it and rate our confidence — publicly, at `/methodology`.

**Every number is checkable.** Calculations return their formula, inputs, assumptions
and confidence alongside the result. No black box, and no AI guessing.

**Light on the game's servers.** One collector serves the whole site. Ten thousand
people reading a product page produce at most one upstream request. The API is
undocumented and unsupported, and its operators ask third parties not to poll hard —
that constraint shaped the entire architecture.

**Minimal data about you.** Most of the site needs no account. Watchlists and your
company workspace live in your browser. We never ask for your Sim Companies login, and
[`docs/SECURITY.md`](docs/SECURITY.md) explains why we never will.

## Quick start

```bash
npm install
cp .env.example .env.local
docker compose up -d              # Postgres + Redis
npm run db:migrate
npx tsx scripts/seed-fixtures.ts  # development data (marks itself as sample data)
npm run dev
```

Then <http://localhost:3000>.

With real network access, enable upstream access only for the collector process.
`npm run worker:once snapshot` consumes one coordinated market-collection slot;
the long-running worker continues collection on the configured schedule. Catalog
sync remains disabled until its aggregate upstream endpoints are verified.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run verify` | Typecheck, lint, test, build — run before committing |
| `npm run test` | Vitest |
| `npm run db:migrate` | Apply migrations |
| `npm run worker` | Long-running collector |
| `npm run worker:once [steps]` | Run selected maintenance steps; `snapshot` means one coordinated market-collection slot |

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 ·
PostgreSQL with Drizzle · Redis (optional) · Zod · Vitest · Docker

Charts are hand-written SVG — a library would cost 50–150 kB on every page that shows
one, for marks we can draw in a few hundred lines. The reasoning behind every such
choice is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Documentation

**Start with [`docs/BUILD_STATE.md`](docs/BUILD_STATE.md)** — what exists, what works,
what is blocked, what is next.

| Document | Covers |
| --- | --- |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | Structure, and why each major choice was made |
| [SIMCOMPANIES_API_RESEARCH](docs/SIMCOMPANIES_API_RESEARCH.md) | Endpoints, policy limits, what is verified and what is not |
| [CALCULATORS](docs/CALCULATORS.md) | Every formula, its inputs and its confidence |
| [DATABASE](docs/DATABASE.md) | Schema, indexes, retention, backups |
| [MARKET_DATA](docs/MARKET_DATA.md) | Collection, downsampling, statistics |
| [SECURITY](docs/SECURITY.md) | Threat model and controls |
| [DEPLOYMENT](docs/DEPLOYMENT.md) | Hosting, environment, releases, costs |
| [SEO](docs/SEO.md) | Indexing strategy |
| [ASSETS](docs/ASSETS.md) | Game artwork status — currently blocked on licensing |
| [CONTRIBUTING](docs/CONTRIBUTING.md) | Setup and the rules that are not negotiable |

## Status

Working software with real data flowing end to end. Two things are outstanding and
documented rather than hidden:

1. **No endpoint has been verified against a live response.** The build environment
   blocks the game's domain, so paths and field shapes come from community sources. The
   ingestion layer is built to tolerate being wrong, but confirming it is the first job
   on a machine with network access. See the research doc.
2. **Game artwork is not displayed**, pending a licensing answer. The site works without
   it; [`docs/ASSETS.md`](docs/ASSETS.md) says exactly what would be needed.

## Licence

Not yet chosen. See `docs/BUILD_STATE.md`.
