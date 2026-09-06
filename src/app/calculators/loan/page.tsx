import { CalculatorShell } from '@/components/calculators/shell';
import { LoanCalculator } from '@/components/calculators/loan-calculator';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Loan and bond calculator — Sim Companies',
  description: 'Total interest, repayment and hourly cost of borrowing in Sim Companies, and whether the investment you want to fund is expected to out-earn the debt.',
  path: '/calculators/loan',
});

export default function Page() {
  return (
    <CalculatorShell slug="loan">
      <LoanCalculator />
    </CalculatorShell>
  );
}
