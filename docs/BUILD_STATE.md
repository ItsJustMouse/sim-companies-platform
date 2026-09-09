# Build state

**Last updated:** 2026-09-06 · **Status:** working software, real data flowing end to end

This is the handoff document. Read it before starting work; update it when you finish
something substantial. It should always be able to answer: what exists, why it is built
this way, what works, what is blocked, and what to do next.

---

## Project status

Ledgerforge is a functioning platform, not a scaffold. The vertical slice the brief
asked for is complete and verified running:

```
game catalog → normalisation → cache → database → Exchange → product pages
     → collected history → charts → calculation engine → opportunity scanner
     → calculators → company advisor
```

**Scale:** ~18,300 lines of TypeScript across 28 page routes and 4 API routes,
**201 tests passing**, lint clean, production build verified with and without a
database.

Every page below was loaded in a real browser during development, not just compiled.

---

## What works

### Data layer
- **Upstream client** (`src/lib/upstream/client.ts`) — the single door to the game's
  API. GET-only by construction, process-wide request pacing, in-flight coalescing,
  bounded retries with jittered backoff, circuit breaker, health reporting.
- **Tolerant schemas + normalisation** — accepts unknown fields, requires only what
  makes a row usable, maps unknowns to `null`. Survives upstream drift.
- **SWR cache** over Redis or an in-process map. N concurrent readers → one upstream
  request. Serves labelled stale data through an outage.
- **Three-tier fallback** — cache → upstream → database. Every read degrades rather
  than failing; a production image builds with no database reachable.

### Collection
- **Worker** with Postgres advisory locking: exactly one collector across replicas.
- Catalog sync, market sweep, hourly/daily downsampling, retention, alert evaluation.
- Runs as a persistent process **or** as one-shot invocations from platform cron.
- **Verified:** 29,268 candles built from seeded snapshots; retention pruned correctly;
  chart ranges resolve raw/1h/1d as designed.

### Calculation engine
- One implementation of the production formula, used by every feature that quotes a
  number.
- Every result carries formula, inputs, assumptions and confidence (`Explained<T>`),
  rendered directly by the UI so explanations cannot drift.
- 101 tests over the economics, concentrated on degenerate cases.

### Product surface
| Area | State |
| --- | --- |
| Exchange table | Sort, filter, search, quality selection, watchlists, sparklines |
| Product pages | Price by quality, history chart, production chain, worked profitability |
| Market overview | Gainers, losers, volatility, liquidity, category performance, heatmap |
| Movers | Full table with liquidity alongside movement |
| Opportunity scanner | Live ranking, client-side assumption changes, per-row reasoning |
| Calculators | Eight, all wired to live prices |
| Company advisor | Deterministic, browser-only, evidence on every finding |
| Knowledge centre | Seven original guides with worked examples |
| Buildings | Index and detail, products ranked by current profit |
| Accounts | Magic-link auth, verified end to end in a browser |
| Alerts | Creation, quotas, cooldowns, delivery log |
| Admin | Health, collection status, job history |
| Public status | Freshness and coverage, no login required |
| Export | CSV/JSON with formula-injection protection |
| SEO | Sitemap, robots, canonicals, Open Graph, JSON-LD |

### Charts
Hand-written SVG (`src/components/charts/`). Price chart with crosshair, tooltip,
keyboard navigation, range selection and optional moving average; sparklines; heatmap.
No charting dependency.

---

## Blockers

### 1. No endpoint verified against a live response — **highest priority**

`www.simcompanies.com` is blocked by this build environment's egress policy:

```
curl: (56) CONNECT tunnel failed, response 403
```

Live testing has verified the whole-market ticker, the per-resource full order book,
and the per-resource encyclopedia detail endpoint. The aggregate resource/building
catalog endpoints previously assumed by the project were not verified and remain
disabled.

Recurring market collection therefore uses the verified ticker plus selective
order-book requests. Keep `CATALOG_SYNC_ENABLED=false` until a low-volume aggregate
catalog contract is independently verified. Do not probe guessed endpoints from the
production worker.

Errors of kind `invalid-response` on `/admin` should be treated as an upstream
contract change and investigated before collection is resumed.

### 2. Game artwork — needs a decision from the project owner

No licence or terms clause covering third-party display of game images was found.
Absence of a prohibition is not permission, so nothing is displayed. The site works
without it.

**What is needed:** ask the operators whether hotlinking their asset URLs is
acceptable. That is the smallest ask and the least burden on them. If the answer is no,
`docs/ASSETS.md` specifies exactly what local files would be needed and where.

### 3. Email delivery — needs an SMTP credential

`SMTP_URL` is unset, so magic links are returned to the browser in development and
sign-in is disabled in production. Email alerts report `failed` with the reason rather
than pretending to send. The interface is stable; wiring a transport is one function
body in `src/lib/alerts/deliver.ts`.

**What is needed:** an SMTP credential from any transactional provider, as
`SMTP_URL=smtp://user:password@host:587`. Verify by requesting a sign-in link and
confirming it arrives.

### 4. The Dockerfile is written but unbuilt

No Docker daemon was available in the build environment, so `Dockerfile` has not been
executed. Its content is straightforward — a standard Next.js standalone multi-stage
build — and the standalone server it runs **was** verified directly:

```
$ node .next/standalone/server.js   # with production env
/api/health   200  {"status":"ok","checks":{"database":"ok","cache":"ok",...}}
/admin        307  (redirects when signed out, as designed)
/exchange/... 200
```

