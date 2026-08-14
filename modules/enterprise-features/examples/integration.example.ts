import { CircuitBreaker, MemoryTracer } from '../index.js';

const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 5_000 });
const tracer = new MemoryTracer();

export async function runProtectedOperation<T>(operation: () => Promise<T>): Promise<T> {
  const span = tracer.startSpan('protected-operation');
  try {
    const result = await breaker.execute(operation);
    span.setAttribute('success', true);
    return result;
  } catch (error) {
    span.setAttribute('success', false);
    throw error;
  } finally {
    span.end();
  }
}

export function completedSpans() {
  return tracer.getCompletedSpans();
}
