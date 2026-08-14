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

export interface TracerConfig {
  serviceName: string;
  environment?: string;
  version?: string;
}
