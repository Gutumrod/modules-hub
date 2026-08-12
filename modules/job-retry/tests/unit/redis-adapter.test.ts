import { describe, it, expect } from 'vitest';
import { RedisJobStorage, RedisLockProvider, RedisClientLike } from '../../adapters/redis-job-storage.js';
import { PersistentJob } from '../../core/types.js';

class MockRedisClient implements RedisClientLike {
  private store = new Map<string, string>();

  async hset(key: string, field: string, value: string): Promise<any> {
    this.store.set(`${key}:${field}`, value);
    return 1;
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.store.get(`${key}:${field}`) ?? null;
  }

  async hdel(key: string, ...fields: string[]): Promise<any> {
    for (const f of fields) {
      this.store.delete(`${key}:${f}`);
    }
    return fields.length;
  }

  async set(key: string, value: string, mode?: string, duration?: number, flag?: string): Promise<any> {
    if (flag === 'NX' && this.store.has(key)) {
      return null;
    }
    this.store.set(key, value);
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async del(key: string): Promise<any> {
    const existed = this.store.has(key);
    this.store.delete(key);
    return existed ? 1 : 0;
  }
}

describe('Redis Job Storage & Distributed Lock Adapters', () => {
  it('should save and retrieve jobs correctly using RedisJobStorage adapter', async () => {
    const client = new MockRedisClient();
    const storage = new RedisJobStorage(client);

    const job: PersistentJob = {
      id: 'job-123',
      name: 'send-email',
      payload: { to: 'test@example.com' },
      status: 'pending',
      attempts: 0,
      maxAttempts: 3,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await storage.saveJob(job);
    const retrieved = await storage.getJob('job-123');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe('job-123');
    expect(retrieved?.status).toBe('pending');

    await storage.updateJobStatus('job-123', 'failed', 'Timeout error');
    const failedJob = await storage.getJob('job-123');
    expect(failedJob?.status).toBe('failed');
    expect(failedJob?.error).toBe('Timeout error');

    await storage.moveToDlq('job-123', 'Max attempts exceeded');
    const dlqJob = await storage.getJob('job-123');
    expect(dlqJob?.status).toBe('dlq');
  });

  it('should acquire and release distributed locks correctly', async () => {
    const client = new MockRedisClient();
    const lockProvider = new RedisLockProvider(client);

    const token1 = await lockProvider.acquire('resource-a', 5000);
    expect(token1).not.toBeNull();

    // Second acquire should fail because lock is already held (NX)
    const token2 = await lockProvider.acquire('resource-a', 5000);
    expect(token2).toBeNull();

    // Release with incorrect token should fail
    const releasedWrong = await lockProvider.release('resource-a', 'wrong-token');
    expect(releasedWrong).toBe(false);

    // Release with correct token should succeed
    const releasedCorrect = await lockProvider.release('resource-a', token1!);
    expect(releasedCorrect).toBe(true);

    // Now acquire should succeed again
    const token3 = await lockProvider.acquire('resource-a', 5000);
    expect(token3).not.toBeNull();
  });
});
