import { describe, it, expect, vi } from 'vitest';
import { DefaultJobRunner } from '../../core/runner.js';
import type { Job, JobHandler } from '../../core/types.js';

describe('Job Runner', () => {
  const job: Job = {
    id: 'job-1',
    type: 'test-job',
    payload: {},
    attempt: 1,
    createdAt: new Date().toISOString()
  };

  it('should succeed on first attempt', async () => {
    const handler: JobHandler = {
      execute: vi.fn().mockResolvedValue({ success: true, result: 'done' })
    };
    const runner = new DefaultJobRunner();
    
    const result = await runner.run(handler, job);
    
    expect(result.success).toBe(true);
    expect(result.result).toBe('done');
    expect(handler.execute).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable failure', async () => {
    const handler: JobHandler = {
      execute: vi.fn()
        .mockResolvedValueOnce({ success: false, retryable: true, error: { message: 'fail' } })
        .mockResolvedValueOnce({ success: true, result: 'ok' })
    };
    const runner = new DefaultJobRunner();
    
    const result = await runner.run(handler, job, { initialDelayMs: 1 });
    
    expect(result.success).toBe(true);
    expect(handler.execute).toHaveBeenCalledTimes(2);
  });

  it('should stop retrying if not retryable', async () => {
    const handler: JobHandler = {
      execute: vi.fn().mockResolvedValue({ success: false, retryable: false, error: { message: 'fatal' } })
    };
    const runner = new DefaultJobRunner();
    
    const result = await runner.run(handler, job);
    
    expect(result.success).toBe(false);
    expect(handler.execute).toHaveBeenCalledTimes(1);
  });

  it('should stop after max attempts', async () => {
    const handler: JobHandler = {
      execute: vi.fn().mockResolvedValue({ success: false, retryable: true, error: { message: 'retry' } })
    };
    const runner = new DefaultJobRunner();
    
    const result = await runner.run(handler, job, { maxAttempts: 2, initialDelayMs: 1 });
    
    expect(result.success).toBe(false);
    expect(handler.execute).toHaveBeenCalledTimes(2);
  });

  it('should handle timeout', async () => {
    const handler: JobHandler = {
      execute: vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)))
    };
    const runner = new DefaultJobRunner();
    
    const result = await runner.run(handler, job, { timeoutMs: 10, maxAttempts: 1 });
    
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('timed out');
  });
});
