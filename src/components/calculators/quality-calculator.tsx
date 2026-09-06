'use client';

import { useMemo, useState } from 'react';
import { evaluateQualityStep } from '@/lib/calc/selling';
import type { CalculatorData } from '@/lib/calculators/data';
import { Card, CardHeader, Callout } from '@/components/ui/primitives';
import { ExplanationPanel } from '@/components/ui/explanation';
import { Answer, NumberField, SelectField } from './fields';
import { money, percent } from '@/lib/util/format';

/**
 * Is higher quality worth it?
 *
 * The premium side comes from live listings — what the market actually pays right
 * now, not an assumed curve. The cost side comes from the player, because only they
 * know what reaching that quality costs their company.
 */
export function QualityCalculator({ data }: { data: CalculatorData }) {
  const withQualityPricing = useMemo(
    () => data.products.filter((p) => Object.keys(p.pricesByQuality).length > 1),
    [data.products],
  );
  const products = withQualityPricing.length > 0 ? withQualityPricing : data.products;

  const [productId, setProductId] = useState<number>(() => products[0]?.id ?? 0);
  const [fromQuality, setFromQuality] = useState(0);
  const [toQuality, setToQuality] = useState(1);
  const [costAtFrom, setCostAtFrom] = useState<number | null>(null);
  const [extraCost, setExtraCost] = useState(0);
  const [throughputPenalty, setThroughputPenalty] = useState(0);
  const [unitsPerHour, setUnitsPerHour] = useState(10);

  const product = products.find((p) => p.id === productId) ?? products[0];
  const qualities = useMemo(
    () => Object.keys(product?.pricesByQuality ?? {}).map(Number).sort((a, b) => a - b),
    [product],
  );

  const priceAtFrom = product?.pricesByQuality[fromQuality] ?? (fromQuality === 0 ? (product?.price ?? null) : null);
  const priceAtTo = product?.pricesByQuality[toQuality] ?? null;
  const effectiveCostAtFrom = costAtFrom ?? (priceAtFrom !== null ? priceAtFrom * 0.6 : 0);

  const calculation = useMemo(() => {
    if (!product) return null;
    return evaluateQualityStep({
      productName: product.name,
      fromQuality,
      toQuality,
      priceAtFrom,
      priceAtTo,
      costAtFrom: effectiveCostAtFrom,
      extraCostPerUnit: extraCost,
      throughputPenalty: throughputPenalty / 100,
      unitsPerHourAtFrom: unitsPerHour,
    });
  }, [product, fromQuality, toQuality, priceAtFrom, priceAtTo, effectiveCostAtFrom, extraCost, throughputPenalty, unitsPerHour]);

  if (products.length === 0) {
    return (
      <Card>
        <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">The catalog is empty.</p>
      </Card>
    );
  }

  const result = calculation?.result ?? null;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_1fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader title="The step you are considering" />
          <div className="space-y-4 p-4">
            <SelectField
              label="Product"
              value={productId}
              onChange={(value) => {
                setProductId(value);
                setCostAtFrom(null);
              }}
              options={products.map((p) => ({ value: p.id, label: p.name }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label="From quality"
                value={fromQuality}
                onChange={setFromQuality}
                options={(qualities.length > 0 ? qualities : [0]).map((q) => ({ value: q, label: `Q${q}` }))}
              />
              <SelectField
                label="To quality"
                value={toQuality}
                onChange={setToQuality}
                options={(qualities.length > 0 ? qualities : [1]).map((q) => ({ value: q, label: `Q${q}` }))}
              />
            </div>
            <p className="text-xs text-[var(--text-faint)]">
              Market prices: Q{fromQuality} {money(priceAtFrom)} · Q{toQuality} {money(priceAtTo)}
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="What it costs you" />
          <div className="space-y-4 p-4">
            <NumberField
              label={`Cost per unit at Q${fromQuality}`}
              unit="$"
              value={effectiveCostAtFrom}
              min={0}
              max={1e9}
              step={0.001}
              onChange={setCostAtFrom}
              hint={costAtFrom === null ? 'Rough default — use the production calculator for your real figure.' : 'Your figure.'}
            />
            <NumberField
              label={`Extra cost per unit to reach Q${toQuality}`}
              unit="$"
              value={extraCost}
              min={0}
              max={1e9}
              step={0.001}
              onChange={setExtraCost}
              hint="Better inputs, research, whatever it takes for you."
            />
            <NumberField
              label="Output lost to the higher quality"
              unit="%"
              value={throughputPenalty}
              min={0}
              max={99}
              step={1}
              onChange={setThroughputPenalty}
              hint="If reaching this quality slows you down. Leave at 0 if output is unchanged."
            />
            <NumberField
              label={`Units per hour at Q${fromQuality}`}
              value={unitsPerHour}
              min={0}
              max={1e6}
              step={1}
              onChange={setUnitsPerHour}
            />
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        {!calculation || !result ? null : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Answer
                label="Market pays extra"
                value={money(result.pricePremium)}
                sub={result.premiumPercent === null ? undefined : `${percent(result.premiumPercent)} premium`}
              />
              <Answer
                label="Verdict"
                value={result.worthwhile === null ? 'No market data' : result.worthwhile ? 'Worth it' : 'Not worth it'}
                tone={result.worthwhile === null ? 'neutral' : result.worthwhile ? 'up' : 'down'}
                sub={
                  result.profitPerHourAtTo !== null && result.profitPerHourAtFrom !== null
                    ? `${money(result.profitPerHourAtTo - result.profitPerHourAtFrom)}/hour difference`
                    : undefined
                }
              />
              <Answer
                label="Most you could spend"
                value={money(result.maximumJustifiedExtraCost)}
                sub="Per unit, on reaching this quality"
              />
            </div>

            {result.pricePremium !== null && result.pricePremium <= 0 ? (
              <Callout tone="warn" title="The market is not paying for this quality">
                Q{toQuality} is currently listed at or below the Q{fromQuality} price. That usually means someone is
                undercutting with high-quality stock, and it will not last — but it does mean the premium is not there
                right now.
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
