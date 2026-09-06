import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Token primitives for sessions and magic links.
 *
 * Three rules, each guarding a specific failure:
 *
 *   1. **Tokens are generated from a CSPRNG**, never from timestamps, counters or
 *      Math.random. A predictable session token is a session anyone can forge.
 *   2. **Only hashes are stored.** A database leak then yields no usable sessions or
 *      login links, the same reason passwords are never stored in the clear.
 *      SHA-256 without a salt is correct here and not for passwords: these are
 *      high-entropy random values, so there is no dictionary to attack.
 *   3. **Comparison is constant-time.** A byte-by-byte comparison that exits early
 *      leaks, through timing, how much of a guess was right.
 */

/** 32 bytes of entropy, URL-safe. Long enough that guessing is not a threat model. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time equality for two hex digests. */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/** Short opaque identifier for rows we create. */
export function generateId(): string {
  return randomBytes(12).toString('hex');
}

/**
 * Normalises an email for storage and lookup.
 *
 * Lower-casing only. Deliberately *not* stripping dots or `+tags`: those rules are
 * provider-specific, and applying Gmail's conventions to every domain would merge
 * accounts that are genuinely distinct.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function isPlausibleEmail(email: string): boolean {
  const normalised = normaliseEmail(email);
  // Length cap first: the pattern is linear, but an unbounded input is still work.
  return normalised.length <= 254 && normalised.length >= 6 && EMAIL_PATTERN.test(normalised);
}
