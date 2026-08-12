import { DEFAULT_RETRY_POLICY, calculateNextDelay, sleep } from './policy.js';
import type { 
  Job, 
  JobHandler, 
  JobResult, 
  JobRunner, 
  RetryPolicy 
} from './types.js';

export class DefaultJobRunner implements JobRunner {
  async run<TPayload, TResult>(
    handler: JobHandler<TPayload, TResult>,
    initialJob: Job<TPayload>,
    overrides?: Partial<RetryPolicy>
  ): Promise<JobResult<TResult>> {
    const policy = { ...DEFAULT_RETRY_POLICY, ...overrides };
    let currentJob = { ...initialJob };
    let lastResult: JobResult<TResult> | null = null;

    const maxAttempts = currentJob.maxAttempts ?? policy.maxAttempts;

    while (currentJob.attempt <= maxAttempts) {
      // 1. Wait for backoff if not the first attempt
      if (currentJob.attempt > 1) {
        const delay = calculateNextDelay(currentJob.attempt, policy);
        await sleep(delay);
      }

      // 2. Execute handler with timeout
      try {
        lastResult = await this.executeWithTimeout(handler, currentJob, policy.timeoutMs);
        
        if (lastResult.success) {
          return lastResult;
        }

        // 3. Decide if we should retry
        if (!lastResult.retryable || currentJob.attempt >= maxAttempts) {
          return lastResult;
        }
      } catch (error: any) {
        lastResult = {
          success: false,
          retryable: true, // Errors like timeout or crash are usually retryable
          error: {
            message: error.message || 'Unexpected execution error',
            stack: error.stack
          }
        };

        if (currentJob.attempt >= maxAttempts) {
          return lastResult;
        }
      }

      // 4. Increment attempt for next loop
      currentJob = {
        ...currentJob,
        attempt: currentJob.attempt + 1
      };
    }

    return lastResult!;
  }

  private async executeWithTimeout<TPayload, TResult>(
    handler: JobHandler<TPayload, TResult>,
    job: Job<TPayload>,
    timeoutMs?: number
  ): Promise<JobResult<TResult>> {
    if (!timeoutMs) {
      return await handler.execute(job);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Job execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      handler.execute(job)
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(err => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}
