import { cookies } from 'next/headers';
import { and, eq, isNull, lt } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { loginTokens, sessions, users } from '@/lib/db/schema';
import { adminEmails, env, isProduction } from '@/lib/env';
import { log } from '@/lib/util/logger';
import { generateId, generateToken, hashToken, normaliseEmail } from './tokens';

/**
 * Session management.
 *
 * Sessions are opaque random tokens in an HttpOnly cookie, with only their hash in
 * the database. Not a JWT: this application already reads the database on every
 * authenticated request, so a stateless token buys nothing and costs the ability to
 * revoke — a signed-out or compromised session must stop working immediately, not
 * when it happens to expire.
 *
 * Cookie flags:
 *   HttpOnly  — script cannot read it, so an XSS bug cannot exfiltrate the session.
 *   SameSite=Lax — the browser will not attach it to cross-site POSTs, which blocks
 *                  ordinary CSRF while keeping normal inbound links working.
 *   Secure    — in production only, so http://localhost still works in development.
 */

const SESSION_COOKIE = 'lf_session';

export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly isAdmin: boolean;
}

export async function createSession(userId: string, clientHint?: string): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + env().SESSION_TTL_DAYS * 24 * 3_600_000);

  await db().insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt,
    clientHint: clientHint?.slice(0, 80) ?? null,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    path: '/',
    expires: expiresAt,
  });

  return token;
}

export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const [row] = await db()
      .select({
        userId: sessions.userId,
        expiresAt: sessions.expiresAt,
        email: users.email,
        displayName: users.displayName,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(sessions.tokenHash, hashToken(token)))
      .limit(1);

    if (!row) return null;
    if (row.expiresAt.getTime() <= Date.now()) {
      // Expired rows are removed on encounter rather than waiting for the sweeper,
      // so a stale cookie stops working the moment it is presented.
      await db().delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
      return null;
    }

    return {
      id: row.userId,
      email: row.email,
      displayName: row.displayName,
      isAdmin: adminEmails().has(row.email),
    };
  } catch (error) {
    // An auth lookup that fails must deny, never allow.
    log.warn('session lookup failed', { error });
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db().delete(sessions).where(eq(sessions.tokenHash, hashToken(token))).catch(() => {});
  }
  store.delete(SESSION_COOKIE);
}

/** Signs out every session for a user. Used by "sign out everywhere". */
export async function destroyAllSessions(userId: string): Promise<void> {
  await db().delete(sessions).where(eq(sessions.userId, userId));
}

/**
 * Issues a single-use magic link token.
 *
 * Returns the raw token so the caller can build a URL; only its hash is stored.
 * Short-lived because a link that sits in an inbox for a week is a standing key to
 * the account.
 */
export async function issueLoginToken(email: string): Promise<{ token: string; expiresAt: Date }> {
  const normalised = normaliseEmail(email);
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 15 * 60_000);

  await db().insert(loginTokens).values({
    tokenHash: hashToken(token),
    email: normalised,
    expiresAt,
  });

  return { token, expiresAt };
}

export type ConsumeResult =
  | { ok: true; user: SessionUser }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' };

/**
 * Redeems a magic link, creating the account on first use.
 *
 * The token is marked consumed before the session is created, so a link that is
 * followed twice — by a mail scanner and then by the person — cannot mint two
 * sessions.
 */
export async function consumeLoginToken(token: string, clientHint?: string): Promise<ConsumeResult> {
  const tokenHash = hashToken(token);

  const [row] = await db().select().from(loginTokens).where(eq(loginTokens.tokenHash, tokenHash)).limit(1);
  if (!row) return { ok: false, reason: 'invalid' };
  if (row.consumedAt) return { ok: false, reason: 'used' };
  if (row.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'expired' };

  // Conditional update: only the request that flips consumedAt from null proceeds,
  // so two simultaneous redemptions cannot both succeed.
  const claimed = await db()
    .update(loginTokens)
    .set({ consumedAt: new Date() })
    // `isNull`, not `= NULL`: in SQL a comparison against NULL is never true, so an
    // equality check here would match nothing and reject every valid sign-in.
    .where(and(eq(loginTokens.tokenHash, tokenHash), isNull(loginTokens.consumedAt)))
    .returning({ tokenHash: loginTokens.tokenHash });

  if (claimed.length === 0) return { ok: false, reason: 'used' };

  const [existing] = await db().select().from(users).where(eq(users.email, row.email)).limit(1);

  let userId: string;
  if (existing) {
    userId = existing.id;
    await db().update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, userId));
  } else {
    userId = generateId();
    await db().insert(users).values({ id: userId, email: row.email, lastSeenAt: new Date() });
  }

  await createSession(userId, clientHint);

  return {
    ok: true,
    user: { id: userId, email: row.email, displayName: existing?.displayName ?? null, isAdmin: adminEmails().has(row.email) },
  };
}

/** Removes expired sessions and login tokens. Called by the maintenance job. */
export async function pruneExpiredAuth(): Promise<{ sessions: number; tokens: number }> {
  const now = new Date();
  const removedSessions = await db().delete(sessions).where(lt(sessions.expiresAt, now));
  const removedTokens = await db().delete(loginTokens).where(lt(loginTokens.expiresAt, now));
  return {
    sessions: countOf(removedSessions),
    tokens: countOf(removedTokens),
  };
}

function countOf(result: unknown): number {
  if (result && typeof result === 'object' && 'count' in result) {
    const count = (result as { count?: unknown }).count;
    if (typeof count === 'number') return count;
  }
  return 0;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new Error('Not signed in');
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await currentUser();
  // Admin membership is decided by configuration, not by a database column, so a
  // write to the users table can never grant it.
  if (!user?.isAdmin) throw new Error('Not authorised');
  return user;
}

export { SESSION_COOKIE };
