export type FeatureFlagErrorCode =
  | 'FLAG_KEY_INVALID'
  | 'FLAG_PROVIDER_ERROR'
  | 'FLAG_VALUE_INVALID';

export class FeatureFlagError extends Error {
  readonly code: FeatureFlagErrorCode;
  readonly key?: string;
  override readonly cause?: unknown;

  constructor(options: {
    message: string;
    code: FeatureFlagErrorCode;
    key?: string;
    cause?: unknown;
  }) {
    super(options.message);
    this.name = 'FeatureFlagError';
    this.code = options.code;
    this.key = options.key;
    this.cause = options.cause;
  }
}
