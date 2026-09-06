'use client';

import { useMemo, useState } from 'react';
import { evaluateInvestment } from '@/lib/calc/investment';
import { Card, CardHeader, Callout } from '@/components/ui/primitives';
import { ExplanationPanel } from '@/components/ui/explanation';
import { Answer, NumberField, SelectField } from './fields';
import { duration, money, ratioAsPercent } from '@/lib/util/format';
import type { CalculatorBuilding } from '@/lib/calculators/data';

/**
 * Build-or-upgrade ROI.
 *
 * Works for any capital outlay, but prefills from real building costs and
 * construction times so the common case — "should I build another Factory?" — takes
 * two fields rather than five.
 */
export function InvestmentCalculator({ buildings }: { buildings: readonly CalculatorBuilding[] }) {
  const withCost = useMemo(() => buildings.filter((b) => b.cost !== null && b.cost > 0), [buildings]);

  const [kind, setKind] = useState<string>(() => withCost[0]?.kind ?? 'custom');
  const [cost, setCost] = useState<number>(() => withCost[0]?.cost ?? 100_000);
  const [leadTimeHours, setLeadTimeHours] = useState<number>(
    () => (withCost[0]?.secondsToBuild ?? 0) / 3600,
  );
  const [profitPerHour, setProfitPerHour] = useState(50);
  const [horizonDays, setHorizonDays] = useState(30);

  const calculation = useMemo(
    () =>
      evaluateInvestment({
        cost,
        incrementalProfitPerHour: profitPerHour,
        leadTimeHours,
        horizonHours: horizonDays * 24,
      }),
    [cost, profitPerHour, leadTimeHours, horizonDays],
  );

  const result = calculation.result;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_1fr]">
      <Card>
        <CardHeader title="The investment" />
        <div className="space-y-4 p-4">
          {withCost.length > 0 ? (
            <SelectField
              label="Prefill from a building"
              value={kind}
              onChange={(value) => {
                setKind(value);
                const building = withCost.find((b) => b.kind === value);
                if (building?.cost) setCost(building.cost);
                if (building?.secondsToBuild) setLeadTimeHours(building.secondsToBuild / 3600);
              }}
              options={[
                { value: 'custom', label: 'Custom amount' },
                ...withCost.map((b) => ({ value: b.kind, label: `${b.name}` })),
              ]}
              hint="Fills in the construction cost and build time from the game catalog."
            />
          ) : null}

          <NumberField
            label="Up-front cost"
            unit="$"
            value={cost}
            min={0}
            max={1e12}
            step={1000}
            onChange={(value) => {
              setCost(value);
              setKind('custom');
            }}
          />

          <NumberField
            label="Extra profit this creates"
            unit="$/hour"
            value={profitPerHour}
            min={-1e9}
            max={1e9}
            step={1}
            onChange={setProfitPerHour}
            hint="The additional profit per hour, not the total. Use the production calculator to work it out, then subtract what the capital earns where it is now."
          />

          <NumberField
            label="Build or upgrade time"
            unit="hours"
            value={leadTimeHours}
            min={0}
            max={10_000}
            step={0.5}
            onChange={setLeadTimeHours}
            hint="Counted against the return: capital spent is earning nothing while construction runs."
          />

          <NumberField
            label="Horizon"
            unit="days"
            value={horizonDays}
            min={1}
            max={3650}
            step={1}
            onChange={setHorizonDays}
            hint="The period the return is measured over."
          />
        </div>
      </Card>

      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Answer
            label="Payback period"
            value={result.paybackHours === null ? 'Never' : duration(result.paybackHours)}
            tone={result.paybackHours === null ? 'down' : 'neutral'}
            sub={
              result.breakEvenHoursIncludingLeadTime !== null
                ? `${duration(result.breakEvenHoursIncludingLeadTime)} including build time`
                : undefined
            }
          />
          <Answer
            label={`Net over ${horizonDays} days`}
            value={money(result.netOverHorizon)}
            tone={result.netOverHorizon >= 0 ? 'up' : 'down'}
            sub={`ROI ${ratioAsPercent(result.roiOverHorizon)}`}
          />
          <Answer
            label="Annualised return"
            value={ratioAsPercent(result.annualisedReturn)}
            tone={(result.annualisedReturn ?? 0) >= 0 ? 'up' : 'down'}
            sub="Simple, not compounded"
          />
        </div>

        {result.paybackHours === null ? (
          <Callout tone="warn" title="This never pays for itself">
            At the profit figure you entered, the investment does not repay its cost. Check whether you have subtracted
            what the money is already earning elsewhere.
          </Callout>
        ) : null}

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
