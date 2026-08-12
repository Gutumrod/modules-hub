import { MetricsCollector } from './types';

export class SimpleMetricsCollector implements MetricsCollector {
  private counters = new Map<string, number>();
  private latencies = new Map<string, number[]>();

  incrementCounter(name: string, labels?: Record<string, string>): void {
    const key = this.formatKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + 1);
  }

  recordLatency(name: string, latencyMs: number, labels?: Record<string, string>): void {
    const key = this.formatKey(name, labels);
    const list = this.latencies.get(key) || [];
    list.push(latencyMs);
    // Keep last 100 entries for memory efficiency on edge
    if (list.length > 100) list.shift();
    this.latencies.set(key, list);
  }

  exportPrometheusMetrics(): string {
    const lines: string[] = [];

    for (const [key, value] of this.counters.entries()) {
      lines.push(`# TYPE ${key} counter`);
      lines.push(`${key} ${value}`);
    }

    for (const [key, values] of this.latencies.entries()) {
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = values.length > 0 ? sum / values.length : 0;
      lines.push(`# TYPE ${key}_latency_ms gauge`);
      lines.push(`${key}_latency_ms_avg ${avg}`);
      lines.push(`${key}_latency_ms_count ${values.length}`);
    }

    return lines.join('\n') + '\n';
  }

  private formatKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }
    const labelStr = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `${name}{${labelStr}}`;
  }
}
