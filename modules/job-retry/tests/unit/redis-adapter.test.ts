import { describe, expect, it, vi } from 'vitest';
import {
  RedisAdapterError,
  RedisJobStorage,
  RedisLockProvider,
  type RedisClientLike,
} from '../../index.js';
import type { PersistentJob } from '../../core/types.js';

type StringEntry = { value: string; expiresAt?: number };

class MockRedisClient implements RedisClientLike {
  readonly hashes = new Map<string, Map<string, string>>();
  readonly strings = new Map<string, StringEntry>();
  now = 1_000;
  lastEval?: { script: string; numberOfKeys: number; args: Array<string | number> };

  private active(key: string): StringEntry | undefined {
    const entry = this.strings.get(key);
    if (entry?.expiresAt !== undefined && entry.expiresAt <= this.now) {
      this.strings.delete(key);
      return undefined;
    }
    return entry;
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    const hash = this.hashes.get(key) ?? new Map<string, string>();
    hash.set(field, value);
    this.hashes.set(key, hash);
    return 1;
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.hashes.get(key)?.get(field) ?? null;
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    const hash = this.hashes.get(key);
    return fields.reduce((count, field) => count + Number(hash?.delete(field) ?? false), 0);
  }

  async set(key: string, value: string, mode?: string, duration?: number, flag?: string): Promise<string | null> {
    if (mode !== 'PX' || flag !== 'NX' || duration === undefined) throw new Error('invalid SET contract');
    if (this.active(key)) return null;
    this.strings.set(key, { value, expiresAt: this.now + duration });
    return 'OK';
  }

  async eval(script: string, numberOfKeys: number, ...args: Array<string | number>): Promise<number> {
    this.lastEval = { script, numberOfKeys, args };
    const [key, token] = args as [string, string];
    if (this.active(key)?.value !== token) return 0;
    this.strings.delete(key);
    return 1;
  }
}

const createJob = (id = 'job-123'): PersistentJob => ({
  id,
  name: 'send-email',
  payload: { to: 'test@example.com' },
  status: 'pending',
  attempts: 0,
  maxAttempts: 3,
  createdAt: 1_000,
  updatedAt: 1_000,
});

describe('RedisJobStorage', () => {
  it('saves, retrieves, and updates a job', async () => {
    const storage = new RedisJobStorage(new MockRedisClient());
    await storage.saveJob(createJob());
    expect(await storage.getJob('job-123')).toEqual(createJob());
    await storage.updateJobStatus('job-123', 'failed', 'timeout');
    expect(await storage.getJob('job-123')).toMatchObject({ status: 'failed', error: 'timeout' });
  });

  it('returns null for a missing job and rejects missing-job mutations', async () => {
    const storage = new RedisJobStorage(new MockRedisClient());
    await expect(storage.getJob('missing')).resolves.toBeNull();
    await expect(storage.updateJobStatus('missing', 'failed')).rejects.toMatchObject({ code: 'JOB_NOT_FOUND' });
    await expect(storage.moveToDlq('missing', 'failed')).rejects.toMatchObject({ code: 'JOB_NOT_FOUND' });
  });

  it('rejects malformed stored JSON and invalid job shapes', async () => {
    const client = new MockRedisClient();
    await client.hset('jobhub:job:bad-json', 'data', '{');
    await client.hset('jobhub:job:bad-shape', 'data', JSON.stringify({ id: 'bad-shape' }));
    const storage = new RedisJobStorage(client);
    await expect(storage.getJob('bad-json')).rejects.toMatchObject({ code: 'MALFORMED_JOB' });
    await expect(storage.getJob('bad-shape')).rejects.toMatchObject({ code: 'MALFORMED_JOB' });
  });

  it('moves an existing job to the DLQ', async () => {
    const client = new MockRedisClient();
    const storage = new RedisJobStorage(client);
    await storage.saveJob(createJob());
    await storage.moveToDlq('job-123', 'max attempts');
    expect(await storage.getJob('job-123')).toMatchObject({ status: 'dlq', error: 'max attempts' });
    expect(JSON.parse(client.hashes.get('jobhub:dlq')?.get('job-123') ?? '{}')).toMatchObject({
      id: 'job-123',
      reason: 'max attempts',
    });
  });

  it('propagates Redis failures as structured errors without swallowing the cause', async () => {
    const cause = new Error('connection refused');
    const client = new MockRedisClient();
    client.hget = vi.fn().mockRejectedValue(cause);
    const storage = new RedisJobStorage(client);
    await expect(storage.getJob('job-123')).rejects.toEqual(
      expect.objectContaining<Partial<RedisAdapterError>>({ code: 'REDIS_OPERATION_FAILED', cause }),
    );
  });
});

