import { describe, expect, it } from 'vitest';
import { validateDiscordWebhook } from './deliver';

/**
 * These tests guard an SSRF boundary, so they focus on what must be *rejected*.
 */
describe('validateDiscordWebhook', () => {
  it('accepts a genuine Discord webhook', () => {
    expect(validateDiscordWebhook('https://discord.com/api/webhooks/123/abcdef')).toEqual({ ok: true });
    expect(validateDiscordWebhook('https://canary.discord.com/api/webhooks/1/x')).toEqual({ ok: true });
  });

  it('rejects non-https URLs', () => {
    const result = validateDiscordWebhook('http://discord.com/api/webhooks/1/x');
    expect(result.ok).toBe(false);
  });

  it('rejects internal and private addresses', () => {
    for (const url of [
      'https://169.254.169.254/latest/meta-data/',
      'https://localhost/api/webhooks/1/x',
      'https://127.0.0.1/api/webhooks/1/x',
      'https://10.0.0.5/api/webhooks/1/x',
      'https://192.168.1.1/api/webhooks/1/x',
      'https://[::1]/api/webhooks/1/x',
    ]) {
      expect(validateDiscordWebhook(url).ok, url).toBe(false);
    }
  });

  it('rejects look-alike hostnames', () => {
    for (const url of [
      'https://discord.com.evil.example/api/webhooks/1/x',
      'https://evil.example/discord.com/api/webhooks/1/x',
      'https://notdiscord.com/api/webhooks/1/x',
    ]) {
      expect(validateDiscordWebhook(url).ok, url).toBe(false);
    }
  });

  it('rejects a Discord URL that is not a webhook path', () => {
    expect(validateDiscordWebhook('https://discord.com/api/users/@me').ok).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(validateDiscordWebhook('not a url').ok).toBe(false);
    expect(validateDiscordWebhook('').ok).toBe(false);
    expect(validateDiscordWebhook('javascript:alert(1)').ok).toBe(false);
  });
});
