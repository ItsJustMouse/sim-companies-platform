export type UpstreamErrorKind =
  | 'disabled'
  | 'timeout'
  | 'network'
  | 'http'
  | 'rate-limited'
  | 'circuit-open'
  | 'invalid-response';

export class UpstreamError extends Error {
  readonly kind: UpstreamErrorKind;
  readonly status: number | undefined;
  readonly path: string;
  readonly retryable: boolean;

  constructor(args: {
    kind: UpstreamErrorKind;
    message: string;
    path: string;
    status?: number;
    retryable?: boolean;
    cause?: unknown;
  }) {
    super(args.message, args.cause === undefined ? undefined : { cause: args.cause });
    this.name = 'UpstreamError';
    this.kind = args.kind;
    this.status = args.status;
    this.path = args.path;
    this.retryable = args.retryable ?? false;
  }
}

export function isUpstreamError(e: unknown): e is UpstreamError {
  return e instanceof UpstreamError;
}
