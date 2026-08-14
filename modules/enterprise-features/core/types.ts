export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  monitorIntervalMs?: number;
}

export interface CircuitBreakerStatus {
  state: CircuitState;
  failures: number;
  lastFailureTime?: number;
  nextAttemptTime?: number;
}

export type CircuitBreakerErrorCode = 'CIRCUIT_OPEN' | 'HALF_OPEN_PROBE_IN_PROGRESS' | 'INVALID_CONFIG';

export interface TracerConfig {
  serviceName: string;
  environment?: string;
  version?: string;
}

export type SpanAttributeValue = string | number | boolean;

export interface Span {
  setAttribute(key: string, value: SpanAttributeValue): void;
  end(): void;
}

export interface Tracer {
  startSpan(name: string): Span;
}

export interface RecordedSpan {
  readonly name: string;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly durationMs: number;
  readonly attributes: Readonly<Record<string, SpanAttributeValue>>;
}
