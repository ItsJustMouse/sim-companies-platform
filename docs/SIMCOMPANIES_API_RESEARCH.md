# Sim Companies API research

**Status:** partially verified. Read the confidence markers — they are the point of
this document.

Every endpoint, field and formula below is tagged:

| Tag | Meaning |
| --- | --- |
| **[VERIFIED]** | Confirmed against a live response or an official statement. |
| **[REPORTED]** | Documented consistently by multiple independent community sources. |
| **[INFERRED]** | Our reading of indirect evidence. Could be wrong. |
| **[UNKNOWN]** | We do not know, and have not guessed. |

---

## 1. The single most important caveat

**No live request to `www.simcompanies.com` was made during this project's
development.** The build environment's egress policy blocks the host:

```
$ curl https://www.simcompanies.com/api/v3/market/0/1/
curl: (56) CONNECT tunnel failed, response 403
```

Confirmed by the proxy's own diagnostics:

```json
{ "kind": "connect_rejected",
  "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)",
  "host": "www.simcompanies.com:443" }
```

So **no response shape in this document has been observed directly by us**. Paths and
field names were reconstructed from community documentation and open-source client
code. The application is built to survive being wrong about them:

- Schemas accept unknown keys and require only the handful of fields that make a row
  usable at all (`src/lib/upstream/schemas.ts`).
- A normalisation layer accepts several spellings per concept and maps anything it
  cannot determine to `null` rather than a default (`src/lib/upstream/normalise.ts`).
- A response that fails validation raises a distinct, non-retryable
  `invalid-response` error, surfaced on the admin dashboard, because a shape change
  needs a code change rather than a retry.

**First action on a deployment with real network access:** run
`npm run worker:once catalog` and compare the result against the tables below.
Correct this file with what you find, and remove this caveat when the endpoints are
confirmed.

---

## 2. Policy and terms

Findings from the official API guide (`simcompanies.com/articles/api/`) and community
discussion. The page itself could not be fetched from this environment; these come
from search-result summaries of it, so they are **[REPORTED]** rather than quoted.

| Finding | Confidence | Implication for us |
| --- | --- | --- |
| There is no official support and no official documentation for API use | [REPORTED] | We cannot rely on stability. Hence tolerant schemas and a circuit breaker. |
| Only `GET` is permitted; other methods are forbidden and account activity is monitored for them | [REPORTED] | `SimCompaniesHttpClient` has no write path at all. Not a policy — a missing capability. |
| Guidance not to poll aggressively; roughly **one request per five minutes** is cited | [REPORTED] | Drives the whole caching and collection design. See §5. |
| Excessive load may lead to rate limiting or a block affecting all third-party tools | [REPORTED] | The cost of getting this wrong falls on every tool, not just ours. |

### How the application honours this

- **One collector for the whole site.** A Postgres advisory lock guarantees a single
  sweeping process even across replicas (`src/lib/jobs/runner.ts`).
- **A process-wide request floor.** `UPSTREAM_MIN_INTERVAL_MS` (default 300000 ms / five minutes)
  serialises every outbound call through one pacer.
- **Request coalescing.** N concurrent callers for the same path produce one request.
- **Read-through caching with stale-while-revalidate.** Ten thousand visitors looking
  at grapes in the same minute cause at most one upstream call.
- **Identification.** Every request sends a `User-Agent` naming the project and a
  contact URL, so the operators can reach us rather than only block us.
- **A hard off-switch.** `UPSTREAM_ENABLED=false` stops all outbound traffic and
  serves from cache and database.

### Unresolved policy questions

1. Is periodic snapshotting for a *public* price-history dataset acceptable? Our
   cadence is conservative, but explicit permission has not been sought. **Do this
   before a public launch.**
2. Is there an attribution requirement? None found. **[UNKNOWN]**
3. Are game asset images licensed for third-party display? See `docs/ASSETS.md`.
   **[UNKNOWN]** — and treated as "no" until confirmed.

---

## Live verification log — 2026-09-06/07

Verified directly against `www.simcompanies.com` from a normal networked development machine:

