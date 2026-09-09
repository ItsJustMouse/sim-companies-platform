import { env } from '@/lib/env';
import { log } from '@/lib/util/logger';

/**
 * Alert delivery.
 *
 * Channels are pluggable so more can be added without touching the evaluator. Two
 * exist today; both fail soft, because a delivery failure must never lose the alert
 * event itself — the history page is the fallback record.
 *
 * Email requires SMTP credentials that this deployment may not have. Rather than
 * pretending to send, an unconfigured channel returns `failed` with a reason the
 * admin dashboard displays.
 */

export type DeliveryStatus = 'sent' | 'failed' | 'suppressed';

export interface DeliveryResult {
  status: DeliveryStatus;
  detail?: string;
}

export interface DeliveryRequest {
  channel: string;
  destination: string | null;
  userId: string;
  message: string;
}

export async function deliver(request: DeliveryRequest): Promise<DeliveryResult> {
  switch (request.channel) {
    case 'discord':
      return deliverDiscord(request);
    case 'email':
      return deliverEmail(request);
    case 'none':
      // In-app only: the alert history is the delivery.
      return { status: 'suppressed', detail: 'In-app only; see alert history.' };
    default:
      return { status: 'failed', detail: `Unknown channel "${request.channel}".` };
  }
}

/**
 * Discord webhook.
 *
 * The destination is validated at creation time (see `assertDiscordWebhook`) and
 * re-validated here. Posting to an arbitrary user-supplied URL from the server is a
 * textbook SSRF, so the host allow-list is enforced on every send, not just on save.
 */
async function deliverDiscord(request: DeliveryRequest): Promise<DeliveryResult> {
  if (!request.destination) return { status: 'failed', detail: 'No webhook configured.' };

  const validation = validateDiscordWebhook(request.destination);
  if (!validation.ok) return { status: 'failed', detail: validation.reason };

  try {
    const response = await fetch(request.destination, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Simconomist',
        // Discord renders this as markdown; the message is our own text built from
        // numbers, never user-supplied content, so there is nothing to inject.
        content: request.message.slice(0, 1900),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return { status: 'failed', detail: `Discord returned HTTP ${response.status}.` };
    return { status: 'sent' };
  } catch (error) {
    return { status: 'failed', detail: error instanceof Error ? error.message : 'Delivery failed.' };
  }
}

async function deliverEmail(request: DeliveryRequest): Promise<DeliveryResult> {
  if (!env().SMTP_URL) {
    // Deliberately explicit rather than silently dropping: the alert history will
    // show exactly why nothing arrived.
    return { status: 'failed', detail: 'Email delivery is not configured on this deployment (SMTP_URL unset).' };
  }

  // Sending is intentionally not implemented until an SMTP transport is configured
  // for the deployment; see docs/BUILD_STATE.md. The interface is stable, so adding
  // it is a single function body.
  log.warn('email delivery requested but no transport is wired', { userId: request.userId });
  return { status: 'failed', detail: 'Email transport not yet implemented.' };
}

/**
 * Discord webhook validation.
 *
 * Restricted to Discord's own webhook host over HTTPS. Without this, an "alert
 * destination" field is a server-side request forgery primitive: a user could point
 * it at internal metadata endpoints or private network addresses and have our server
 * fetch them.
 */
export function validateDiscordWebhook(value: string): { ok: true } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: 'Not a valid URL.' };
  }

  if (url.protocol !== 'https:') return { ok: false, reason: 'Webhook must use https.' };

  const allowedHosts = new Set(['discord.com', 'discordapp.com', 'ptb.discord.com', 'canary.discord.com']);
  if (!allowedHosts.has(url.hostname)) {
    return { ok: false, reason: 'Only Discord webhook URLs are accepted.' };
  }

  if (!url.pathname.startsWith('/api/webhooks/')) {
    return { ok: false, reason: 'That does not look like a Discord webhook path.' };
  }

  return { ok: true };
}
