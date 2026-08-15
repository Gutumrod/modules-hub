import type { CircuitBreakerConfig, CircuitBreakerErrorCode, CircuitBreakerStatus, CircuitState } from './types.js';

export class CircuitBreakerError extends Error {
  override readonly name = 'CircuitBreakerError';
  constructor(readonly code: CircuitBreakerErrorCode, message: string) {
    super(message);
  }
}

function validateConfig(config: CircuitBreakerConfig): void {
  if (!Number.isSafeInteger(config.failureThreshold) || config.failureThreshold <= 0) {
    throw new CircuitBreakerError('INVALID_CONFIG', 'failureThreshold must be a positive safe integer');
  }
  if (!Number.isFinite(config.resetTimeoutMs) || config.resetTimeoutMs <= 0) {
    throw new CircuitBreakerError('INVALID_CONFIG', 'resetTimeoutMs must be a positive finite number');
  }
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private lastFailureTime?: number;
  private nextAttemptTime?: number;
  private halfOpenProbeInFlight = false;

  constructor(private readonly config: CircuitBreakerConfig) {
    validateConfig(config);
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.updateState();
    if (this.state === 'OPEN') {
      throw new CircuitBreakerError('CIRCUIT_OPEN', 'Circuit breaker is open');
    }
    if (this.state === 'HALF_OPEN') {
      if (this.halfOpenProbeInFlight) {
        throw new CircuitBreakerError('HALF_OPEN_PROBE_IN_PROGRESS', 'Circuit breaker half-open probe is already in progress');
      }
      this.halfOpenProbeInFlight = true;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private updateState(): void {
    if (this.state === 'OPEN' && this.nextAttemptTime !== undefined && Date.now() >= this.nextAttemptTime) {
      this.state = 'HALF_OPEN';
      this.halfOpenProbeInFlight = false;
    }
  }

  private onSuccess(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.lastFailureTime = undefined;
    this.nextAttemptTime = undefined;
    this.halfOpenProbeInFlight = false;
  }

  private onFailure(): void {
    this.halfOpenProbeInFlight = false;
    this.failures += 1;
    this.lastFailureTime = Date.now();
    if (this.state === 'HALF_OPEN' || this.failures >= this.config.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttemptTime = this.lastFailureTime + this.config.resetTimeoutMs;
    }
  }

  getStatus(): CircuitBreakerStatus {
    this.updateState();
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }
}
