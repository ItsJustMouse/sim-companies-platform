# Calculators and the calculation engine

## One implementation, everywhere

Every profitability figure on the site — the scanner, the calculators, the product
pages, the advisor, the building pages — resolves to `calculateProduction` in
`src/lib/calc/production.ts`. There is exactly one implementation of the formula, so a
correction there corrects the whole product at once.

The alternative — a bit of arithmetic in each component — is how a site ends up
quoting two different profits for the same product on two different pages.

## Every result explains itself

```ts
interface Explained<T> {
  result: T;
  inputs: CalcInput[];         // value, unit, and where it came from
  steps: CalcStep[];           // human-readable formula per step
  assumptions: CalcAssumption[]; // with a confidence rating
  warnings: string[];          // what should give the reader pause
  calculatedAt: string;
}
```

`ExplanationPanel` renders this structure directly, so an explanation cannot drift out
of sync with the number it explains. This is the mechanism behind the product's core
promise: nothing here is unexplainable, and every inferred mechanic is labelled as
inferred.

## The core formula

```
unitsPerHour      = baseUnitsPerHour x buildingLevel x (1 + productionBonus) x abundance
hourlyWages       = wagesPerHourPerLevel x buildingLevel x (robots ? robotMultiplier : 1)
labourPerUnit     = hourlyWages / unitsPerHour x (1 + adminOverhead)
inputCostPerUnit  = sum(inputAmount x inputUnitPrice)
transportPerUnit  = transportUnits x transportUnitCost x (contract ? contractShare : 1)
netRevenuePerUnit = salePrice x (exchange ? 1 - exchangeFee : 1)

profitPerUnit     = netRevenuePerUnit - inputCostPerUnit - labourPerUnit - transportPerUnit
profitPerHour     = profitPerUnit x unitsPerHour
breakEvenPrice    = totalCostPerUnit / (exchange ? 1 - exchangeFee : 1)
```

**Building level cancels out of profit per unit** — it scales output and wages
equally — but not out of profit per hour. Both are always reported, because per-hour is
what fills a bank account and per-unit is what people instinctively compare.

Confidence in each constant is in `src/lib/game/constants.ts` and published at
`/methodology`. Building wages, production rates, recipes and costs are never
hard-coded; they come from the game's own encyclopedia, so a balance patch flows
through without a code change.

## The rules the engine follows

**Unknown is `null`, and it propagates.** One unpriced input makes `inputCostPerUnit`,
`totalCostPerUnit` and `profitPerUnit` all `null`, with a warning naming the input.
Treating a missing price as zero would report a loss-making line as profitable.

**Degenerate inputs do not produce infinities.** Zero output would make
`wages / unitsPerHour` infinite and poison everything downstream, so the engine stops
early with an explained result. Negative building levels clamp to zero.

**Losses are reported as losses.** Nothing clamps at zero.

**Break-even is exact.** Feeding `breakEvenSalePrice` back in yields a profit of zero
to nine decimal places — asserted in the tests, because a break-even price that is
merely close is a break-even price that is wrong.

## The eight calculators

| Calculator | Question | Notes |
| --- | --- | --- |
| **Production** | What does this cost me and what do I earn? | Prefilled from live prices; every field overridable |
| **Buy or build** | Buy this input or make it? | Shows the naive answer and the honest one side by side |
| **Break-even** | Cheapest sale, dearest input? | Per-input ceilings holding the others constant |
| **Retail** | Retail or Exchange? | Takes observed throughput; does not model demand |
| **Quality** | Is higher quality worth it? | Premium read from live listings, not assumed |
| **ROI** | Is this build worth it? | Construction time counted against the return |
| **Loan** | Should I borrow? | States the profit per hour needed to break even |
| **Allocation** | Where should the money go? | Opportunity cost of each alternative made explicit |

### Buy or build is the one that matters most

It is the calculation players most often get wrong, always the same way: comparing the
*cash cost* of self-production against the market price while ignoring what the
building could have been doing instead.

```
True cost of making it = productionCost + (alternativeProfitPerHour / unitsPerHour)
```

The tool reports the naive recommendation, the honest one, and flags loudly when they
disagree — because that gap is the entire lesson. It also warns when no alternative
was supplied, since treating a building's time as free is only correct if it would
genuinely sit idle.

### Retail: the boundary we will not cross

How a store's sale rate responds to price, quality and local demand is not published
anywhere we could verify. Inventing a demand curve would produce confident numbers
with nothing behind them.

So the calculator takes the throughput the player observes in their own store and does
exact arithmetic around it: margin, profit per hour, and the comparison against the
Exchange net of its fee — including the throughput at which retail starts winning. The
modelled part is arithmetic we can stand behind; the empirical part is measured by the
person who can actually see it. The page says this at the top.

## Testing

101 tests across `src/lib/calc/`. Fixtures use round numbers so every expectation can
be verified by hand from the formula above. They are not real game data.

Coverage focuses on what goes wrong in production:

- **Zero and negative:** zero output, zero level, zero base rate, negative level, zero
  interest term, zero-capital option.
- **Missing data:** unpriced inputs, empty order books, absent alternatives, missing
  quality prices.
- **Round trips:** break-even prices produce zero profit; maximum input prices produce
  zero profit; break-even throughput makes retail and Exchange tie.
- **Sign correctness:** losses report as losses; a profit-reducing investment never
  pays back (`null`, not a large number).
- **Extremes:** prices at 1e12 stay finite.
- **Explanation integrity:** every result carries inputs, steps and assumptions;
  assumptions never repeat.

## Adding one

1. Write the maths in `src/lib/calc/`, returning `Explained<T>`. Add tests first —
   especially the degenerate cases.
2. Register it in `src/lib/calculators/catalog.ts`. That one entry drives the index
   page, site search, footer links and cross-linking between related tools.
3. Add a page under `src/app/calculators/<slug>/` using `CalculatorShell`.
4. If it needs market data, load it with `loadCalculatorData()` and pass it to a client
   component. The whole catalog with prices is a few tens of kilobytes, so switching
   product is instant and costs no upstream traffic.

**Do not** add a calculator that duplicates arithmetic living elsewhere. Extend the
engine and let both call it.
