import type { 
  HealthChecker, 
  HealthCheckResult, 
  HealthRegistry, 
  HealthReport, 
  HealthStatus 
} from './types.js';

export class HealthCheckRegistry implements HealthRegistry {
  private checkers: Map<string, HealthChecker> = new Map();

  constructor(private version?: string) {}

  register(checker: HealthChecker): void {
    this.checkers.set(checker.name, checker);
  }

  unregister(name: string): void {
    this.checkers.delete(name);
  }

  async getReport(): Promise<HealthReport> {
    const checks: Record<string, HealthCheckResult> = {};
    let overallStatus: HealthStatus = 'UP';

    const results = await Promise.all(
      Array.from(this.checkers.values()).map(async (checker) => {
        try {
          const result = await checker.check();
          return { name: checker.name, result };
        } catch (error: any) {
          return {
            name: checker.name,
            result: {
              status: 'DOWN' as HealthStatus,
              message: error.message || 'Check failed',
              timestamp: new Date().toISOString(),
              details: { error }
            }
          };
        }
      })
    );

    for (const { name, result } of results) {
      checks[name] = result;
      
      if (result.status === 'DOWN') {
        overallStatus = 'DOWN';
      } else if (result.status === 'DEGRADED' && overallStatus !== 'DOWN') {
        overallStatus = 'DEGRADED';
      }
    }

    return {
      status: overallStatus,
      checks,
      timestamp: new Date().toISOString(),
      version: this.version
    };
  }
}
