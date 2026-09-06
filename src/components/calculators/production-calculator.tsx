'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { calculateProduction, type ProductionInputLine } from '@/lib/calc/production';
import type { CalculatorData } from '@/lib/calculators/data';
import { Card, CardHeader } from '@/components/ui/primitives';
import { ExplanationPanel } from '@/components/ui/explanation';
import { Answer, NumberField, SelectField, ToggleField } from './fields';
import { compactNumber, money, ratioAsPercent } from '@/lib/util/format';

/**
 * Production calculator.
 *
 * Prefilled from live market data so a player can get a real answer in one click,
 * then override any input to model their own company. Every price field carries an
 * explicit "market" or "your figure" state, because a projection built on a price
 * the player typed is a different kind of claim from one built on an observation.
 */
export function ProductionCalculator({ data }: { data: CalculatorData }) {
  const producible = useMemo(
    () => data.products.filter((p) => p.baseUnitsPerHour !== null && p.buildingKind !== null),
    [data.products],
  );

  const [productId, setProductId] = useState<number>(() => producible[0]?.id ?? 0);
  const [level, setLevel] = useState(1);
  const [productionBonus, setProductionBonus] = useState(0);
  const [adminOverhead, setAdminOverhead] = useState(0);
  const [abundance, setAbundance] = useState(100);
  const [useRobots, setUseRobots] = useState(false);
  const [channel, setChannel] = useState<'exchange' | 'contract'>('exchange');
  const [transportUnitCost, setTransportUnitCost] = useState(0);
  const [salePriceOverride, setSalePriceOverride] = useState<number | null>(null);
  const [inputOverrides, setInputOverrides] = useState<Record<number, number>>({});

  const product = producible.find((p) => p.id === productId) ?? producible[0];
  const building = data.buildings.find((b) => b.kind === product?.buildingKind) ?? null;
  const productById = useMemo(() => new Map(data.products.map((p) => [p.id, p])), [data.products]);

  const inputs: ProductionInputLine[] = useMemo(() => {
    if (!product) return [];
    return product.inputs.map((input) => {
      const override = inputOverrides[input.resourceId];
      const marketPrice = productById.get(input.resourceId)?.price ?? null;
      const price = override ?? marketPrice;
      return {
        resourceId: input.resourceId,
        resourceName: input.name,
        amountPerUnit: input.amount,
        unitPrice: price,
        priceObservedAt: override === undefined ? (productById.get(input.resourceId)?.observedAt ?? null) : null,
        priceSource: override === undefined ? ('market' as const) : ('user' as const),
      };
    });
  }, [product, inputOverrides, productById]);

  const calculation = useMemo(() => {
    if (!product || !building?.wagesPerHourPerLevel || product.baseUnitsPerHour === null) return null;
    const salePrice = salePriceOverride ?? product.price;

    return calculateProduction({
      outputName: product.name,
      baseUnitsPerHour: product.baseUnitsPerHour,
      buildingLevel: level,
      wagesPerHourPerLevel: building.wagesPerHourPerLevel,
      productionBonus: productionBonus / 100,
      adminOverhead: adminOverhead / 100,
      abundance: abundance / 100,
      useRobots,
      inputs,
      salePrice,
      salePriceObservedAt: salePriceOverride === null ? product.observedAt : null,
      saleChannel: channel,
      transportUnitsPerUnit: product.transportUnits,
      transportUnitCost,
    });
  }, [
    product,
    building,
    level,
    productionBonus,
    adminOverhead,
    abundance,
    useRobots,
    inputs,
    salePriceOverride,
    channel,
    transportUnitCost,
  ]);

  if (producible.length === 0) {
    return (
      <Card>
        <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
          No producible products are in the catalog yet. Run the catalog sync, then come back.
        </p>
      </Card>
    );
  }

  const result = calculation?.result ?? null;
  const salePrice = salePriceOverride ?? product?.price ?? null;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_1fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader title="What are you producing?" />
          <div className="space-y-4 p-4">
            <SelectField
              label="Product"
              value={productId}
              onChange={(value) => {
                setProductId(value);
                // Overrides belong to the previous recipe; carrying them across
                // would silently price a different product's inputs.
                setInputOverrides({});
                setSalePriceOverride(null);
              }}
              options={producible.map((p) => ({ value: p.id, label: p.name }))}
              hint={building ? `Produced in a ${building.name}.` : 'No producing building known.'}
            />

            <NumberField
              label="Building level"
              value={level}
              min={1}
              max={200}
              onChange={setLevel}
              hint="Scales output and the wage bill together, so cost per unit stays the same and profit per hour rises."
            />

            <NumberField
              label="Production bonus"
              unit="%"
              value={productionBonus}
              min={0}
              max={500}
              step={1}
              onChange={setProductionBonus}
              hint="Extra output speed. Raises output without raising wages, so it lowers cost per unit."
            />

            <NumberField
              label="Administration overhead"
              unit="%"
              value={adminOverhead}
              min={0}
              max={500}
              step={0.5}
              onChange={setAdminOverhead}
              hint="Multiplies your labour cost. Rises as you add buildings and levels."
            />

            <NumberField
              label="Resource abundance"
              unit="%"
              value={abundance}
              min={1}
              max={200}
              step={1}
              onChange={setAbundance}
              hint="Extraction buildings only. Leave at 100% for anything else."
            />

            <ToggleField
              label="Staffed with robots"
              checked={useRobots}
              onChange={setUseRobots}
              hint="Applies a wage reduction we have inferred from community sources rather than confirmed. Leave off unless you are modelling it deliberately."
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Selling and delivery" />
          <div className="space-y-4 p-4">
            <SelectField
              label="Sold via"
              value={channel}
              onChange={setChannel}
              options={[
                { value: 'exchange', label: 'Exchange (fee applies)' },
                { value: 'contract', label: 'Contract (no fee)' },
              ]}
              hint="Exchange sales are charged a seller fee; contracts are not."
            />

            <NumberField
              label="Sale price"
              unit="$/unit"
              value={salePrice ?? 0}
              min={0}
              max={1e9}
              step={0.01}
              onChange={setSalePriceOverride}
              hint={
                salePriceOverride === null && product?.price != null ? (
                  <>Current market price. Type to override.</>
                ) : (
                  <button type="button" onClick={() => setSalePriceOverride(null)} className="text-[var(--accent)] underline">
                    Reset to market price
                  </button>
                )
              }
            />

            <NumberField
              label="Transport unit cost"
              unit="$/transport unit"
              value={transportUnitCost}
              min={0}
              max={1e6}
              step={0.01}
              onChange={setTransportUnitCost}
              hint={
                product?.transportUnits
                  ? `This product needs ${product.transportUnits} transport units per unit. Leaving this at 0 treats delivery as free.`
                  : 'This product has no recorded transport requirement.'
              }
            />
          </div>
        </Card>

        {product && product.inputs.length > 0 ? (
          <Card>
            <CardHeader title="Input prices" description="Prefilled from the market. Override any of them." />
            <div className="space-y-4 p-4">
              {product.inputs.map((input) => {
                const marketPrice = productById.get(input.resourceId)?.price ?? null;
                const override = inputOverrides[input.resourceId];
                return (
                  <NumberField
                    key={input.resourceId}
                    label={`${input.name} (x${input.amount})`}
                    unit="$/unit"
                    value={override ?? marketPrice ?? 0}
                    min={0}
                    max={1e9}
                    step={0.001}
                    onChange={(value) => setInputOverrides((current) => ({ ...current, [input.resourceId]: value }))}
                    hint={
                      override === undefined ? (
                        marketPrice === null ? (
                          <span className="text-[var(--warn)]">No market price — enter one to complete the estimate.</span>
                        ) : (
                          'Current market price.'
                        )
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setInputOverrides((current) => {
                              const next = { ...current };
                              delete next[input.resourceId];
                              return next;
                            })
                          }
                          className="text-[var(--accent)] underline"
                        >
                          Reset to market price
                        </button>
                      )
                    }
                  />
                );
              })}
            </div>
          </Card>
        ) : null}
      </div>

      <div className="space-y-4">
        {!calculation || !result ? (
          <Card>
            <p className="px-4 py-8 text-sm text-[var(--text-muted)]">
              We do not have the producing building&rsquo;s wage rate for this product, so cost cannot be calculated.
            </p>
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Answer
                label="Profit per hour"
                value={money(result.profitPerHour)}
                tone={(result.profitPerHour ?? 0) >= 0 ? 'up' : 'down'}
                sub={`${money(result.profitPerDay)} per day`}
              />
              <Answer
                label="Profit per unit"
                value={money(result.profitPerUnit)}
                tone={(result.profitPerUnit ?? 0) >= 0 ? 'up' : 'down'}
                sub={`margin ${ratioAsPercent(result.margin)}`}
              />
              <Answer label="Cost per unit" value={money(result.totalCostPerUnit)} sub="Inputs + labour + transport" />
              <Answer
                label="Break-even price"
                value={money(result.breakEvenSalePrice)}
                sub={
                  salePrice !== null && result.breakEvenSalePrice !== null
                    ? salePrice > result.breakEvenSalePrice
                      ? 'Current price is above break-even'
                      : 'Current price is below break-even'
                    : undefined
                }
              />
            </div>

            <Card>
              <CardHeader title="Full breakdown" />
              <div className="space-y-4 p-4 sm:p-5">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                  <Figure label="Output" value={`${compactNumber(result.unitsPerHour)} / hour`} />
                  <Figure label="Output per day" value={compactNumber(result.unitsPerDay)} />
                  <Figure label="Hourly wage bill" value={money(result.hourlyWages)} />
                  <Figure label="Labour per unit" value={money(result.labourCostPerUnit)} />
                  <Figure label="Inputs per unit" value={money(result.inputCostPerUnit)} />
                  <Figure label="Transport per unit" value={money(result.transportCostPerUnit)} />
                  <Figure label="Net revenue per unit" value={money(result.netRevenuePerUnit)} />
                  <Figure label="Profit per day" value={money(result.profitPerDay)} />
                  <Figure label="Margin" value={ratioAsPercent(result.margin)} />
                </dl>
                <ExplanationPanel explanation={calculation} defaultOpen />
              </div>
            </Card>

            {product ? (
              <p className="text-xs text-[var(--text-muted)]">
                See{' '}
                <Link href={`/exchange/${product.slug}`} className="text-[var(--accent)] hover:underline">
                  {product.name} price history and supply
                </Link>{' '}
                before committing to a production run — the cheapest listing may not cover the quantity you need.
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[var(--text-faint)]">{label}</dt>
      <dd className="tnum font-medium text-[var(--text)]">{value}</dd>
    </div>
  );
}
