export type HealthStatus = 'UP' | 'DOWN' | 'DEGRADED';

export type HealthCheckResult = {
  readonly status: HealthStatus;
  readonly message?: string;
  readonly timestamp: string;
  readonly details?: Record<string, unknown>;
};

export type HealthReport = {
  readonly status: HealthStatus;
  readonly checks: Record<string, HealthCheckResult>;
  readonly timestamp: string;
  readonly version?: string;
};

export interface HealthChecker {
  readonly name: string;
  check(): Promise<HealthCheckResult>;
}

export interface HealthRegistry {
  register(checker: HealthChecker): void;
  unregister(name: string): void;
  getReport(): Promise<HealthReport>;
}

export interface MetricsCollector {
  incrementCounter(name: string, labels?: Record<string, string>): void;
  recordLatency(name: string, latencyMs: number, labels?: Record<string, string>): void;
  exportPrometheusMetrics(): string;
}
