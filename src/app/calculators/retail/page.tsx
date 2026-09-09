import { loadCalculatorData } from '@/lib/calculators/data';
import { CalculatorShell } from '@/components/calculators/shell';
import { RetailCalculator } from '@/components/calculators/retail-calculator';
import { buildMetadata } from '@/lib/seo';

export const revalidate = 120;

export const metadata = buildMetadata({
  title: 'Retail calculator — Sim Companies',
  description: 'Retail margin, profit per hour and the throughput your store needs to beat selling the same goods on the Sim Companies exchange.',
  path: '/calculators/retail',
  index: false,
});

export default async function Page() {
  const data = await loadCalculatorData();
  return (
    <CalculatorShell slug="retail" observedAt={data.observedAt} degraded={data.degraded}>
      <RetailCalculator data={data} />
    </CalculatorShell>
  );
}
