'use client';

import { useMemo, useState } from 'react';
import { calculateProduction, maximumViableInputPrice, type ProductionInputLine } from '@/lib/calc/production';
import type { CalculatorData } from '@/lib/calculators/data';
import { Card, CardHeader, Callout } from '@/components/ui/primitives';
import { ExplanationPanel } from '@/components/ui/explanation';
import { Answer, NumberField, SelectField } from './fields';
import { money, ratioAsPercent } from '@/lib/util/format';

/**
 * Break-even in both directions.
 *
 * Two questions with one shared model: the lowest price you can sell at, and the
 * highest you can pay for each input. Both are the questions a player actually asks
 * while staring at a listing, phrased as "is this worth buying / worth making".
 */
export function BreakEvenCalculator({ data }: { data: CalculatorData }) {
  const producible = useMemo(
    () => data.products.filter((p) => p.baseUnitsPerHour !== null && p.buildingKind !== null),
    [data.products],
  );

  const [productId, setProductId] = useState<number>(() => producible[0]?.id ?? 0);
  const [level, setLevel] = useState(1);
  const [adminOverhead, setAdminOverhead] = useState(0);
  const [salePriceOverride, setSalePriceOverride] = useState<number | null>(null);

  const product = producible.find((p) => p.id === productId) ?? producible[0];
  const building = data.buildings.find((b) => b.kind === product?.buildingKind) ?? null;
  const productById = useMemo(() => new Map(data.products.map((p) => [p.id, p])), [data.products]);

  const params = useMemo(() => {
    if (!product || !building?.wagesPerHourPerLevel || product.baseUnitsPerHour === null) return null;

    const inputs: ProductionInputLine[] = product.inputs.map((input) => ({
      resourceId: input.resourceId,
      resourceName: input.name,
      amountPerUnit: input.amount,
      unitPrice: productById.get(input.resourceId)?.price ?? null,
      priceObservedAt: productById.get(input.resourceId)?.observedAt ?? null,
      priceSource: 'market' as const,
    }));

    return {
      outputName: product.name,
      baseUnitsPerHour: product.baseUnitsPerHour,
      buildingLevel: level,
      wagesPerHourPerLevel: building.wagesPerHourPerLevel,
      adminOverhead: adminOverhead / 100,
      inputs,
      salePrice: salePriceOverride ?? product.price,
      salePriceObservedAt: salePriceOverride === null ? product.observedAt : null,
      saleChannel: 'exchange' as const,
      transportUnitsPerUnit: product.transportUnits,
      transportUnitCost: 0,
    };
  }, [product, building, level, adminOverhead, salePriceOverride, productById]);

  const calculation = useMemo(() => (params ? calculateProduction(params) : null), [params]);

  const inputCeilings = useMemo(() => {
    if (!params) return [];
    return params.inputs.map((input) => ({
      input,
      currentPrice: input.unitPrice,
      analysis: maximumViableInputPrice(params, input.resourceId),
    }));
  }, [params]);

  if (producible.length === 0) {
    return (
      <Card>
        <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">The catalog is empty.</p>
      </Card>
    );
  }

  const result = calculation?.result ?? null;
  const salePrice = salePriceOverride ?? product?.price ?? null;
  const headroom =
    salePrice !== null && result?.breakEvenSalePrice != null && salePrice > 0
      ? (salePrice - result.breakEvenSalePrice) / salePrice
      : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_1fr]">
      <Card>
        <CardHeader title="Your production line" />
        <div className="space-y-4 p-4">
          <SelectField
            label="Product"
            value={productId}
            onChange={(value) => {
              setProductId(value);
              setSalePriceOverride(null);
            }}
            options={producible.map((p) => ({ value: p.id, label: p.name }))}
          />
          <NumberField label="Building level" value={level} min={1} max={200} onChange={setLevel} />
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
            label="Sale price"
            unit="$/unit"
            value={salePrice ?? 0}
            min={0}
            max={1e9}
            step={0.001}
            onChange={setSalePriceOverride}
            hint={salePriceOverride === null ? 'Current market price.' : 'Your figure.'}
          />
        </div>
      </Card>

      <div className="space-y-4">
        {!calculation || !result ? (
          <Card>
            <p className="px-4 py-8 text-sm text-[var(--text-muted)]">
              Missing the producing building&rsquo;s wage rate for this product.
            </p>
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Answer
                label="Minimum sale price"
                value={money(result.breakEvenSalePrice)}
                sub="Below this you lose money on every unit"
              />
              <Answer
                label="Current price"
                value={money(salePrice)}
                tone={
                  salePrice !== null && result.breakEvenSalePrice !== null
                    ? salePrice >= result.breakEvenSalePrice
                      ? 'up'
                      : 'down'
                    : 'neutral'
                }
                sub={
                  headroom === null
                    ? undefined
                    : headroom >= 0
                      ? `${ratioAsPercent(headroom)} above break-even`
                      : `${ratioAsPercent(Math.abs(headroom))} below break-even`
                }
              />
              <Answer label="Cost per unit" value={money(result.totalCostPerUnit)} sub="Before the exchange fee" />
            </div>

            {headroom !== null && headroom < 0 ? (
              <Callout tone="danger" title="Currently loss-making">
                At today&rsquo;s prices this line loses money on every unit produced. Either your inputs need to get
                cheaper or the output needs to sell for more.
              </Callout>
            ) : null}

            {inputCeilings.length > 0 ? (
              <Card>
                <CardHeader
                  title="Most you can pay for each input"
                  description="Above these prices, this production line stops breaking even."
                />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <caption className="sr-only">Maximum viable purchase price for each input</caption>
                    <thead>
                      <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                        <th scope="col" className="px-4 py-2 font-medium">Input</th>
                        <th scope="col" className="px-4 py-2 text-right font-medium">Market price</th>
                        <th scope="col" className="px-4 py-2 text-right font-medium">Maximum you can pay</th>
                        <th scope="col" className="px-4 py-2 text-right font-medium">Headroom</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inputCeilings.map(({ input, currentPrice, analysis }) => {
                        const max = analysis.result;
                        const gap = max !== null && currentPrice !== null ? max - currentPrice : null;
                        return (
                          <tr key={input.resourceId} className="border-b border-[var(--border)] last:border-0">
                            <th scope="row" className="px-4 py-2 text-left font-normal">
                              {input.resourceName}
                              <span className="ml-1.5 text-xs text-[var(--text-faint)]">x{input.amountPerUnit}</span>
                            </th>
                            <td className="tnum px-4 py-2 text-right text-[var(--text-muted)]">{money(currentPrice)}</td>
                            <td className="tnum px-4 py-2 text-right font-medium">{money(max)}</td>
                            <td
                              className={`tnum px-4 py-2 text-right ${gap !== null && gap < 0 ? 'text-[var(--down)]' : 'text-[var(--up)]'}`}
                            >
                              {gap === null ? '—' : money(gap)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--text-faint)]">
                  Each ceiling holds the other inputs at their current prices. If several inputs rise together, every
                  ceiling falls.
                </p>
              </Card>
            ) : (
              <Callout tone="info">
                This product has no purchased inputs, so there is no input ceiling to compute — its cost is wages only.
              </Callout>
            )}

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
