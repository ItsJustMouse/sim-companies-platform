'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { requestSignInLink, type ActionState } from '@/lib/auth/actions';
import { Callout } from '@/components/ui/primitives';

const INITIAL: ActionState = { ok: false, message: '' };

/**
 * Sign-in form.
 *
 * Magic links only — no password field, because a password database is a liability
 * this product has no need for. Passkeys are the intended next step and slot in
 * beside this without changing the session model.
 */
export function SignInForm() {
  const [state, action, pending] = useActionState(requestSignInLink, INITIAL);

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <label className="block">
          <span className="block text-sm font-medium text-[var(--text)]">Email address</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            maxLength={254}
            placeholder="you@example.com"
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)] disabled:opacity-60"
        >
          {pending ? 'Sending…' : 'Email me a sign-in link'}
        </button>

        <p className="text-xs leading-relaxed text-[var(--text-faint)]">
          No password. We email you a link that signs you in and then stops working. We store your email address and
          nothing else about you — see our{' '}
          <Link href="/privacy" className="underline underline-offset-2">
            privacy note
          </Link>
          .
        </p>
      </form>

      {state.message ? (
        <Callout tone={state.ok ? 'info' : 'danger'}>
          <p>{state.message}</p>
          {state.devLink ? (
            <p className="mt-2 break-all font-mono text-xs">
              <a href={state.devLink} className="underline">
                {state.devLink}
              </a>
            </p>
          ) : null}
        </Callout>
      ) : null}
    </div>
  );
}
