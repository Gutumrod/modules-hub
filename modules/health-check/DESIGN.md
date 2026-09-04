# Health Check Module — DESIGN.md (Enterprise v0.2.0)

**Version:** 0.2.0
**Status:** ✅ Completed
**Documentation Authority:** Current version/status follow `../REGISTRY.md`; this document describes the module contract/design for that registered version.

**Language / runtime:** TypeScript, ES2022, strict mode.

---

## 1. Purpose & Architectural Objectives

The **Health Check Module** provides system health status, readiness/liveness probes, and Prometheus-compatible metrics export for enterprise observability.

> **CRITICAL BOUNDARY:**
> - v0.2.0 introduces **Metrics Collector** and **Prometheus Exporter Adapter**.
> - Separates basic ping checks from deep dependency probes (Database, Redis, External APIs).

---

## 2. Core Domain Models & Interfaces (v0.2.0)

### 2.1 Metrics & Health Interfaces
```ts
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export type ComponentHealth = {
  name: string;
  status: HealthStatus;
  latencyMs: number;
  message?: string;
};

export type SystemHealthReport = {
  status: HealthStatus;
  timestamp: number;
  uptimeSeconds: number;
  components: ComponentHealth[];
};

export interface MetricsCollector {
  incrementCounter(name: string, labels?: Record<string, string>): void;
  recordLatency(name: string, latencyMs: number, labels?: Record<string, string>): void;
  exportPrometheusMetrics(): string;
}
```