- `GET /api/v4/en/0/encyclopedia/resources/` → **HTTP 404**
- `GET /api/v4/en/0/encyclopedia/resources/0/66/` → **HTTP 200 JSON**
  - Resource 66 = Seeds
  - `producedFrom` includes Water (`db_letter: 2`) at `amount: 0.1`
  - Live field is `producedAt`, e.g. `"P"`
  - Image path is exposed as `images/resources/seeds.png`
- `GET /api/v3/0/buildings/1/` → **HTTP 404**
- `GET /api/v2/buildings/1/` → **HTTP 404**
- `GET /api/v3/market/all/0/66/` → **HTTP 200 JSON**
  - Verified full sell-order book with `kind`, `quantity`, `quality`, `price`,
    `seller`, `posted`, and `fees`
  - Simconomist successfully parsed and normalized 251 live offers during verification

The resource-detail and Exchange paths are therefore verified rather than inferred.
The catalog and building-list integrations still require replacement and must not be
used by the automated worker until resolved.

## 3. Endpoints

Base: `https://www.simcompanies.com`. Realm id is a path segment (`0` = Magnates,
`1` = Entrepreneurs) **[REPORTED]**.

### Used by the application

| Path | Purpose | Confidence | Used in |
| --- | --- | --- | --- |
| `GET /api/v4/{lang}/{realm}/encyclopedia/resources/` | Intended resource catalog | **[VERIFIED 404]** | `fetchResources` — currently broken; replacement needed |
| `GET /api/v4/{lang}/{realm}/encyclopedia/resources/{quality}/{id}/` | One resource including its recipe | **[VERIFIED LIVE]** | `fetchResourceDetail` |
| `GET /api/v3/{realm}/buildings/1/` | Intended building catalog | **[VERIFIED 404]** | `fetchBuildings` — currently broken; replacement needed |
| `GET /api/v3/market/all/{realm}/{resourceId}/` | Open sell offers for one resource | **[VERIFIED LIVE]** | `fetchMarketOffers` |
| `GET /api/v2/companies-by-company/{realm}/{name}/` | Public company profile | [REPORTED] | `fetchPublicCompany` |

### Documented by the community, not used by us

| Path | Purpose | Why unused |
| --- | --- | --- |
| `GET /api/v2/market/{resourceId}` | Older market endpoint | Superseded by the v3 path; no realm segment. |
| `GET /api/v1/market-ticker/{iso8601}` | Recent trades | Would give **real traded volume**, which we currently lack. Worth investigating — see §7. |
| `GET /api/v3/{realm}/encyclopedia/buildings/{kind}/` | Single building detail | The list endpoint already covers our needs. |
| `GET /api/v2/companies/me/`, `/me/buildings/`, `/api/v2/resources/` | The signed-in player's own company | **Requires the player's own session. We do not and will not use these.** See §6. |

### Fields we read

Accepted under several spellings, because the API's own naming varies by version.

**Resource** — `db_letter` \| `id` (required), `name` (required), `image`,
`transportation`, `anHour` \| `producedAnHour`, `retailable`, `research`.
`db_letter` is the identifier every other endpoint expects. **[REPORTED]**

**Building** — `name` (required), `kind`, `cost`, `costUnits`, `wages`,
`secondsToBuild`, `category`, `robotsNeeded`, `production[]`, `retail`. `wages` is
read as an hourly bill per building level. **[REPORTED]**

**Market offer** — `quality`, `price`, `quantity` (all required), `seller`. Offers
missing any required field are discarded rather than defaulted. **[REPORTED]**

---

## 4. Game formulas

The operators publish no specification. What follows is the community-consensus model,
which every independent open-source calculator we examined implements identically.

```
unitsPerHour      = baseUnitsPerHour x buildingLevel x (1 + productionBonus) x abundance
hourlyWages       = wagesPerHourPerLevel x buildingLevel x (robots ? 0.97 : 1)
labourPerUnit     = hourlyWages / unitsPerHour x (1 + adminOverhead)
inputCostPerUnit  = sum(inputAmount x inputUnitPrice)
transportPerUnit  = transportUnits x transportUnitCost x (contract ? 0.5 : 1)
netRevenuePerUnit = salePrice x (exchange ? 0.97 : 1)
profitPerUnit     = netRevenuePerUnit - inputCostPerUnit - labourPerUnit - transportPerUnit
```

