'use client';

import { useMemo, useState } from 'react';
import { compareVerticalIntegration } from '@/lib/calc/vertical';
import type { CalculatorData } from '@/lib/calculators/data';
import { Card, CardHeader, Callout } from '@/components/ui/primitives';
import { ExplanationPanel } from '@/components/ui/explanation';
import { Answer, NumberField, SelectField } from './fields';
import { money } from '@/lib/util/format';

/**
 * Buy-or-build.
 *
 * The interface leads with the naive cash comparison and the honest one side by
 * side, because the gap between them is the entire point of the tool.
 */
export function VerticalCalculator({ data }: { data: CalculatorData }) {
  const producible = useMemo(
    () => data.products.filter((p) => p.baseUnitsPerHour !== null && p.buildingKind !== null),
    [data.products],
  );

  const [inputId, setInputId] = useState<number>(() => producible[0]?.id ?? 0);
  const [unitsNeeded, setUnitsNeeded] = useState(100);
  const [level, setLevel] = useState(1);
  const [adminOverhead, setAdminOverhead] = useState(0);
  const [alternativeProfit, setAlternativeProfit] = useState(0);
  const [purchaseTransport, setPurchaseTransport] = useState(0);
  const [marketOverride, setMarketOverride] = useState<number | null>(null);

  const product = producible.find((p) => p.id === inputId) ?? producible[0];
  const building = data.buildings.find((b) => b.kind === product?.buildingKind) ?? null;
  const productById = useMemo(() => new Map(data.products.map((p) => [p.id, p])), [data.products]);

  const calculation = useMemo(() => {
    if (!product || !building?.wagesPerHourPerLevel || product.baseUnitsPerHour === null) return null;

    return compareVerticalIntegration({
      inputName: product.name,
      unitsNeededPerHour: unitsNeeded,
      marketPrice: marketOverride ?? product.price,
      marketPriceObservedAt: marketOverride === null ? product.observedAt : null,
      purchaseTransportCostPerUnit: purchaseTransport,
      alternativeProfitPerHour: alternativeProfit > 0 ? alternativeProfit : null,
      ownProduction: {
        outputName: product.name,
        baseUnitsPerHour: product.baseUnitsPerHour,
        buildingLevel: level,
        wagesPerHourPerLevel: building.wagesPerHourPerLevel,
        adminOverhead: adminOverhead / 100,
        inputs: product.inputs.map((input) => ({
          resourceId: input.resourceId,
          resourceName: input.name,
          amountPerUnit: input.amount,
          unitPrice: productById.get(input.resourceId)?.price ?? null,
          priceObservedAt: productById.get(input.resourceId)?.observedAt ?? null,
          priceSource: 'market' as const,
        })),
        salePrice: null,
      },
    });
  }, [product, building, unitsNeeded, level, adminOverhead, alternativeProfit, purchaseTransport, marketOverride, productById]);

  if (producible.length === 0) {
    return (
      <Card>
        <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
          The catalog has no producible products yet.
        </p>
      </Card>
    );
  }

  const result = calculation?.result ?? null;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_1fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader title="The input in question" />
          <div className="space-y-4 p-4">
            <SelectField
              label="Input"
              value={inputId}
              onChange={(value) => {
                setInputId(value);
                setMarketOverride(null);
              }}
              options={producible.map((p) => ({ value: p.id, label: p.name }))}
            />
            <NumberField
              label="Units needed"
              unit="per hour"
              value={unitsNeeded}
              min={0}
              max={1e7}
              step={1}
              onChange={setUnitsNeeded}
              hint="How much your downstream production consumes each hour."
            />
            <NumberField
              label="Market price"
              unit="$/unit"
              value={marketOverride ?? product?.price ?? 0}
              min={0}
              max={1e9}
              step={0.001}
              onChange={setMarketOverride}
              hint={marketOverride === null ? 'Current cheapest listing.' : 'Your figure.'}
            />
            <NumberField
              label="Transport to buy it in"
              unit="$/unit"
              value={purchaseTransport}
              min={0}
              max={1e6}
              step={0.01}
              onChange={setPurchaseTransport}
              hint="What it costs to get purchased units into your warehouse."
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="If you made it yourself" />
          <div className="space-y-4 p-4">
            <NumberField
              label="Producing building level"
              value={level}
              min={1}
              max={200}
              onChange={setLevel}
              hint={building ? `Would be produced in a ${building.name}.` : undefined}
            />
            <NumberField
              label="Administration overhead"
              unit="%"
              value={adminOverhead}
              min={0}
              max={500}
              step={0.5}
              onChange={setAdminOverhead}
            />
            <NumberField
              label="What that building could earn instead"
              unit="$/hour"
              value={alternativeProfit}
              min={0}
              max={1e9}
              step={1}
              onChange={setAlternativeProfit}
              hint="The most profitable other thing this building could produce. Leave at 0 only if it would genuinely sit idle — this is the number that decides most buy-or-build questions."
            />
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        {!calculation || !result ? (
          <Card>
            <p className="px-4 py-8 text-sm text-[var(--text-muted)]">
              We do not have the producing building&rsquo;s wage rate for this product.
            </p>
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Answer
                label="Recommendation"
                value={
                  result.recommendation === 'produce'
                    ? 'Make it'
                    : result.recommendation === 'buy'
                      ? 'Buy it'
                      : 'Not enough data'
                }
                tone={result.recommendation === 'unknown' ? 'neutral' : 'up'}
                sub={result.savingPerHour !== null ? `Saves ${money(result.savingPerHour)}/hour` : undefined}
              />
              <Answer
                label="True cost to make"
                value={money(result.effectiveProductionCostPerUnit)}
                sub={`Cash ${money(result.productionCostPerUnit)} + opportunity ${money(result.opportunityCostPerUnit)}`}
              />
              <Answer label="Cost to buy" value={money(result.purchaseCostPerUnit)} sub="Delivered" />
            </div>

            {result.opportunityCostChangesAnswer ? (
              <Callout tone="warn" title="Opportunity cost reverses this answer">
                On cash alone, making it looks cheaper. Once the profit that building gives up is counted, buying wins.
                This is the single most common mistake in production planning.
              </Callout>
            ) : null}

            {alternativeProfit === 0 ? (
              <Callout tone="info">
                You have not told us what else this building could earn, so its time is being treated as free. That is
                only true if it would otherwise sit idle. Enter a figure to get the honest comparison.
              </Callout>
            ) : null}

            <Card>
              <CardHeader title="Working" />
              <div className="p-4 sm:p-5">
                <ExplanationPanel explanation={calculation} defaultOpen />
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
