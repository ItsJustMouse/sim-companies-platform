# Security

## Threat model

The application holds no payment data, no personal profiles and no game credentials.
That shapes what is worth defending.

### Assets, by what their loss would cost

| Asset | Impact if compromised | Where it lives |
| --- | --- | --- |
| Collected market history | Irreplaceable — the game publishes no history, so it cannot be re-fetched | `market_snapshots`, `market_candles` |
| Our standing with the game's operators | A block would end the project, and could affect other third-party tools | Request behaviour |
| User email addresses | Small but real: a leak is a spam list | `users` |
| Session tokens | Account takeover | Hashed in `sessions` |
| Discord webhook URLs | Attacker can post to a user's channel | `alerts.destination` |
| Player company data | **We do not hold it.** It stays in the browser | Client only |

### Adversaries

1. **Opportunistic scanners.** Automated probes for known CVEs and default paths.
2. **Abusive users.** Scraping our data, spamming sign-in emails, using alert
   destinations as an SSRF primitive.
3. **A malicious upstream response.** The game's API is not hostile, but a compromised
   or changed response must not become code execution or a persistent XSS.
4. **A curious authenticated user.** Reading or modifying another account's alerts by
   changing an id.

Explicitly **out of scope**: a targeted attack by a well-resourced adversary, and
physical or infrastructure compromise of the hosting provider.

---

## Controls

### Injection

- **SQL:** every query is parameterised, through Drizzle or tagged `sql` templates.
  The two places using `sql.raw` interpolate values from closed unions defined in the
  same file (`'hour' | 'day'`, a fixed job name) — never request data. Grep for
  `sql.raw` when reviewing.
- **XSS:** React escapes by default. `dangerouslySetInnerHTML` appears twice: the
  theme bootstrap script, which is a constant string, and JSON-LD, where `<` is escaped
  before serialisation so a value cannot close the script element.
- **CSV formula injection:** exported cells beginning `=`, `+`, `-`, `@`, tab or CR are
  prefixed with a quote. Without this an exported value executes when the file opens in
  Excel or Sheets. Tested in `src/lib/util/csv.test.ts`.
- **Markdown:** guide content is typed data, not parsed markup. The only inline
  convention is `**bold**`, handled by a small renderer that emits React elements — no
  HTML parser is involved.

### Server-side request forgery

The alert system takes a user-supplied URL, which is the classic SSRF hole.
`validateDiscordWebhook` requires HTTPS, a hostname on a fixed Discord allow-list, and
a `/api/webhooks/` path — and it runs **on every send**, not only on save, so a row
edited by any other means is still checked. Tests cover metadata endpoints, loopback,
RFC1918 addresses and look-alike hostnames.

The upstream client only ever builds URLs from a configured base plus internal path
templates. No user input reaches it.

### Authentication

- Magic links only. **No password is stored, because none exists.**
- Session tokens are 32 bytes from `randomBytes`, stored only as SHA-256 hashes.
  Unsalted is correct here and not for passwords: these are high-entropy random values
  with no dictionary to attack.
- Cookies are `HttpOnly` (an XSS bug cannot exfiltrate a session), `SameSite=Lax`
  (blocks ordinary CSRF), and `Secure` in production.
- Login tokens expire in 15 minutes and are single-use. Consumption is a conditional
  `UPDATE ... WHERE consumed_at IS NULL`, so two simultaneous redemptions cannot both
  succeed.
- Sign-in requests are rate limited per client, and the response is identical whether
  or not the address has an account — telling a stranger which emails are registered is
  an enumeration leak.
- **Sessions are stateful on purpose.** A JWT could not be revoked; sign-out and
  "sign out everywhere" must take effect immediately, not at expiry.

### Authorisation

- Ownership is part of the `WHERE` clause, never a check after loading a row. A guessed
  alert id simply matches nothing. This is the structural fix for IDOR.
- Admin access comes from `ADMIN_EMAILS`, deliberately **configuration rather than a
  database column**, so no write to the users table can escalate to administrator.
