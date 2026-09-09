import type { Confidence } from '@/lib/game/constants';

/**
 * Every calculation in Simconomist returns an *explained* result.
 *
 * A bare number is not good enough for a tool people make money decisions with: a
 * player must be able to see the formula, the inputs that went into it, which of
 * those inputs were assumptions rather than measurements, and how confident we are
 * in the underlying game mechanic. The UI renders this structure directly, so an
 * explanation can never drift out of sync with the number it explains.
 */

export interface CalcInput {
  readonly label: string;
  readonly value: number | string | null;
  readonly unit?: string;
  /** Where this input came from — live market, user entry, game catalog, default. */
  readonly source: 'market' | 'user' | 'catalog' | 'assumption' | 'derived';
  /** ISO timestamp for market-sourced values, so the reader can judge staleness. */
  readonly observedAt?: string | null;
  readonly note?: string;
}

export interface CalcStep {
  readonly label: string;
  /** Human-readable formula, e.g. "wages / unitsPerHour x (1 + adminOverhead)". */
  readonly formula: string;
  readonly result: number | null;
  readonly unit?: string;
}

export interface CalcAssumption {
  readonly label: string;
  readonly detail: string;
  readonly confidence: Confidence;
  readonly source: string;
}

export interface Explained<T> {
  readonly result: T;
  readonly inputs: readonly CalcInput[];
  readonly steps: readonly CalcStep[];
  readonly assumptions: readonly CalcAssumption[];
  /** Non-fatal problems: missing catalog data, an empty order book, a stale price. */
  readonly warnings: readonly string[];
  readonly calculatedAt: string;
}

export class ExplanationBuilder {
  private readonly inputs: CalcInput[] = [];
  private readonly steps: CalcStep[] = [];
  private readonly assumptions: CalcAssumption[] = [];
  private readonly warnings: string[] = [];

  input(input: CalcInput): this {
    this.inputs.push(input);
    return this;
  }

  step(step: CalcStep): this {
    this.steps.push(step);
    return this;
  }

  assume(assumption: CalcAssumption): this {
    // Assumptions are frequently added from shared helpers; keep them unique so the
    // explanation panel does not repeat itself.
    if (!this.assumptions.some((a) => a.label === assumption.label)) this.assumptions.push(assumption);
    return this;
  }

  warn(message: string): this {
    if (!this.warnings.includes(message)) this.warnings.push(message);
    return this;
  }

  build<T>(result: T): Explained<T> {
    return {
      result,
      inputs: [...this.inputs],
      steps: [...this.steps],
      assumptions: [...this.assumptions],
      warnings: [...this.warnings],
      calculatedAt: new Date().toISOString(),
    };
  }
}
