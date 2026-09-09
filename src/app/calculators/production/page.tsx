import { loadCalculatorData } from '@/lib/calculators/data';
import { CalculatorShell } from '@/components/calculators/shell';
import { ProductionCalculator } from '@/components/calculators/production-calculator';
import { buildMetadata } from '@/lib/seo';

export const revalidate = 120;

export const metadata = buildMetadata({
  title: 'Sim Companies production calculator',
  description:
    'Work out the real cost and profit of producing anything in Sim Companies: inputs, wages, administration overhead, transport and the exchange fee, with profit per unit, per hour and per day and the break-even sale price.',
  path: '/calculators/production',
  index: false,
});

export default async function ProductionCalculatorPage() {
  const data = await loadCalculatorData();
  return (
    <CalculatorShell slug="production" observedAt={data.observedAt} degraded={data.degraded}>
      <ProductionCalculator data={data} />
    </CalculatorShell>
  );
}
