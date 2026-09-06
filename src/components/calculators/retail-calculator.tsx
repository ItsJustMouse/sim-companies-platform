'use client';

import { useMemo, useState } from 'react';
import { calculateRetail } from '@/lib/calc/selling';
import type { CalculatorData } from '@/lib/calculators/data';
import { Card, CardHeader, Callout } from '@/components/ui/primitives';
import { ExplanationPanel } from '@/components/ui/explanation';
import { Answer, NumberField, SelectField } from './fields';
import { money, number } from '@/lib/util/format';

/**
 * Retail versus the Exchange.
 *
 * The game does not publish how a store's sale rate responds to price, quality and
 * demand, so this tool does not pretend to predict it. The player supplies the
 * throughput they observe; everything around it is exact. That boundary is stated on
 * the page, not buried in a footnote.
 */
export function RetailCalculator({ data }: { data: CalculatorData }) {
  const retailable = useMemo(
    () => data.products.filter((p) => p.retailable !== false),
    [data.products],
  );
  const retailBuildings = useMemo(() => data.buildings.filter((b) => b.isRetail), [data.buildings]);

  const [productId, setProductId] = useState<number>(() => retailable[0]?.id ?? 0);
  const [unitCost, setUnitCost] = useState<number | null>(null);
  const [retailPrice, setRetailPrice] = useState<number | null>(null);
  const [unitsSoldPerHour, setUnitsSoldPerHour] = useState(50);
  const [storeLevel, setStoreLevel] = useState(1);
  const [adminOverhead, setAdminOverhead] = useState(0);
  const [transport, setTransport] = useState(0);

  const product = retailable.find((p) => p.id === productId) ?? retailable[0];
  const store = retailBuildings[0] ?? null;
  const storeWagesPerHour = (store?.wagesPerHourPerLevel ?? 0) * storeLevel;

  // Defaults derived from the market: cost is what you would pay to buy the goods,
  // and the retail price starts at the market price so the reader can see the
  // premium they would need to charge.
  const effectiveUnitCost = unitCost ?? product?.price ?? 0;
  const effectiveRetailPrice = retailPrice ?? (product?.price !== null && product?.price !== undefined ? product.price * 1.5 : 0);

  const calculation = useMemo(() => {
    if (!product) return null;
    return calculateRetail({
      productName: product.name,
      unitCost: effectiveUnitCost,
      retailPrice: effectiveRetailPrice,
      unitsSoldPerHour,
      storeWagesPerHour,
      adminOverhead: adminOverhead / 100,
      exchangePrice: product.price,
      transportCostPerUnit: transport,
    });
  }, [product, effectiveUnitCost, effectiveRetailPrice, unitsSoldPerHour, storeWagesPerHour, adminOverhead, transport]);

  if (retailable.length === 0) {
    return (
      <Card>
        <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">No retailable products in the catalog.</p>
      </Card>
    );
  }

  const result = calculation?.result ?? null;

  return (
    <div className="space-y-5">
      <Callout tone="info" title="What this tool does and does not do">
        The game does not publish how retail sale rate responds to price, quality and local demand, and we will not
        invent a formula for it. Enter the throughput you actually observe in your store; everything built on that
        number — margin, profit per hour, and the comparison against the Exchange — is exact.
      </Callout>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="What you are selling" />
            <div className="space-y-4 p-4">
              <SelectField
                label="Product"
                value={productId}
                onChange={(value) => {
                  setProductId(value);
                  setUnitCost(null);
                  setRetailPrice(null);
                }}
                options={retailable.map((p) => ({ value: p.id, label: p.name }))}
              />
              <NumberField
                label="Your cost per unit"
                unit="$"
                value={effectiveUnitCost}
                min={0}
                max={1e9}
                step={0.001}
                onChange={setUnitCost}
                hint={unitCost === null ? 'Defaults to the market price — override with your production cost.' : 'Your figure.'}
              />
              <NumberField
                label="Retail sale price"
                unit="$"
                value={effectiveRetailPrice}
                min={0}
                max={1e9}
                step={0.01}
                onChange={setRetailPrice}
                hint="The price you set in your store."
              />
              <NumberField
                label="Transport to stock the store"
                unit="$/unit"
                value={transport}
                min={0}
                max={1e6}
                step={0.01}
                onChange={setTransport}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Your store" />
            <div className="space-y-4 p-4">
              <NumberField
                label="Units sold per hour"
                value={unitsSoldPerHour}
                min={0}
                max={1e6}
                step={1}
                onChange={setUnitsSoldPerHour}
                hint="Measured in-game. This is the one number we cannot compute for you."
              />
              <NumberField label="Store level" value={storeLevel} min={1} max={200} onChange={setStoreLevel} />
              <NumberField
                label="Administration overhead"
                unit="%"
                value={adminOverhead}
                min={0}
                max={500}
                step={0.5}
                onChange={setAdminOverhead}
              />
              <p className="text-xs text-[var(--text-faint)]">
                {store
                  ? `Store wages: ${money(storeWagesPerHour)}/hour at level ${storeLevel} (${money(store.wagesPerHourPerLevel)}/level, from ${store.name}).`
                  : 'No retail building is in the catalog, so store wages are treated as zero.'}
              </p>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          {!calculation || !result ? null : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Answer
                  label="Retail profit"
                  value={`${money(result.profitPerHour)}/h`}
                  tone={result.profitPerHour >= 0 ? 'up' : 'down'}
                  sub={`${money(result.profitPerUnit)} per unit`}
                />
                <Answer
                  label="Selling on the Exchange instead"
                  value={result.exchangeProfitPerHour === null ? '—' : `${money(result.exchangeProfitPerHour)}/h`}
                  sub="Same volume, net of the fee"
                />
                <Answer
                  label="Better option"
                  value={
                    result.recommendation === 'retail'
                      ? 'Retail'
                      : result.recommendation === 'exchange'
                        ? 'Exchange'
                        : 'Not enough data'
                  }
                  tone={result.recommendation === 'unknown' ? 'neutral' : 'up'}
                  sub={
                    result.retailAdvantagePerHour !== null
                      ? `by ${money(Math.abs(result.retailAdvantagePerHour))}/hour`
                      : undefined
                  }
                />
              </div>

              {result.breakEvenThroughput !== null ? (
                <Callout tone="info">
                  Your store must sell at least{' '}
                  <strong className="tnum">{number(result.breakEvenThroughput, 1)} units/hour</strong> for retail to beat
                  selling the same goods on the Exchange. Below that, the store&rsquo;s wage bill eats the premium.
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
    </div>
  );
}
