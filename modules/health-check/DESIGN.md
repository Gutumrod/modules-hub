# Health Check Module — DESIGN.md (v0.2.0)

**Version:** 0.2.0 (P2, Observability & Metrics)
**Status:** Implemented and verified against source (registry, HTTP checker, in-memory metrics collector). This document was originally written before implementation and its type sketches diverged from what shipped; it has been corrected below to match `core/types.ts`.
**Language / runtime:** TypeScript, ES2022, strict mode.

---

## 1. Purpose & Architectural Objectives

The **Health Check Module** aggregates status from registered checkers into a single report (`UP`/`DOWN`/`DEGRADED`) and provides an in-memory metrics collector that can export counters/latencies in a Prometheus-like text format.

> **Verified boundary (as implemented):**
> - `SimpleMetricsCollector` (in-memory counters + latency averages, `exportPrometheusMetrics()` string export) exists in `core/metrics-collector.ts`.
> - Only one built-in checker ships: `HttpHealthChecker` (`adapters/http-checker.ts`). There is **no** Database or Redis checker adapter, and no standalone "Prometheus Exporter Adapter" — Prometheus-format export is a single method on `SimpleMetricsCollector`, not a separate adapter class. Deep dependency probes (DB, Redis, etc.) must be hand-written by the consumer using the `HealthChecker` interface.

---

## 2. Core Domain Models & Interfaces (as implemented, `core/types.ts`)

```ts
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
```

Note: earlier drafts of this document used `ComponentHealth` / `SystemHealthReport` / `'healthy' | 'degraded' | 'unhealthy'` naming. That schema was never implemented — the actual shipped names are `HealthCheckResult` / `HealthReport` / `'UP' | 'DOWN' | 'DEGRADED'`, as shown above.
