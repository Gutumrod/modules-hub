import { JobStorageAdapter, PersistentJob, JobStatus } from '../core/types.js';

export interface RedisClientLike {
  hset(key: string, field: string, value: string): Promise<any>;
  hget(key: string, field: string): Promise<string | null>;
  hdel(key: string, ...fields: string[]): Promise<any>;
  set(key: string, value: string, mode?: string, duration?: number, flag?: string): Promise<any>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<any>;
}

/**
 * Production-ready Redis Job Storage Adapter adhering to JobStorageAdapter interface.
 */
export class RedisJobStorage implements JobStorageAdapter {
  private prefix: string;

  constructor(private client: RedisClientLike, prefix = 'jobhub:') {
    this.prefix = prefix;
  }

  private jobKey(id: string): string {
    return `${this.prefix}job:${id}`;
  }

  private dlqKey(): string {
    return `${this.prefix}dlq`;
  }

  async saveJob(job: PersistentJob): Promise<void> {
    const key = this.jobKey(job.id);
    await this.client.hset(key, 'data', JSON.stringify(job));
  }

  async getJob(id: string): Promise<PersistentJob | null> {
    const key = this.jobKey(id);
    const raw = await this.client.hget(key, 'data');
    if (!raw) return null;
    return JSON.parse(raw) as PersistentJob;
  }

  async updateJobStatus(id: string, status: JobStatus, error?: string): Promise<void> {
    const job = await this.getJob(id);
    if (!job) return;
    const updated: PersistentJob = {
      ...job,
      status,
      error: error ?? job.error,
      updatedAt: Date.now(),
    };
    await this.saveJob(updated);
  }

  async moveToDlq(id: string, reason: string): Promise<void> {
    await this.updateJobStatus(id, 'dlq', reason);
    await this.client.hset(this.dlqKey(), id, JSON.stringify({ id, reason, timestamp: Date.now() }));
  }
}

/**
 * Production-ready Distributed Lock Provider using Redis SET NX PX.
 */
export class RedisLockProvider {
  constructor(private client: RedisClientLike, private lockPrefix = 'lock:') {}

  async acquire(lockName: string, ttlMs: number): Promise<string | null> {
    const lockKey = `${this.lockPrefix}${lockName}`;
    const token = Math.random().toString(36.substring(2)) + Date.now().toString(36);
    // NX: Only set if not exist, PX: millisecond expiration
    const result = await this.client.set(lockKey, token, 'PX', ttlMs, 'NX');
    return result === 'OK' || result === true ? token : null;
  }

  async release(lockName: string, token: string): Promise<boolean> {
    const lockKey = `${this.lockPrefix}${lockName}`;
    const current = await this.client.get(lockKey);
    if (current === token) {
      await this.client.del(lockKey);
      return true;
    }
    return false;
  }
}