- `/admin` redirects rather than returning 403, so an unauthenticated visitor does not
  learn the path exists.

### CSRF

Mutations are Server Actions, which Next.js protects with an origin check. This was
chosen over a hand-rolled token scheme precisely because hand-rolled CSRF is the sort
of thing that is quietly wrong for a year.

### Transport and headers

Set in `next.config.ts` for every response:

`Content-Security-Policy` · `Strict-Transport-Security` (2 years, preload) ·
`X-Content-Type-Options: nosniff` · `X-Frame-Options: DENY` ·
`Referrer-Policy: strict-origin-when-cross-origin` · `Permissions-Policy` (camera,
microphone, geolocation denied) · `Cross-Origin-Opener-Policy: same-origin`

CSP notes: `script-src` needs `'unsafe-inline'` for Next's bootstrap, and `'unsafe-eval'`
in development only. `img-src` allows the game's asset origin so product artwork can be
referenced without re-hosting. **A nonce-based CSP is the outstanding hardening item.**

### Input validation

Every external input is parsed with Zod before use: API query strings, form data,
environment variables, upstream responses, and anything read back from browser storage
(which is user-editable, so it is treated as untrusted — bounds on numbers, caps on
strings, malformed entries dropped rather than failing the whole import).

### Rate limiting

Applied to sign-in and alert creation. Fails **open** on a cache error: a limiter that
fails closed turns a cache outage into a total outage, and these limits guard against
nuisance and cost rather than a determined attacker.

### Logging

The structured logger redacts a fixed set of key names defensively, but the real rule
is that tokens, cookies and secrets are never passed to it. Sign-in links are returned
to the browser in development only — writing a working link into production logs would
make log access equal account access.

---

## Why we will never hold game credentials

Sim Companies provides **no** third-party authorisation: no OAuth, no API tokens,
nothing. The only way any site could read your private company data is by holding your
game login.

We will not ask for it. Not encrypted, not "only in your browser", not at all. The
feature is not worth teaching players that handing a game login to a fan site is
normal — and once that norm exists, the next site to ask will not be careful with it.

The consequence is that the company advisor works from data the player enters, kept in
their browser and analysed there. It cannot sync across devices and cannot run while
the browser is closed. Those limits are stated on the page, not buried.

---

## Data handling

- **Minimisation.** Email address, alerts, alert history. No names, no profiles, no
  behavioural tracking, no third-party analytics.
- **Deletion.** The delete button removes the account immediately; foreign keys cascade
  to sessions, watchlists, alerts, alert events and linked companies. No soft delete.
- **Encryption at rest.** Delegate to the managed database provider. Webhook URLs
  warrant application-level encryption before launch — see outstanding items.
- **Retention.** Sessions expire and are deleted. Login tokens expire in 15 minutes.
  Detailed market snapshots are pruned after ~3 weeks once aggregated; candles are kept
  because they cannot be reconstructed.

---

## Public Beta security status

The v0.1 Public Beta keeps accounts and server-side alerts disabled. Before those
gated features are exposed publicly, `alerts.destination` must be encrypted at rest
and the authentication and delivery paths must receive another security review.

The public API routes are rate limited per hashed client key in addition to their
existing input and range caps:

- `/api/search`: 120 requests per minute.
- `/api/history`: 60 requests per minute.
- `/api/export`: 20 requests per five minutes.

Production uses the shared Redis cache for these fixed-window limits. They fail open
if the cache is unavailable by design: the limits reduce nuisance and cost
amplification rather than acting as the application's primary security boundary.

CI runs the complete `npm run verify` release gate and fails on high- or
critical-severity `npm audit` findings.

### Outstanding hardening

1. **Nonce-based CSP**, removing `'unsafe-inline'` from `script-src`.
2. **Confirm the upstream contract** with the game's operators (see the research doc).
3. **Passkeys** before reconsidering the authentication model for gated account features.

## Reporting a vulnerability

Open a private security advisory on the repository. Please do not file a public issue
for anything exploitable.
