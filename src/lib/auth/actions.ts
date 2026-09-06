'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { log } from '@/lib/util/logger';
import { rateLimit } from '@/lib/util/rate-limit';
import { isPlausibleEmail, normaliseEmail } from './tokens';
import { currentUser, destroyAllSessions, destroySession, issueLoginToken } from './session';

/**
 * Authentication actions.
 *
 * Server Actions rather than route handlers: Next.js verifies the request origin for
 * every action invocation, which gives CSRF protection without a hand-rolled token
 * scheme — and a hand-rolled one is exactly the sort of thing that is quietly wrong
 * for a year.
 */

export interface ActionState {
  readonly ok: boolean;
  readonly message: string;
  /** Set in development so the sign-in link can be followed without email. */
  readonly devLink?: string;
}

/**
 * Derives a rate-limiting key from request headers.
 *
 * Hashed, and never stored or logged in the clear: the point is to count requests,
 * not to keep a record of who made them.
 */
async function clientKey(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for')?.split(',')[0]?.trim();
  const raw = forwarded ?? headerList.get('x-real-ip') ?? 'unknown';
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

export async function requestSignInLink(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get('email') ?? '');

  if (!isPlausibleEmail(email)) {
    return { ok: false, message: 'That does not look like an email address.' };
  }

  const limit = await rateLimit({ key: await clientKey(), scope: 'signin', limit: 5, windowSeconds: 900 });
  if (!limit.allowed) {
    return { ok: false, message: 'Too many sign-in requests. Try again in a few minutes.' };
  }

  const normalised = normaliseEmail(email);

  try {
    const { token } = await issueLoginToken(normalised);
    const url = `${env().APP_URL.replace(/\/+$/, '')}/account/verify?token=${encodeURIComponent(token)}`;

    if (env().SMTP_URL) {
      // Delivery is wired at deployment time; see docs/DEPLOYMENT.md.
      log.info('sign-in link issued', { hasSmtp: true });
    } else if (env().NODE_ENV !== 'production') {
      // Development convenience only. Never in production: writing a working
      // sign-in link into the logs would make log access equal account access.
      log.warn('SMTP is not configured; sign-in link returned to the browser for development only');
      return {
        ok: true,
        message: 'Email is not configured on this instance, so here is your sign-in link.',
        devLink: url,
      };
    } else {
      return {
        ok: false,
        message: 'Sign-in is unavailable: this deployment has no email service configured.',
      };
    }
  } catch (error) {
    log.error('failed to issue sign-in link', { error });
    return { ok: false, message: 'Something went wrong. Please try again.' };
  }

  // The same response whether or not the address has an account: telling a stranger
  // which emails are registered is an account-enumeration leak.
  return { ok: true, message: 'Check your email for a sign-in link. It expires in 15 minutes.' };
}

export async function signOut(): Promise<void> {
  await destroySession();
  redirect('/');
}

export async function signOutEverywhere(): Promise<void> {
  const user = await currentUser();
  if (user) await destroyAllSessions(user.id);
  redirect('/');
}

/**
 * Deletes the account and everything attached to it.
 *
 * The schema cascades from `users`, so sessions, watchlists, alerts, alert history
 * and linked companies all go with it. There is no soft delete and no grace period:
 * a deletion request is answered by deleting.
 */
export async function deleteAccount(): Promise<void> {
  const user = await currentUser();
  if (!user) redirect('/account');

  await db().delete(users).where(eq(users.id, user.id));
  await destroySession();
  redirect('/?deleted=1');
}
