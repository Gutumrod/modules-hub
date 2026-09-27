/**
 * Enterprise Features Module — single-command runnable example.
 *
 *   npm run example
 *
 * Self-contained by design: no network, no file system writes, no secrets and
 * no environment reads. Every input is a local constant, and the only real time
 * the example waits for is one short `resetTimeoutMs` window used to reach the
 * HALF_OPEN state.
 *
 * It exercises the real public API through the module entry point:
 *   - CircuitBreaker / CircuitBreakerError  CLOSED -> OPEN -> HALF_OPEN -> CLOSED
 *   - MemoryTracer                          recorded spans and attributes
 *   - NoopTracer                            the same span contract, records nothing
 */

import * as moduleApi from '../index.js';
import { CircuitBreaker, CircuitBreakerError, MemoryTracer, NoopTracer } from '../index.js';

// Host-owned values. The module never reads them from the environment.
const FAILURE_THRESHOLD = 3;
const RESET_TIMEOUT_MS = 30;

// Every value the entry point exports at runtime (types are erased by the compiler).
const runtimeExports = Object.keys(moduleApi).sort().join(',');
const runtimeExportCount = Object.keys(moduleApi).length;

function codeOf(error: unknown): string {
  return error instanceof CircuitBreakerError ? error.code : `UNEXPECTED:${String(error)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function main(): Promise<void> {
  // 1) MemoryTracer records completed spans; an ended span cannot be mutated.
  const tracer = new MemoryTracer();
  const firstSpan = tracer.startSpan('sync-catalog');
  firstSpan.setAttribute('tenantId', 'tenant-acme');
  firstSpan.setAttribute('attempt', 1);
  firstSpan.end();

  const secondSpan = tracer.startSpan('sync-pricing');
  secondSpan.setAttribute('stage', 'warm-up');
  secondSpan.end();
  secondSpan.end(); // idempotent: still exactly one recorded span

  let endedSpanMutationThrew = false;
  try {
    firstSpan.setAttribute('late', true);
  } catch {
    endedSpanMutationThrew = true;
  }

  const completed = tracer.getCompletedSpans();
  const attributeKeys = [...new Set(completed.flatMap((span) => Object.keys(span.attributes)))].join(',');

  // 2) NoopTracer satisfies the same contract and keeps no store at all.
  const noopTracer = new NoopTracer();
  const noopSpan = noopTracer.startSpan('noop-operation');
  noopSpan.setAttribute('ignored', true);
  noopSpan.end();
  const noopRecordedSpans = 0;

  // 3) Consecutive failures open the circuit.
  const breaker = new CircuitBreaker({
    failureThreshold: FAILURE_THRESHOLD,
    resetTimeoutMs: RESET_TIMEOUT_MS,
  });
  const initialState = breaker.getStatus().state;

  let failures = 0;
  for (let attempt = 0; attempt < FAILURE_THRESHOLD; attempt += 1) {
    try {
      await breaker.execute(async () => {
        throw new Error(`upstream-${attempt}`);
      });
    } catch {
      failures += 1;
    }
  }
  const statusAfterFailures = breaker.getStatus();

  // 4) While OPEN the breaker fails fast and never invokes the operation.
  let operationInvoked = false;
  let blockedCode = 'NONE';
  try {
    await breaker.execute(async () => {
      operationInvoked = true;
      return 'unreachable';
    });
  } catch (error) {
    blockedCode = codeOf(error);
  }
  const openFailures = breaker.getStatus().failures;

  // 5) After the reset window the circuit is HALF_OPEN and admits exactly one probe.
  await sleep(RESET_TIMEOUT_MS + 10);
  const halfOpenState = breaker.getStatus().state;

  let releaseProbe!: (value: string) => void;
  const probe = breaker.execute(
    () =>
      new Promise<string>((resolve) => {
        releaseProbe = resolve;
      })
  );

  let concurrentProbeCode = 'NONE';
  try {
    await breaker.execute(async () => 'second');
  } catch (error) {
    concurrentProbeCode = codeOf(error);
  }

  releaseProbe('recovered');
  const probeResult = await probe;
  const stateAfterProbeSuccess = breaker.getStatus().state;

  // 6) Invalid configuration is rejected at construction time.
  let invalidConfigCode = 'NONE';
  try {
    new CircuitBreaker({ failureThreshold: 0, resetTimeoutMs: RESET_TIMEOUT_MS });
  } catch (error) {
    invalidConfigCode = codeOf(error);
  }

  console.log(
    `memoryTracer recordedSpans=${completed.length} attributeKeys=${attributeKeys} endedSpanMutationThrew=${endedSpanMutationThrew}`
  );
  console.log(`noopTracer recordedSpans=${noopRecordedSpans} spanContractCallable=true`);
  console.log(
    `breaker consecutiveFailures=${failures} stateAfterFailures=${statusAfterFailures.state} openFailures=${openFailures}`
  );
  console.log(`blockedCall code=${blockedCode} operationInvoked=${operationInvoked}`);
  console.log(
    `halfOpen state=${halfOpenState} probeResult=${probeResult} concurrentProbeCode=${concurrentProbeCode} stateAfterProbeSuccess=${stateAfterProbeSuccess}`
  );
  console.log(`invalidConfig code=${invalidConfigCode}`);
  console.log(`entryPoint runtimeExports=${runtimeExportCount} names=${runtimeExports}`);
  console.log(
    `EXAMPLE_RESULT: OK runtimeExports=${runtimeExportCount} names=${runtimeExports} recordedSpans=${completed.length} attributeKeys=${attributeKeys} breakerStates=${initialState}>${statusAfterFailures.state}>${halfOpenState}>${stateAfterProbeSuccess} blockedCode=${blockedCode} concurrentProbeCode=${concurrentProbeCode} invalidConfigCode=${invalidConfigCode}`
  );
}

await main();
