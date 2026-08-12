import { describe, it, expect } from 'vitest';
import { MemoryJobStorage } from '../../adapters/memory-job-storage';
import { MemoryDistributedLock } from '../../../scheduler/adapters/distributed-lock';

describe('Job Persistence & Distributed Lock (Enterprise v0.2.0)', () => {
  it('should save and update persistent jobs successfully', async () => {
    const storage = new MemoryJobStorage();
    const job = {
      id: 'job-1',
      name: 'send-email',
      payload: { to: 'test@example.com' },
      status: 'pending' as const,
      attempts: 0,
      maxAttempts: 3,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await storage.saveJob(job);
    const retrieved = await storage.getJob('job-1');
    expect(retrieved?.status).toBe('pending');

    await storage.updateJobStatus('job-1', 'completed');
    const updated = await storage.getJob('job-1');
    expect(updated?.status).toBe('completed');
  });

  it('should handle DLQ movement correctly', async () => {
    const storage = new MemoryJobStorage();
    const job = {
      id: 'job-2',
      name: 'process-payment',
      payload: { amount: 100 },
      status: 'failed' as const,
      attempts: 3,
      maxAttempts: 3,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await storage.saveJob(job);
    await storage.moveToDlq('job-2', 'Max attempts exceeded');

    const dlqList = storage.getDlqJobs();
    expect(dlqList.length).toBe(1);
    expect(dlqList[0].reason).toBe('Max attempts exceeded');
  });

  it('should acquire and release distributed locks correctly', async () => {
    const locker = new MemoryDistributedLock();
    const lockKey = 'cron:daily-report';

    const acquired1 = await locker.acquireLock(lockKey, 5000);
    expect(acquired1).toBe(true);

    // Second attempt should fail while locked
    const acquired2 = await locker.acquireLock(lockKey, 5000);
    expect(acquired2).toBe(false);

    await locker.releaseLock(lockKey);
    const acquired3 = await locker.acquireLock(lockKey, 5000);
    expect(acquired3).toBe(true);
  });
});
