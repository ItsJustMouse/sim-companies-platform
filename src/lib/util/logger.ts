/**
 * Minimal structured logger.
 *
 * Emits one JSON object per line so a log shipper can parse it without a parser
 * config. Deliberately dependency-free.
 *
 * Never log secrets: this module redacts a fixed set of key names defensively, but
 * the real rule is that callers must not pass tokens, cookies or passwords at all.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const REDACT = /^(authorization|cookie|set-cookie|password|token|secret|api[_-]?key|session|auth_secret)$/i;

function threshold(): number {
  const configured = (process.env.LOG_LEVEL ?? 'info') as Level;
  return ORDER[configured] ?? ORDER.info;
}

function sanitise(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]';
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (Array.isArray(value)) return value.slice(0, 25).map((v) => sanitise(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT.test(k) ? '[redacted]' : sanitise(v, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(level: Level, msg: string, fields?: Record<string, unknown>): void {
  if (ORDER[level] < threshold()) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...(fields ? (sanitise(fields) as Record<string, unknown>) : {}),
  });
  if (level === 'error' || level === 'warn') console.error(line);
  else console.warn(line);
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit('debug', msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit('error', msg, fields),
};
