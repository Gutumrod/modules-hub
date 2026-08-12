export interface ConfigField {
  /** Field is required. Mutually exclusive with `default`. */
  required?: boolean;
  /** Default value applied when the field is absent. Mutually exclusive with `required: true`. */
  default?: unknown;
  /** Mark as secret -> redacted to `[REDACTED]` when serialized. */
  secret?: boolean;
  /** Validation spec. If omitted, the field is passed through as-is. */
  validate?: Validator;
}

export type Validator =
  | { type: 'string' }
  | { type: 'integer'; min?: number; max?: number }
  | { type: 'positiveNumber'; min?: number; max?: number }
  | { type: 'boolean' }
  | { type: 'url' }
  | { type: 'enum'; values: readonly string[] }
  | { type: 'custom'; fn: (value: unknown) => boolean | string };

export type ConfigSchema = Readonly<Record<string, Readonly<ConfigField>>>;

/** Result of parseConfig / validateConfig. Immutable (frozen). */
export type ParsedConfig = Readonly<Record<string, unknown>>;

/** Result of redactConfig. Secret fields replaced with "[REDACTED]". */
export type RedactedConfig = Readonly<Record<string, unknown>>;

export interface RuntimeContext {
  environment?: string;
  runtime?: string;
  region?: string;
  requestId?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

export interface ConfigError {
  code: ConfigErrorCode;
  field: string;
  message: string;
}

export type ConfigErrorCode =
  | 'CONFIG_MISSING'
  | 'CONFIG_INVALID'
  | 'CONFIG_TYPE_INVALID'
  | 'CONFIG_VALUE_OUT_OF_RANGE'
  | 'RUNTIME_CONTEXT_INVALID';
