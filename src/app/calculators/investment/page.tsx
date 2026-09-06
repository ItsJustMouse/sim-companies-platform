import { loadCalculatorData } from '@/lib/calculators/data';
import { CalculatorShell } from '@/components/calculators/shell';
import { InvestmentCalculator } from '@/components/calculators/investment-calculator';
import { buildMetadata } from '@/lib/seo';

export const revalidate = 600;

export const metadata = buildMetadata({
  title: 'Building and upgrade ROI calculator — Sim Companies',
  description: 'Payback period, return over your horizon and annualised return for any Sim Companies build or upgrade, with construction time counted against the return.',
  path: '/calculators/investment',
});

export default async function Page() {
  const data = await loadCalculatorData();
  return (
    <CalculatorShell slug="investment">
      <InvestmentCalculator buildings={data.buildings} />
    </CalculatorShell>
  );
}
