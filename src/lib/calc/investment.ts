import { ExplanationBuilder, type Explained } from './types';

/**
 * Capital-allocation maths: is this build, upgrade or loan worth it?
 *
 * These functions are deliberately game-agnostic — they take money in and money out
 * and say nothing about buildings. That keeps them trivially testable and lets the
 * building/upgrade/vertical-integration calculators share one implementation.
 */

export interface InvestmentParams {
  /** Up-front capital required. */
  readonly cost: number;
  /** Additional profit per hour the investment is expected to produce. */
  readonly incrementalProfitPerHour: number;
  /** Hours before the investment starts earning (construction/upgrade time). */
  readonly leadTimeHours?: number;
  /** Horizon over which ROI is expressed. Defaults to 30 days. */
  readonly horizonHours?: number;
}

export interface InvestmentResult {
  readonly incrementalProfitPerDay: number;
  /** Hours of earning required to repay the capital. `null` when it never repays. */
  readonly paybackHours: number | null;
  readonly paybackDays: number | null;
  /** Total hours including lead time before the player is back to even. */
  readonly breakEvenHoursIncludingLeadTime: number | null;
  /** Net profit over the horizon, after subtracting the initial cost. */
  readonly netOverHorizon: number;
  /** Return on investment over the horizon, as a fraction. */
  readonly roiOverHorizon: number | null;
  /** Annualised simple return, as a fraction. */
  readonly annualisedReturn: number | null;
}

export function evaluateInvestment(params: InvestmentParams): Explained<InvestmentResult> {
  const explain = new ExplanationBuilder();
  const leadTimeHours = params.leadTimeHours ?? 0;
  const horizonHours = params.horizonHours ?? 24 * 30;

  explain
    .input({ label: 'Up-front cost', value: params.cost, unit: '$', source: 'user' })
    .input({ label: 'Extra profit', value: params.incrementalProfitPerHour, unit: '$/hour', source: 'user' })
    .input({ label: 'Lead time', value: leadTimeHours, unit: 'hours', source: 'user' })
    .input({ label: 'Horizon', value: horizonHours, unit: 'hours', source: 'user' });

  const incrementalProfitPerDay = params.incrementalProfitPerHour * 24;

  // A non-earning investment never pays back. Reporting a huge number here instead of
  // null would let a losing decision masquerade as a slow-but-positive one.
  const earns = params.incrementalProfitPerHour > 0;
  const paybackHours = earns ? params.cost / params.incrementalProfitPerHour : null;

  if (!earns) {
    explain.warn(
      'This investment does not increase profit per hour, so it never pays for itself under these assumptions.',
    );
  }

  explain.step({
    label: 'Payback period',
    formula: 'cost / incrementalProfitPerHour',
    result: paybackHours,
    unit: 'hours',
  });

  const earningHours = Math.max(0, horizonHours - leadTimeHours);
  const netOverHorizon = params.incrementalProfitPerHour * earningHours - params.cost;
  explain.step({
    label: 'Net over horizon',
    formula: 'incrementalProfitPerHour x (horizonHours - leadTimeHours) - cost',
    result: netOverHorizon,
    unit: '$',
  });

  const roiOverHorizon = params.cost > 0 ? netOverHorizon / params.cost : null;
  explain.step({ label: 'ROI over horizon', formula: 'netOverHorizon / cost', result: roiOverHorizon });

  const annualisedReturn =
    params.cost > 0 && horizonHours > 0 ? (roiOverHorizon ?? 0) * ((24 * 365) / horizonHours) : null;

  if (leadTimeHours > 0) {
    explain.step({
      label: 'Break-even including lead time',
      formula: 'leadTimeHours + paybackHours',
      result: paybackHours === null ? null : leadTimeHours + paybackHours,
      unit: 'hours',
    });
  }

  return explain.build<InvestmentResult>({
    incrementalProfitPerDay,
    paybackHours,
    paybackDays: paybackHours === null ? null : paybackHours / 24,
    breakEvenHoursIncludingLeadTime: paybackHours === null ? null : leadTimeHours + paybackHours,
    netOverHorizon,
    roiOverHorizon,
    annualisedReturn,
  });
}

export interface LoanParams {
  readonly principal: number;
  /** Interest rate for the whole term, as a fraction (not annualised). */
  readonly interestRate: number;
  readonly termHours: number;
  /**
   * Return per hour the borrowed capital is expected to generate.
   * Compared against the cost of the debt to answer "should I borrow for this?".
   */
  readonly expectedProfitPerHour?: number | null;
}

