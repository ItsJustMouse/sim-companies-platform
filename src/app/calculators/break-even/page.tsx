import { loadCalculatorData } from '@/lib/calculators/data';
import { CalculatorShell } from '@/components/calculators/shell';
import { BreakEvenCalculator } from '@/components/calculators/break-even-calculator';
import { buildMetadata } from '@/lib/seo';

export const revalidate = 120;

export const metadata = buildMetadata({
  title: 'Break-even calculator — Sim Companies',
  description: 'The lowest price you can sell at and the most you can pay for each input before a Sim Companies production line stops making money.',
  path: '/calculators/break-even',
});

export default async function Page() {
  const data = await loadCalculatorData();
  return (
    <CalculatorShell slug="break-even" observedAt={data.observedAt} degraded={data.degraded}>
      <BreakEvenCalculator data={data} />
    </CalculatorShell>
  );
}
