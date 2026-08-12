import { describe, it, expect } from 'vitest';
import { SimpleMetricsCollector } from '../../core/metrics-collector';

describe('SimpleMetricsCollector (Enterprise v0.2.0)', () => {
  it('should increment counters and export Prometheus format correctly', () => {
    const collector = new SimpleMetricsCollector();
    collector.incrementCounter('http_requests_total', { method: 'GET', status: '200' });
    collector.incrementCounter('http_requests_total', { method: 'GET', status: '200' });

    const output = collector.exportPrometheusMetrics();
    expect(output).toContain('# TYPE http_requests_total{method="GET",status="200"} counter');
    expect(output).toContain('http_requests_total{method="GET",status="200"} 2');
  });

  it('should record latencies and calculate averages correctly', () => {
    const collector = new SimpleMetricsCollector();
    collector.recordLatency('db_query', 50);
    collector.recordLatency('db_query', 100);

    const output = collector.exportPrometheusMetrics();
    expect(output).toContain('# TYPE db_query_latency_ms gauge');
    expect(output).toContain('db_query_latency_ms_avg 75');
    expect(output).toContain('db_query_latency_ms_count 2');
  });
});
