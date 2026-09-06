import { loadCalculatorData } from '@/lib/calculators/data';
import { CalculatorShell } from '@/components/calculators/shell';
import { QualityCalculator } from '@/components/calculators/quality-calculator';
import { buildMetadata } from '@/lib/seo';

export const revalidate = 120;

export const metadata = buildMetadata({
  title: 'Quality calculator — Sim Companies',
  description: 'Whether stepping up a quality level pays in Sim Companies: the premium the market actually pays, against what reaching that quality costs you.',
  path: '/calculators/quality',
});

export default async function Page() {
  const data = await loadCalculatorData();
  return (
    <CalculatorShell slug="quality" observedAt={data.observedAt} degraded={data.degraded}>
      <QualityCalculator data={data} />
    </CalculatorShell>
  );
}
