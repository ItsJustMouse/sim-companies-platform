import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { consumeLoginToken } from '@/lib/auth/session';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Redeems a magic link.
 *
 * A route handler rather than a page, because signing in means setting a cookie and
 * Next.js only permits that from a route handler or a server action — never during
 * the render of a page. Doing it in a page consumed the token and then failed to
 * hand the browser a session, which is the worst possible outcome: the link is spent
 * and the user is still signed out.
 *
 * On success we redirect rather than render, so the token disappears from the
 * address bar and cannot be re-shared, put in a bookmark, or leak through a Referer
 * header on the next navigation.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const base = env().APP_URL.replace(/\/+$/, '');

  if (!token) {
    return NextResponse.redirect(`${base}/account?error=invalid`);
  }

  // A coarse client hint for the sessions list. Deliberately not the full user agent
  // string, which is a fingerprinting surface we have no use for.
  const userAgent = (await headers()).get('user-agent') ?? '';
  const hint = /mobile|android|iphone/i.test(userAgent) ? 'Mobile browser' : 'Desktop browser';

  const result = await consumeLoginToken(token, hint);

  return NextResponse.redirect(result.ok ? `${base}/account?signedin=1` : `${base}/account?error=${result.reason}`);
}