export interface LoanResult {
  readonly totalInterest: number;
  readonly totalRepayment: number;
  /** Interest cost per hour of the term. */
  readonly interestCostPerHour: number;
  /** Expected earnings minus interest, over the term. `null` when no estimate given. */
  readonly netBenefit: number | null;
  /** True when the funded activity is expected to out-earn the interest. */
  readonly worthwhile: boolean | null;
  /** Minimum profit per hour that would justify the loan. */
  readonly requiredProfitPerHour: number;
}

export function evaluateLoan(params: LoanParams): Explained<LoanResult> {
  const explain = new ExplanationBuilder();

  explain
    .input({ label: 'Principal', value: params.principal, unit: '$', source: 'user' })
    .input({ label: 'Interest rate (term)', value: params.interestRate * 100, unit: '%', source: 'user' })
    .input({ label: 'Term', value: params.termHours, unit: 'hours', source: 'user' });

  const totalInterest = params.principal * params.interestRate;
  const totalRepayment = params.principal + totalInterest;
  const interestCostPerHour = params.termHours > 0 ? totalInterest / params.termHours : 0;

  explain
    .step({ label: 'Total interest', formula: 'principal x interestRate', result: totalInterest, unit: '$' })
    .step({ label: 'Total repayment', formula: 'principal + totalInterest', result: totalRepayment, unit: '$' })
    .step({
      label: 'Interest cost per hour',
      formula: 'totalInterest / termHours',
      result: interestCostPerHour,
      unit: '$/hour',
    });

  const expected = params.expectedProfitPerHour ?? null;
  const netBenefit = expected === null ? null : (expected - interestCostPerHour) * params.termHours;

  if (expected !== null) {
    explain
      .input({ label: 'Expected profit from borrowed capital', value: expected, unit: '$/hour', source: 'user' })
      .step({
        label: 'Net benefit over term',
        formula: '(expectedProfitPerHour - interestCostPerHour) x termHours',
        result: netBenefit,
        unit: '$',
      });
  } else {
    explain.warn(
      'No expected return supplied. The interest cost is exact; whether borrowing is worthwhile is not yet answered.',
    );
  }

  explain.warn(
    'Expected returns are estimates supplied by the user. The debt cost is fixed by the terms you entered, while actual returns may differ.',
  );

  return explain.build<LoanResult>({
    totalInterest,
    totalRepayment,
    interestCostPerHour,
    netBenefit,
    worthwhile: netBenefit === null ? null : netBenefit > 0,
    requiredProfitPerHour: interestCostPerHour,
  });
}

/**
 * Compares two mutually exclusive uses of the same capital.
 *
 * Opportunity cost is the single most common blind spot in production planning:
 * a line that earns money can still be the wrong choice if the same building-hours
 * and capital would earn more elsewhere.
 */
export interface AllocationOption {
  readonly label: string;
  readonly capitalRequired: number;
  readonly profitPerHour: number;
}

export interface AllocationComparison {
  readonly best: AllocationOption;
  readonly ranked: readonly (AllocationOption & {
    /** Profit per hour per dollar of capital tied up. */
    readonly returnOnCapitalPerHour: number | null;
    /** How much per hour is given up by choosing this over the best option. */
    readonly opportunityCostPerHour: number;
  })[];
}

export function compareAllocations(options: readonly AllocationOption[]): Explained<AllocationComparison | null> {
  const explain = new ExplanationBuilder();
  if (options.length === 0) {
    explain.warn('Nothing to compare.');
    return explain.build<AllocationComparison | null>(null);
  }

  const sorted = [...options].sort((a, b) => b.profitPerHour - a.profitPerHour);
  const best = sorted[0] as AllocationOption;

  const ranked = sorted.map((option) => ({
    ...option,
    returnOnCapitalPerHour: option.capitalRequired > 0 ? option.profitPerHour / option.capitalRequired : null,
    opportunityCostPerHour: best.profitPerHour - option.profitPerHour,
  }));

  for (const option of sorted) {
    explain.input({ label: option.label, value: option.profitPerHour, unit: '$/hour', source: 'user' });
  }
  explain.step({
    label: 'Highest profit per hour',
    formula: 'max(profitPerHour)',
    result: best.profitPerHour,
    unit: '$/hour',
  });
  explain.step({
    label: 'Opportunity cost of each alternative',
    formula: 'bestProfitPerHour - optionProfitPerHour',
    result: null,
  });

  return explain.build<AllocationComparison | null>({ best, ranked });
}