describe('RedisLockProvider', () => {
  it('acquires once, rejects a duplicate, and releases only with the owner token', async () => {
    const client = new MockRedisClient();
    const locks = new RedisLockProvider(client);
    const token = await locks.acquire('resource-a', 5_000);
    expect(token).toBeTruthy();
    await expect(locks.acquire('resource-a', 5_000)).resolves.toBeNull();
    await expect(locks.release('resource-a', 'wrong-token')).resolves.toBe(false);
    await expect(locks.release('resource-a', token!)).resolves.toBe(true);
  });

  it('uses atomic compare-and-delete through the Redis eval contract', async () => {
    const client = new MockRedisClient();
    const locks = new RedisLockProvider(client);
    const token = await locks.acquire('resource-a', 5_000);
    await locks.release('resource-a', token!);
    expect(client.lastEval?.numberOfKeys).toBe(1);
    expect(client.lastEval?.args).toEqual(['lock:resource-a', token]);
    expect(client.lastEval?.script).toContain('redis.call("get", KEYS[1])');
    expect(client.lastEval?.script).toContain('redis.call("del", KEYS[1])');
  });

  it('prevents an expired owner from deleting the new owner lock', async () => {
    const client = new MockRedisClient();
    const locks = new RedisLockProvider(client);
    const oldToken = await locks.acquire('resource-a', 100);
    client.now += 101;
    const newToken = await locks.acquire('resource-a', 100);
    expect(newToken).toBeTruthy();
    expect(newToken).not.toBe(oldToken);
    await expect(locks.release('resource-a', oldToken!)).resolves.toBe(false);
    await expect(locks.release('resource-a', newToken!)).resolves.toBe(true);
  });

  it('creates unique cryptographically sourced ownership tokens', async () => {
    const client = new MockRedisClient();
    const locks = new RedisLockProvider(client);
    const first = await locks.acquire('first', 100);
    const second = await locks.acquire('second', 100);
    expect(first).toMatch(/^[0-9a-f-]{36}$/i);
    expect(second).not.toBe(first);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid TTL %s', async (ttl) => {
    await expect(new RedisLockProvider(new MockRedisClient()).acquire('resource-a', ttl)).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
  });

  it.each(['', '   '])('rejects an empty lock name/token', async (empty) => {
    const locks = new RedisLockProvider(new MockRedisClient());
    await expect(locks.acquire(empty, 100)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await expect(locks.release('resource-a', empty)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  it('propagates Redis acquire and release failures', async () => {
    const acquireClient = new MockRedisClient();
    acquireClient.set = vi.fn().mockRejectedValue(new Error('down'));
    await expect(new RedisLockProvider(acquireClient).acquire('resource-a', 100)).rejects.toMatchObject({
      code: 'REDIS_OPERATION_FAILED',
    });

    const releaseClient = new MockRedisClient();
    releaseClient.eval = vi.fn().mockRejectedValue(new Error('down'));
    await expect(new RedisLockProvider(releaseClient).release('resource-a', 'token')).rejects.toMatchObject({
      code: 'REDIS_OPERATION_FAILED',
    });
  });
});
