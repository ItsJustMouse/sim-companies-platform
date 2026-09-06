# Architecture

## What this is

A modular monolith: one Next.js application plus one background worker, sharing a
library layer and a Postgres database. There are no microservices, no message broker
and no service mesh, because there is no problem here that one would solve.

```
┌─────────────────┐        ┌──────────────────┐
│  Web (Next.js)  │        │  Worker (Node)   │
│  App Router     │        │  scheduler       │
└────────┬────────┘        └────────┬─────────┘
         │                          │
         └────────────┬─────────────┘
                      │
        ┌─────────────▼──────────────┐
        │  src/lib — the whole domain│
        │  upstream · cache · calc   │
        │  market · catalog · advisor│
        └─────────────┬──────────────┘
                      │
        ┌─────────────┼──────────────┐
        ▼             ▼              ▼
   ┌─────────┐  ┌──────────┐  ┌─────────────┐
   │ Postgres│  │  Redis   │  │ Sim Cos API │
   │         │  │(optional)│  │  read-only  │
   └─────────┘  └──────────┘  └─────────────┘
```

Both processes import the same `src/lib`. A calculation behaves identically whether it
runs in a page, an API route or a background job, because there is only one of it.

## The rules that shape everything

### 1. One door to the upstream API

`src/lib/upstream/client.ts` is the only code permitted to call the game's servers.
Everything else goes through it. That centralisation is what makes the following
possible at all:

- a process-wide minimum interval between requests
- in-flight de-duplication
- a circuit breaker that stops hammering a failing upstream
- GET-only by construction — there is no write path to misuse

The API is undocumented and unsupported, and its operators ask third parties not to
poll aggressively (`docs/SIMCOMPANIES_API_RESEARCH.md`). Scattering `fetch` calls
across components would make that impossible to honour, and impossible to audit.

### 2. Unknown is `null`, never zero

A missing price renders as `—`, never `$0.00`. A percentage change with no comparable
observation is a dash, not `0%`. An unmeasurable row sinks to the bottom of a sort in
**both** directions rather than ranking as the smallest value.

This runs from the normalisation layer through the calculation engine to the
formatters, and it is the difference between a tool that says "I don't know" and one
that quietly lies.

### 3. Every number is explainable

Calculations return `Explained<T>` (`src/lib/calc/types.ts`): the result plus its
inputs, the formula for each step, the assumptions used and our confidence in each.
The UI renders that structure directly, so an explanation cannot drift out of sync
with the number it explains.

### 4. Degrade, do not fail

Every read path has a fallback and every layer has an answer for "the thing below me
is down":

| Failure | Behaviour |
| --- | --- |
| Upstream slow | Cached value served, background refresh |
| Upstream down | Last known value, labelled **stale** |
| Cache down | Straight to the database, logged as a warning |
| Database down | Empty state with a banner, never a 500 |
| Upstream shape changed | Non-retryable error, surfaced to admin |

A public page showing a labelled old number is far better than a 500. This also means
a production image builds with no database reachable at all.

## Layout

```
src/
├── app/                    Routes. Server Components by default.
│   ├── exchange/           Market table and product pages
│   ├── market/             Overview, movers, heatmap
│   ├── opportunities/      Scanner
│   ├── calculators/        Eight tools
│   ├── company/            Advisor (client-side)
│   ├── learn/              Knowledge centre
│   ├── account/            Auth and alerts
│   ├── admin/              Operational dashboard
│   └── api/                Search, history, export
├── components/             Presentation only. No data fetching.
├── lib/
│   ├── upstream/           The single door to the game API
│   ├── cache/              SWR over Redis or memory
│   ├── db/                 Schema, client, flags
│   ├── catalog/            Game catalog: repository + service
│   ├── market/             Prices, statistics, history, scanner
│   ├── calc/               The calculation engine
│   ├── advisor/            Deterministic company advice
│   ├── alerts/             Evaluation and delivery
│   ├── auth/               Sessions and magic links
│   ├── jobs/               Job runner with advisory locking
│   ├── content/            Guides
│   └── util/               Formatting, logging, CSV, rate limiting
└── worker/                 Scheduler entry points
```

**Services orchestrate; repositories talk to the database; components render.** A
component never queries, and a repository never decides policy.

## Decisions worth recording

### Next.js App Router

Public pages must be server-rendered for SEO — indexable product pages are the growth
strategy — and most of this site is read-mostly data that benefits from caching at the
route level. The App Router gives per-route revalidation, streaming, and Server
Actions with built-in origin checks, which removed the need to hand-roll CSRF.

### Drizzle over Prisma

Every non-trivial query here is a hand-tuned aggregate. Drizzle gives typed SQL
without a runtime query engine between us and the planner, and its migrations are
plain SQL we can read. Prisma's client generation and engine binary would be cost
without benefit at this shape.

### TypeScript 5.9, not 7.0

TypeScript 7 is the current stable release, but `typescript-eslint` and `drizzle-kit`
have not caught up. Reliability outranks novelty in this project's stated priority
order. Revisit when the ecosystem does.

### Charts written by hand

A charting library costs 50–150 kB on every page that shows a chart, and theming a
third-party renderer to match our tokens is more work than drawing the marks. We need
a price line, a sparkline and a heatmap; those are a few hundred lines of SVG in
`src/components/charts/`, fully themeable and SSR-friendly.

### No queue service

Five periodic jobs, no fan-out, no priorities, no retry-with-backoff semantics. A
Postgres advisory lock provides the mutual exclusion that actually matters — exactly
one collector, even across replicas — and `job_runs` provides the audit trail. BullMQ
or pg-boss would add a broker, a schema and a set of failure modes to earn nothing.

### Redis optional

At launch, one instance with an in-process cache is correct and free. `REDIS_URL`
switches to a shared cache when there is more than one instance to share it between.
The trade-off is documented rather than pre-solved.

### Auth written here, not bolted on

Magic links only, no passwords. Auth.js brings provider plumbing we cannot use — the
game offers no OAuth — for a surface that is a hashed token in an HttpOnly cookie. The
implementation is small, tested, and reviewed in `docs/SECURITY.md`. Passkeys are the
intended next step and fit the same session model.

### The advisor is rules-based

An LLM is not required to notice an idle building or a line below break-even. Making
one a dependency would put a per-query cost on the most-used feature and make its
answers unreproducible. `AdviceContext → AdviceResult` (`src/lib/advisor/advise.ts`)
is a clean seam: a conversational layer would consume that output, not replace it.

## Extending it

**A new calculator:** add the maths to `src/lib/calc/` with tests, register it in
`src/lib/calculators/catalog.ts` (which drives the index, search and cross-links), then
add a page using `CalculatorShell`.

**A new alert channel:** add a case in `src/lib/alerts/deliver.ts`. If it takes a
user-supplied URL, validate the host on **every send**, not just on save — see
`validateDiscordWebhook` and the SSRF tests beside it.

**A new upstream endpoint:** add a tolerant schema, a normaliser mapping it to domain
types, and an accessor in `src/lib/upstream/api.ts`. Nothing else changes.

**A native mobile app:** the API routes under `src/app/api/` already return clean JSON
from the same services the pages use. That is the integration surface; no additional
backend is required.
