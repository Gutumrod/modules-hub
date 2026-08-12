import type { HealthChecker, HealthCheckResult } from '../core/types.js';

export class HttpHealthChecker implements HealthChecker {
  constructor(
    public readonly name: string,
    private readonly url: string,
    private readonly options: { timeoutMs?: number } = {}
  ) {}

  async check(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs || 5000);

      const response = await fetch(this.url, { signal: controller.signal });
      clearTimeout(timeout);

      const duration = Date.now() - start;

      if (response.ok) {
        return {
          status: 'UP',
          timestamp: new Date().toISOString(),
          details: {
            url: this.url,
            statusCode: response.status,
            responseTimeMs: duration
          }
        };
      }

      return {
        status: 'DOWN',
        message: `HTTP check failed with status ${response.status}`,
        timestamp: new Date().toISOString(),
        details: { url: this.url, statusCode: response.status }
      };
    } catch (error: any) {
      return {
        status: 'DOWN',
        message: error.name === 'AbortError' ? 'Timeout' : error.message,
        timestamp: new Date().toISOString(),
        details: { url: this.url }
      };
    }
  }
}
