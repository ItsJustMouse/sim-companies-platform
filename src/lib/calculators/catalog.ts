/**
 * The calculator index.
 *
 * One list drives the calculators landing page, site search, the footer and the
 * cross-linking between related tools, so adding a calculator in one place makes it
 * discoverable everywhere.
 */

export interface CalculatorEntry {
  readonly slug: string;
  readonly title: string;
  /** The question the calculator answers, in the words a player would use. */
  readonly question: string;
  readonly description: string;
  readonly group: 'Production' | 'Investment' | 'Selling' | 'Planning';
  readonly related: readonly string[];
  readonly needsMarketData: boolean;
}

export const CALCULATORS: readonly CalculatorEntry[] = [
  {
    slug: 'production',
    title: 'Production calculator',
    question: 'What does this actually cost me to make, and what do I earn?',
    description:
      'Full cost of production including inputs, wages, administration overhead and transport, against the current market price. Reports profit per unit, per hour and per day, plus the break-even sale price.',
    group: 'Production',
    related: ['vertical-integration', 'break-even', 'quality'],
    needsMarketData: true,
  },
  {
    slug: 'vertical-integration',
    title: 'Buy or build inputs',
    question: 'Should I buy this input, or produce it myself?',
    description:
      'Compares the delivered price of buying an input against producing it in-house — counting the profit the producing building gives up, which is what makes most self-production analyses wrong.',
    group: 'Production',
    related: ['production', 'allocation'],
    needsMarketData: true,
  },
  {
    slug: 'break-even',
    title: 'Break-even calculator',
    question: 'What is the most I can pay, and the least I can sell for?',
    description:
      'The maximum price you can pay for an input and the minimum price you can sell at before a production line stops making money.',
    group: 'Production',
    related: ['production', 'vertical-integration'],
    needsMarketData: true,
  },
  {
    slug: 'retail',
    title: 'Retail calculator',
    question: 'Is retailing this better than selling it on the Exchange?',
    description:
      'Retail margin, throughput and profit per hour, compared directly against selling the same goods on the Exchange net of its fee.',
    group: 'Selling',
    related: ['production', 'quality'],
    needsMarketData: true,
  },
  {
    slug: 'quality',
    title: 'Quality calculator',
    question: 'Is higher quality worth the extra cost?',
    description:
      'Compares the price premium a quality level actually commands on the market against what it costs you to reach it.',
    group: 'Selling',
    related: ['production', 'retail'],
    needsMarketData: true,
  },
  {
    slug: 'investment',
    title: 'Building and upgrade ROI',
    question: 'Is this build or upgrade worth the money?',
    description:
      'Payback period, return over your chosen horizon and annualised return for any capital outlay, with construction time counted against the return rather than ignored.',
    group: 'Investment',
    related: ['loan', 'allocation'],
    needsMarketData: false,
  },
  {
    slug: 'loan',
    title: 'Loan and bond calculator',
    question: 'Should I borrow to fund this?',
    description:
      'Total interest, repayment and the hourly cost of the debt — then whether the thing you want to fund is expected to out-earn it.',
    group: 'Investment',
    related: ['investment', 'allocation'],
    needsMarketData: false,
  },
  {
    slug: 'allocation',
    title: 'Capital allocation',
    question: 'How do these investment options compare?',
    description:
      'Ranks competing options by profit per hour, shows return on capital separately, and states the hourly opportunity cost of choosing each alternative.',
    group: 'Planning',
    related: ['investment', 'vertical-integration'],
    needsMarketData: false,
  },
] as const;

export function calculatorBySlug(slug: string): CalculatorEntry | undefined {
  return CALCULATORS.find((entry) => entry.slug === slug);
}

/**
 * Calculators exposed in the v0.1 public beta.
 *
 * Only calculators that have passed the browser smoke test and remain useful
 * without the incomplete building/recipe catalog are exposed here.
 */
const BETA_CALCULATOR_SLUGS = new Set(['investment', 'loan', 'allocation']);

export const BETA_CALCULATORS = CALCULATORS.filter((entry) =>
  BETA_CALCULATOR_SLUGS.has(entry.slug),
);

export const CALCULATOR_GROUPS = ['Production', 'Selling', 'Investment', 'Planning'] as const;
