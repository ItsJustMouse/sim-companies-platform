import type { Explained } from '@/lib/calc/types';
import { absoluteTime, money, number } from '@/lib/util/format';
import { Badge } from './primitives';

/**
 * The "show your working" panel.
 *
 * Rendered from the `Explained<T>` structure the calculation engine returns, so it
 * cannot drift out of step with the number it explains. This is the mechanism behind
 * the product's central promise: no figure on the site is unexplainable, and every
 * assumption is visible with its confidence level attached.
 */

const CONFIDENCE_TONE = {
  official: 'up',
  'community-consensus': 'neutral',
  unconfirmed: 'warn',
} as const;

const CONFIDENCE_LABEL = {
  official: 'Official',
  'community-consensus': 'Community consensus',
  unconfirmed: 'Unconfirmed',
} as const;

export function ExplanationPanel<T>({
  explanation,
  defaultOpen = false,
}: {
  explanation: Explained<T>;
  defaultOpen?: boolean;
}) {
  const { inputs, steps, assumptions, warnings } = explanation;

  return (
    <div className="space-y-3">
      {warnings.length > 0 ? (
        <ul className="space-y-1.5">
          {warnings.map((warning) => (
            <li
              key={warning}
              className="flex gap-2 rounded-md bg-[var(--warn-soft)] px-3 py-2 text-xs leading-relaxed text-[var(--warn)]"
            >
              <span aria-hidden="true">!</span>
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <details open={defaultOpen} className="group rounded-md border border-[var(--border)]">
        <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)]">
          <span aria-hidden="true" className="mr-1.5 inline-block transition-transform group-open:rotate-90">
            ▸
          </span>
          How this was calculated
        </summary>

        <div className="space-y-4 border-t border-[var(--border)] px-3 py-3">
          {inputs.length > 0 ? (
            <section>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
                Inputs
              </h4>
              <dl className="space-y-1">
                {inputs.map((input, index) => (
                  <div key={`${input.label}-${index}`} className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                    <dt className="text-[var(--text-muted)]">
                      {input.label}
                      <span className="ml-1.5 text-[10px] uppercase tracking-wide text-[var(--text-faint)]">
                        {input.source}
                      </span>
                    </dt>
                    <dd className="tnum text-[var(--text)]">
                      {typeof input.value === 'number' ? number(input.value, decimalsFor(input.value)) : (input.value ?? '—')}
                      {input.unit ? <span className="ml-1 text-[var(--text-faint)]">{input.unit}</span> : null}
                      {input.observedAt ? (
                        <span className="ml-1.5 text-[10px] text-[var(--text-faint)]" title={absoluteTime(input.observedAt)}>
                          observed
                        </span>
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {steps.length > 0 ? (
            <section>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
                Steps
              </h4>
              <ol className="space-y-1.5">
                {steps.map((step, index) => (
                  <li key={`${step.label}-${index}`} className="text-xs">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[var(--text-muted)]">{step.label}</span>
                      <span className="tnum font-medium text-[var(--text)]">
                        {formatStep(step.result, step.unit)}
                        {step.unit && step.unit !== '$/unit' ? (
                          <span className="ml-1 text-[var(--text-faint)]">{step.unit}</span>
                        ) : null}
                      </span>
                    </div>
                    <code className="mt-0.5 block font-mono text-[10.5px] text-[var(--text-faint)]">{step.formula}</code>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {assumptions.length > 0 ? (
            <section>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
                Assumptions
              </h4>
              <ul className="space-y-2">
                {assumptions.map((assumption) => (
                  <li key={assumption.label} className="text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-[var(--text)]">{assumption.label}</span>
                      <Badge tone={CONFIDENCE_TONE[assumption.confidence]}>
                        {CONFIDENCE_LABEL[assumption.confidence]}
                      </Badge>
                    </div>
                    <p className="mt-0.5 leading-relaxed text-[var(--text-muted)]">{assumption.detail}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <p className="border-t border-[var(--border)] pt-2 text-[10.5px] text-[var(--text-faint)]">
            Calculated {absoluteTime(explanation.calculatedAt)}. Projections are estimates based on prices at that
            moment, not a guarantee of in-game results.
          </p>
        </div>
      </details>
    </div>
  );
}

/**
 * Formats a step result according to its unit.
 *
 * Only monetary steps get a currency symbol. Rendering "8 units/hour" as "$8.000"
 * is the kind of small wrongness that makes a reader doubt the numbers that matter.
 */
function formatStep(value: number | null, unit: string | undefined): string {
  if (value === null) return '—';
  const isMoney = unit === undefined || unit.includes('$');
  return isMoney ? money(value) : number(value, decimalsFor(value));
}

function decimalsFor(value: number): number {
  const abs = Math.abs(value);
  if (abs >= 1000) return 0;
  if (abs >= 1) return 2;
  return 4;
}
