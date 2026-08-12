import { describe, it, expect, vi } from 'vitest';
import { HealthCheckRegistry } from '../../core/registry.js';
// import type { HealthChecker } from '../../core/types.js';

describe('Health Check Registry', () => {
  it('should aggregate status correctly (UP)', async () => {
    const registry = new HealthCheckRegistry();
    registry.register({
      name: 'db',
      check: vi.fn().mockResolvedValue({ status: 'UP', timestamp: '' })
    });
    
    const report = await registry.getReport();
    expect(report.status).toBe('UP');
  });

  it('should aggregate status correctly (DOWN)', async () => {
    const registry = new HealthCheckRegistry();
    registry.register({
      name: 'db',
      check: vi.fn().mockResolvedValue({ status: 'UP', timestamp: '' })
    });
    registry.register({
      name: 'api',
      check: vi.fn().mockResolvedValue({ status: 'DOWN', timestamp: '' })
    });
    
    const report = await registry.getReport();
    expect(report.status).toBe('DOWN');
  });

  it('should aggregate status correctly (DEGRADED)', async () => {
    const registry = new HealthCheckRegistry();
    registry.register({
      name: 'cache',
      check: vi.fn().mockResolvedValue({ status: 'DEGRADED', timestamp: '' })
    });
    
    const report = await registry.getReport();
    expect(report.status).toBe('DEGRADED');
  });

  it('should handle checker errors gracefully', async () => {
    const registry = new HealthCheckRegistry();
    registry.register({
      name: 'bad-checker',
      check: vi.fn().mockRejectedValue(new Error('Crash'))
    });
    
    const report = await registry.getReport();
    expect(report.status).toBe('DOWN');
    expect(report.checks['bad-checker'].message).toBe('Crash');
  });
});
