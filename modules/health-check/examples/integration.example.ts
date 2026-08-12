import { 
  HealthCheckRegistry, 
  HttpHealthChecker,
  type HealthChecker,
  type HealthCheckResult
} from '../index.js';

/**
 * 1. Define a Custom Checker (e.g. Database)
 */
class DatabaseHealthChecker implements HealthChecker {
  readonly name = 'database';
  async check(): Promise<HealthCheckResult> {
    // In a real app, you would ping the DB here
    const isConnected = true; 
    
    return {
      status: isConnected ? 'UP' : 'DOWN',
      timestamp: new Date().toISOString(),
      details: {
        engine: 'PostgreSQL',
        poolSize: 10
      }
    };
  }
}

/**
 * 2. Setup Health Registry
 */
const registry = new HealthCheckRegistry('1.0.0');

// Register checkers
registry.register(new DatabaseHealthChecker());
registry.register(new HttpHealthChecker('stripe-api', 'https://api.stripe.com', { timeoutMs: 3000 }));

/**
 * 3. Generate Report
 * This would typically be exposed via an API endpoint like /health
 */
async function runExample() {
  console.log('Generating Health Report...');
  const report = await registry.getReport();
  
  console.log('Overall Status:', report.status);
  console.log(JSON.stringify(report, null, 2));
}

runExample();
