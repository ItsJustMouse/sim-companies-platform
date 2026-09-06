'use client';

import { useMemo, useState } from 'react';
import { evaluateLoan } from '@/lib/calc/investment';
import { Card, CardHeader, Callout } from '@/components/ui/primitives';
import { ExplanationPanel } from '@/components/ui/explanation';
import { Answer, NumberField } from './fields';
import { money } from '@/lib/util/format';

/** Cost of borrowing, and whether the thing you want to fund out-earns it. */
export function LoanCalculator() {
  const [principal, setPrincipal] = useState(100_000);
  const [interestPercent, setInterestPercent] = useState(5);
  const [termDays, setTermDays] = useState(30);
  const [expectedProfit, setExpectedProfit] = useState(0);

  const calculation = useMemo(
    () =>
      evaluateLoan({
        principal,
        interestRate: interestPercent / 100,
        termHours: termDays * 24,
        expectedProfitPerHour: expectedProfit > 0 ? expectedProfit : null,
      }),
    [principal, interestPercent, termDays, expectedProfit],
  );

  const result = calculation.result;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_1fr]">
      <Card>
        <CardHeader title="The loan" />
        <div className="space-y-4 p-4">
          <NumberField label="Amount borrowed" unit="$" value={principal} min={0} max={1e12} step={1000} onChange={setPrincipal} />
          <NumberField
            label="Interest for the whole term"
            unit="%"
            value={interestPercent}
            min={0}
            max={500}
            step={0.1}
            onChange={setInterestPercent}
            hint="The total rate over the term, not an annual rate."
          />
          <NumberField label="Term" unit="days" value={termDays} min={1} max={3650} step={1} onChange={setTermDays} />
          <NumberField
            label="Expected profit from the borrowed money"
            unit="$/hour"
            value={expectedProfit}
            min={0}
            max={1e9}
            step={1}
            onChange={setExpectedProfit}
            hint="What the funded investment is expected to earn each hour. Leave at 0 to see the cost of the debt alone."
          />
        </div>
      </Card>

      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Answer label="Total interest" value={money(result.totalInterest)} sub={`Repay ${money(result.totalRepayment)}`} />
          <Answer
            label="You must earn at least"
            value={`${money(result.requiredProfitPerHour)}/h`}
            sub="Just to cover the interest"
          />
          <Answer
            label="Verdict"
            value={result.worthwhile === null ? 'Enter a return' : result.worthwhile ? 'Worth borrowing' : 'Not worth it'}
            tone={result.worthwhile === null ? 'neutral' : result.worthwhile ? 'up' : 'down'}
            sub={result.netBenefit !== null ? `Net ${money(result.netBenefit)} over the term` : undefined}
          />
        </div>

        <Callout tone="info">
          Debt is certain and returns are not. A loan that only just clears its interest at today&rsquo;s prices becomes
          a loss the moment the market moves against you.
        </Callout>

        <Card>
          <CardHeader title="Working" />
          <div className="p-4 sm:p-5">
            <ExplanationPanel explanation={calculation} defaultOpen />
          </div>
        </Card>
      </div>
    </div>
  );
}
