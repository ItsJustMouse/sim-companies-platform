# Simconomist — working notes for contributors and agents

Independent market intelligence, analytics and production tools for **Sim Companies**
players. Not affiliated with the game's operators.

## Read this first

**`docs/BUILD_STATE.md` is the source of truth** for what exists, what works, what is
blocked and what to do next. Read it before starting any work; update it when you
finish a milestone.

Supporting documents:

| Document | Covers |
| --- | --- |
| `docs/ARCHITECTURE.md` | Structure and the reasoning behind the major choices |
| `docs/SIMCOMPANIES_API_RESEARCH.md` | Upstream endpoints, policy limits, what is verified and what is not |
| `docs/CALCULATORS.md` | Every formula, its inputs and its confidence level |
| `docs/DATABASE.md` | Schema, indexes, retention |
| `docs/MARKET_DATA.md` | Snapshot and downsampling pipeline |
| `docs/SECURITY.md` | Threat model and controls |
| `docs/DEPLOYMENT.md` | Hosting, environment, migrations, costs |
| `docs/SEO.md` | Indexing strategy |
| `docs/ASSETS.md` | Game artwork status and what is needed |

## Non-negotiable rules

1. **Never invent game data.** If a value is not available, it is `null` and the UI
   says so. A missing price is never rendered as `$0`.
2. **Never let fixtures look real.** `scripts/seed-fixtures.ts` sets the `fixture_data`
   flag, which forces a sample-data banner onto every page. Do not bypass it.
3. **Only `src/lib/upstream/client.ts` may call the game's API.** It is GET-only,
   paced and circuit-broken on purpose. See the policy notes in the research doc.
4. **Every displayed number must be explainable.** Calculations return
   `Explained<T>` carrying formula, inputs, assumptions and confidence.
5. **Game constants carry provenance.** Add nothing to `src/lib/game/constants.ts`
   without a source and a confidence rating.

## Commands

```bash
npm run dev            # development server
npm run verify         # typecheck + lint + test + build (run before committing)
npm run db:migrate     # apply migrations
npm run worker:once    # run one ingestion pass
npx tsx scripts/seed-fixtures.ts   # development data (never in production)
```

Local datastores: `docker compose up -d`, or a native Postgres/Redis on the
default ports.
