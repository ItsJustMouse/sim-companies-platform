import Link from 'next/link';
import { getAnnouncementFlag, getFixtureFlag } from '@/lib/db/flags';

/**
 * Site-wide notices rendered above everything else.
 *
 * The sample-data banner is the safety mechanism that makes development fixtures
 * safe to exist: while the fixture flag is set, no page in the application can be
 * mistaken for one showing real Sim Companies prices.
 */
export async function GlobalBanners() {
  const [fixture, announcement] = await Promise.all([
    getFixtureFlag().catch(() => ({ enabled: false })),
    getAnnouncementFlag().catch(() => ({ enabled: false, message: '', level: 'info' as const })),
  ]);

  return (
    <>
      <div className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2 text-center text-sm text-[var(--text-muted)]">
        <strong className="font-semibold text-[var(--text)]">Simconomist Public Beta</strong>
        {' — '}
        Features, calculations and market observations may be incomplete, delayed or occasionally incorrect while we
        test the platform. Verify important in-game decisions.{' '}
        <Link href="/status" className="underline underline-offset-2 hover:text-[var(--text)]">
          Data status
        </Link>
      </div>
      {fixture.enabled ? (
        <div
          role="alert"
          className="border-b border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-2 text-center text-sm font-medium text-[var(--danger)]"
        >
          Sample data — the prices on this site are synthetic development fixtures, not real Sim Companies
          prices.{' '}
          <Link href="/status" className="underline underline-offset-2">
            Data status
          </Link>
        </div>
      ) : null}

      {announcement.enabled && 'message' in announcement && announcement.message ? (
        <div className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2 text-center text-sm text-[var(--text-muted)]">
          {announcement.message}
        </div>
      ) : null}
    </>
  );
}