**Build it once before relying on it.** Most likely adjustment: the `COPY` lines that
bring `src/`, `scripts/` and `drizzle/` into the runner stage, which exist so the
worker and migrator can run from source via `tsx`.

### 5. Deployment credentials — needed only to go live

Hosting account, managed Postgres, DNS. `docs/DEPLOYMENT.md` has a costed
recommendation (Fly.io + Neon + Upstash, $0–10/month at launch).

---

## Decisions worth not relitigating

Full reasoning in `docs/ARCHITECTURE.md`. Summary:

| Decision | Because |
| --- | --- |
| Modular monolith | No problem here that microservices solve |
| Next.js App Router | Public pages must be server-rendered for SEO; Server Actions removed hand-rolled CSRF |
| Drizzle over Prisma | Typed SQL without a runtime engine between us and the planner |
| **TypeScript 5.9, not 7.0** | TS 7 is stable but `typescript-eslint` and `drizzle-kit` lag. Reliability outranks novelty. Revisit when the ecosystem does |
| Hand-written charts | A library costs 50–150 kB per page for marks we draw in a few hundred lines |
| No queue service | Five periodic jobs, no fan-out. An advisory lock gives the mutual exclusion that matters |
| Redis optional | One instance with an in-process cache is correct and free at launch |
| Auth written here | The game offers no OAuth; the surface is a hashed token in a cookie. Small, tested, reviewed |
| Rules-based advisor | An LLM is not needed to spot an idle building, and would make answers unreproducible and cost per query |
| Company data stays in the browser | The game offers no third-party authorisation, so a server could only read it by holding game credentials. We will not ask |

---

## Known limitations

These are design outcomes, stated in the UI, not defects.

- **History starts when collection did.** The game publishes none. Charts say so.
- **No traded volume.** The API exposes open offers, not completed trades. Supply and
  listing depth are proxies. `/api/v1/market-ticker/` may carry real trades — worth
  investigating.
- **Retail demand is not modelled.** Unpublished and unverifiable, so the calculator
  takes observed throughput and does exact arithmetic around it.
- **Headline prices ignore depth.** The cheapest listing may not cover your volume.
  Liquidity and depth sit next to every price for this reason.
- **Robot wage multiplier and contract transport split are inferred**, labelled as
  such, and default to off/adjustable.
- **Company advisor cannot sync or run while the browser is closed.** The privacy
  trade-off, stated on the page.
- **Fixture data exists** for development. It sets a flag that forces a sample-data
  banner onto every page; a real sync clears it.

## Known bugs

None outstanding. Fixed during this build, each verified by driving the flow rather
than reading the code:

| Bug | Cause |
| --- | --- |
| Charts rendered empty despite held data | History read required candles that no job had built yet |
| Magic links never worked | `consumedAt = NULL`, which is never true in SQL |
| Sign-in spent the token and left the user signed out | Cookies cannot be set during a page render |
| Only one of two idle buildings reported | UI state and its control disagreed about `idle` |
| Redis missed every request after boot | Offline queue disabled during initial connect |
| Production build required runtime secrets | Env guard was not scoped to the build phase |
| Unit counts formatted as currency | Explanation panel used the money formatter for every step |
| "History since" understated our own coverage | Read `min(observed_at)` from raw snapshots only, so retention pruning made the site claim a start date *later* than data the MAX chart draws. Now takes the earlier of snapshots and candles |
| Production env guard blamed the wrong variable | Reported "missing DATABASE_URL" when it was present but set to the development default |

---

## Next steps, in order

1. **Verify the upstream contract.** Run a real catalog sync, correct the research doc,
   remove its caveat. Everything downstream depends on this being right.
2. **Ask about artwork licensing** (`docs/ASSETS.md`). Small ask, large visual payoff.
3. **Encrypt `alerts.destination` at rest.** The column is documented as encrypted; the
   implementation is not there yet. `docs/SECURITY.md` outstanding item 1.
4. **Rate limit the public API routes** (`/api/search`, `/api/history`, `/api/export`).
   Currently unlimited.
5. **Wire SMTP** and turn on email alerts.
6. **Deploy.** `docs/DEPLOYMENT.md` is a runbook, not an outline.
7. **Nonce-based CSP**, removing `'unsafe-inline'` from `script-src`.
8. **Choose a licence.** Not yet decided; the README says so.

### Worth doing, not urgent

- Playwright end-to-end tests for the flows currently verified by hand.
- Multi-realm UI (the data layer already handles realms; the UI assumes realm 0).
- Passkeys alongside magic links.
- Public company lookup wired into the advisor (the endpoint accessor exists).
- Customisable dashboard widgets.

### Deliberately not doing

Forums, chat, comments, social feeds, player messaging. This is a tools and analytics
platform, and adding a community surface would bring moderation obligations that have
nothing to do with what it is for.

---

## Verifying a working copy

```bash
npm install
cp .env.example .env.local
docker compose up -d
npm run db:migrate
npx tsx scripts/seed-fixtures.ts
npm run verify        # typecheck, lint, 201 tests, production build
npm run dev
```

Expect: homepage with market snapshot and movers; Exchange with sortable rows; a
product page charting 30 days; the scanner ranking products; calculators computing;
the advisor reporting idle buildings. A red **sample data** banner on every page is
correct — that is the fixture flag doing its job.
