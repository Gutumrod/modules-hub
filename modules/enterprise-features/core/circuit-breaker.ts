import { CircuitBreakerConfig, CircuitState, CircuitBreakerStatus } from './types.js';

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private lastFailureTime?: number;
  private nextAttemptTime?: number;

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.updateState();

    if (this.state === 'OPEN') {
      throw new Error('Circuit breaker is OPEN');
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
    if (this.state === 'OPEN' && this.nextAttemptTime && Date.now() >= this.nextAttemptTime) {
      this.state = 'HALF_OPEN';
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      this.failures = 0;
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN' || this.failures >= this.config.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttemptTime = Date.now() + this.config.resetTimeoutMs;
    }
  }

  getStatus(): CircuitBreakerStatus {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }
}