| Constant | Value | Confidence | Note |
| --- | --- | --- | --- |
| Exchange seller fee | 3% | [REPORTED] | Consistent across community guides and calculators. |
| Robot wage multiplier | 0.97 | [INFERRED] | Single mechanism, seen in community code only. **Defaults to off.** |
| Contract transport split | 0.5 | [INFERRED] | Implies the counterparty pays half. Exposed as an adjustable input. |

Structural notes:

- Building level scales output and wages equally, so it **cancels out of profit per
  unit** but not profit per hour. Both are always reported.
- Administration overhead multiplies **labour only**, not materials.
- Abundance applies to extraction buildings; 1.0 elsewhere.

These live in `src/lib/game/constants.ts` with their provenance attached, are surfaced
in every calculation result, and are published at `/methodology`. Wage figures,
production rates, recipes and building costs are **never hard-coded** — they are
fetched from the game's own encyclopedia, so a balance patch flows through without a
code change.

### Mechanics we deliberately do not model

- **Retail sale rate.** How a store's throughput responds to price, quality and local
  demand is **[UNKNOWN]**. The retail calculator takes the throughput a player observes
  and does exact arithmetic around it, and says so on the page.
- **Economy phases.** Community sources describe recession/boom wage modifiers with
  per-building percentages. The mechanism is **[INFERRED]** and the numbers are
  third-party derived, so they are not built in. Overhead is a user input instead.
- **Research, executives, transport fleets.** **[UNKNOWN]** in the detail needed to
  model them. Their costs enter as user-supplied figures.

---

## 5. Freshness and history

| Question | Answer |
| --- | --- |
| What does the API expose? | The **current** order book only. |
| Is historical data available? | **No.** [REPORTED] |
| Can we build our own history? | Yes, by snapshotting. This is what the collector does. |
| How fresh is "real time"? | As current as our last sweep — minutes, not seconds. Every price carries its observation time. |

Because the game publishes no history, **every chart on the site is made of data we
recorded**. Series begin when collection began, and the UI says so rather than
implying a longer record. See `docs/MARKET_DATA.md`.

---

## 6. Authentication: what is possible

| Mechanism | Available? |
| --- | --- |
| OAuth / "sign in with Sim Companies" | **No.** [VERIFIED — nothing exists] |
| Third-party API tokens or keys | **No.** [VERIFIED — nothing exists] |
| Public read of a company by name | **Yes**, via `companies-by-company`. [REPORTED] |
| Private company data (`/companies/me/`) | Only with the player's own game session. |

**This is why the company advisor works the way it does.** The only route to a
player's private data is holding their game credentials. We will not ask for those,
and a tool that does is asking for full control of the account. So:

- Company data is entered by the player and stored **in their browser**.
- The advisor runs **client-side** on that data.
- Nothing about a player's company reaches our servers.

The cost — no cross-device sync, no alerts while the browser is closed — is stated on
the page. See `docs/SECURITY.md`.

---

## 7. Open questions

1. **Confirm every endpoint path against a live response.** Nothing here is
   first-hand. Highest priority.
2. **`/api/v1/market-ticker/`** — if it returns completed trades, it gives real traded
   volume, which we currently approximate with supply and listing depth.
3. **Quality range.** We treat quality as a small non-negative integer and derive the
   real maximum from live listings; 12 is only a UI default. **[INFERRED]**
4. **Rate limits.** No published numbers. Our pacing is deliberately conservative
   because we are guessing.
5. **Realm ids beyond 0 and 1.** **[UNKNOWN]** whether more exist.
6. **Asset licensing.** See `docs/ASSETS.md`.

---

## 8. Sources

- Official API guide — `https://www.simcompanies.com/articles/api/` (not directly
  reachable from this environment; summarised via search results)
- `LoganPederson/SimCompaniesCalculator` — endpoint notes
- `Gunak/SimCompanies` — CLI client
- `short-fuss/simco-utils` — price collection
- `GregMartinUCB/Sim-Company-Calculator` — profit formulas
- Community guides and forum discussion of fees and mechanics

Open-source projects were read to learn **which endpoints exist and what the community
consensus on formulas is**. No third-party code, data or design was copied.
