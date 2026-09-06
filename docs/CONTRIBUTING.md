# Contributing

## Setup

```bash
npm install
cp .env.example .env.local
docker compose up -d              # Postgres + Redis
npm run db:migrate
npx tsx scripts/seed-fixtures.ts  # development data — never in production
npm run dev
```

Without network access to the game's API, the fixture seeder is how you get a working
site. It marks the database with a flag that puts a **sample data** banner on every
page, and a real catalog sync clears it. Do not defeat that flag.

## Before you push

```bash
npm run verify        # typecheck, lint, test, build
```

CI runs the same thing. It should never be the first place a failure appears.

## The rules that are not negotiable

These are the ones that make the product trustworthy. Everything else is style.

**1. Never invent game data.** If a value is unavailable it is `null`, and the UI says
so. A missing price is never `$0`. If you find yourself writing `?? 0` on something
that came from the market, stop.

**2. Every displayed number must be explainable.** Calculations return `Explained<T>`
carrying formula, inputs, assumptions and confidence. Do not add a number to a page
that a reader cannot trace.

**3. Game constants carry provenance.** Nothing enters `src/lib/game/constants.ts`
without a source and a confidence rating. Prefer fetching from the game's encyclopedia
over hard-coding anything at all.

**4. Only `src/lib/upstream/client.ts` calls the game's API.** It is GET-only, paced
and circuit-broken deliberately. Adding a `fetch` elsewhere breaks a commitment made in
`docs/SIMCOMPANIES_API_RESEARCH.md`.

**5. Fixtures must never look real.** The `fixture_data` flag drives a site-wide
banner. Leave it alone.

**6. Never ask for a player's game credentials.** No password field, no session-cookie
paste, no "just for this one feature". The reasoning is in `docs/SECURITY.md`.

## Conventions

**Comments explain why.** The code already says what it does. A comment earns its place
by recording a decision, a trade-off, or a trap — not by narrating the line below it.

```ts
// Good: records a decision a reader would otherwise second-guess.
// Unmeasurable rows sink in both sort directions: "unknown" is not the smallest
// value, and floating it to the top would misrepresent the market.

// Bad: says what the code says.
// Sort the rows.
```

**Structure.** Services orchestrate, repositories query, components render. A component
never queries; a repository never decides policy.

**Types.** `strict` plus `noUncheckedIndexedAccess`. `any` is a lint error. Validate
every external input with Zod — API responses, form data, environment, browser storage.

**Naming.** `camelCase` in TypeScript, `snake_case` in SQL. Say what a thing is:
`profitPerHour`, not `pph`.

## Testing

Test what breaks in production, not what is easy to test.

- **Degenerate inputs first.** Zero, negative, missing, extreme. Most of the calculation
  bugs worth catching live there.
- **Round trips for derived values.** A break-even price should produce exactly zero
  profit when fed back in. Assert it.
- **Security boundaries get adversarial tests.** The SSRF and CSV-injection suites test
  what must be *rejected*, not what should pass.
- **Name tests as behaviour**: `it('returns null rather than Infinity when nothing is
  produced')`, not `it('works')`.

Fixtures use round numbers so expectations can be checked by hand.

## Pull requests

Say what changed and why. If you made a trade-off, name it — that is the part a reviewer
cannot reconstruct from the diff.

- Run `npm run verify`.
- Update `docs/BUILD_STATE.md` for anything substantial.
- Update the relevant doc when you change behaviour it describes.
- No secrets, ever. `.env.local` is ignored; keep it that way.

## Where things are

| Looking for | Go to |
| --- | --- |
| What exists and what is next | `docs/BUILD_STATE.md` |
| Why it is built this way | `docs/ARCHITECTURE.md` |
| What we know about the game's API | `docs/SIMCOMPANIES_API_RESEARCH.md` |
| A formula | `src/lib/calc/`, described in `docs/CALCULATORS.md` |
| Schema and indexes | `docs/DATABASE.md` |
| Threat model | `docs/SECURITY.md` |
