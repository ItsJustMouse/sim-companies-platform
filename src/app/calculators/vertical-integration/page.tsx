import { loadCalculatorData } from '@/lib/calculators/data';
import { CalculatorShell } from '@/components/calculators/shell';
import { VerticalCalculator } from '@/components/calculators/vertical-calculator';
import { buildMetadata } from '@/lib/seo';

export const revalidate = 120;

export const metadata = buildMetadata({
  title: 'Buy or produce inputs — Sim Companies vertical integration calculator',
  description:
    'Should you buy an input on the exchange or produce it yourself? Compares delivered purchase price against in-house cost including the profit the producing building gives up — the opportunity cost that makes most self-production analyses wrong.',
  path: '/calculators/vertical-integration',
});

export default async function VerticalIntegrationPage() {
  const data = await loadCalculatorData();
  return (
    <CalculatorShell slug="vertical-integration" observedAt={data.observedAt} degraded={data.degraded}>
      <VerticalCalculator data={data} />
    </CalculatorShell>
  );
}
