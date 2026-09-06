import { CalculatorShell } from '@/components/calculators/shell';
import { AllocationCalculator } from '@/components/calculators/allocation-calculator';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Capital allocation calculator — Sim Companies',
  description: 'Compare competing uses of the same capital in Sim Companies by profit per hour and return on capital, with the opportunity cost of each alternative made explicit.',
  path: '/calculators/allocation',
});

export default function Page() {
  return (
    <CalculatorShell slug="allocation">
      <AllocationCalculator />
    </CalculatorShell>
  );
}
