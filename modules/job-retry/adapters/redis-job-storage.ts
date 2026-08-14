import { JobStorageAdapter, PersistentJob, JobStatus } from '../core/types.js';

export interface RedisClientLike {
  hset(key: string, field: string, value: string): Promise<unknown>;
  hget(key: string, field: string): Promise<string | null>;
  hdel(key: string, ...fields: string[]): Promise<unknown>;
  set(key: string, value: string, mode?: string, duration?: number, flag?: string): Promise<unknown>;
  eval(script: string, numberOfKeys: number, ...args: Array<string | number>): Promise<unknown>;
}

export type RedisAdapterErrorCode =
  | 'INVALID_ARGUMENT'
  | 'JOB_NOT_FOUND'
  | 'MALFORMED_JOB'
  | 'UNEXPECTED_REDIS_RESPONSE'
  | 'REDIS_OPERATION_FAILED';

export class RedisAdapterError extends Error {
  readonly name = 'RedisAdapterError';

  constructor(
    readonly code: RedisAdapterErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

const COMPARE_AND_DELETE_SCRIPT = `if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

function requireNonEmpty(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RedisAdapterError('INVALID_ARGUMENT', `${label} must be a non-empty string`);
  }
}

function isPersistentJob(value: unknown): value is PersistentJob {
  if (!value || typeof value !== 'object') return false;
  const job = value as Record<string, unknown>;
  return (
    typeof job.id === 'string' && job.id.length > 0 &&
    typeof job.name === 'string' && job.name.length > 0 &&
    ['pending', 'running', 'completed', 'failed', 'dlq'].includes(String(job.status)) &&
    Number.isInteger(job.attempts) &&
    Number.isInteger(job.maxAttempts) &&
    typeof job.createdAt === 'number' && Number.isFinite(job.createdAt) &&
    typeof job.updatedAt === 'number' && Number.isFinite(job.updatedAt)
  );
}

function secureLockToken(): string {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === 'function') return webCrypto.randomUUID();
  if (typeof webCrypto?.getRandomValues !== 'function') {
    throw new RedisAdapterError('INVALID_ARGUMENT', 'Web Crypto secure random source is unavailable');
  }

  const bytes = webCrypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Production-ready Redis Job Storage Adapter adhering to JobStorageAdapter interface.
 */
export class RedisJobStorage implements JobStorageAdapter {
  private prefix: string;

  constructor(private client: RedisClientLike, prefix = 'jobhub:') {
    requireNonEmpty(prefix, 'prefix');
    this.prefix = prefix;
  }

  private jobKey(id: string): string {
    return `${this.prefix}job:${id}`;
  }

  private dlqKey(): string {
    return `${this.prefix}dlq`;
  }

  async saveJob(job: PersistentJob): Promise<void> {
    if (!isPersistentJob(job)) {
      throw new RedisAdapterError('INVALID_ARGUMENT', 'job must be a valid PersistentJob');
    }
    const key = this.jobKey(job.id);
    try {
      await this.client.hset(key, 'data', JSON.stringify(job));
    } catch (cause) {
      throw new RedisAdapterError('REDIS_OPERATION_FAILED', 'Failed to save job', { cause });
    }
  }

  async getJob(id: string): Promise<PersistentJob | null> {
    requireNonEmpty(id, 'job id');
    const key = this.jobKey(id);
    let raw: string | null;
    try {
      raw = await this.client.hget(key, 'data');
    } catch (cause) {
      throw new RedisAdapterError('REDIS_OPERATION_FAILED', 'Failed to read job', { cause });
    }
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isPersistentJob(parsed) || parsed.id !== id) throw new Error('invalid job shape');
      return parsed;
    } catch (cause) {
      throw new RedisAdapterError('MALFORMED_JOB', `Stored job payload is malformed for job ${id}`, { cause });
    }
  }

  async updateJobStatus(id: string, status: JobStatus, error?: string): Promise<void> {
    const job = await this.getJob(id);
    if (!job) throw new RedisAdapterError('JOB_NOT_FOUND', `Job ${id} was not found`);
    const updated: PersistentJob = {
      ...job,
      status,
      error: error ?? job.error,
      updatedAt: Date.now(),
    };
    await this.saveJob(updated);
  }

  async moveToDlq(id: string, reason: string): Promise<void> {
    requireNonEmpty(reason, 'DLQ reason');
    await this.updateJobStatus(id, 'dlq', reason);
    try {
      await this.client.hset(this.dlqKey(), id, JSON.stringify({ id, reason, timestamp: Date.now() }));
    } catch (cause) {
      throw new RedisAdapterError('REDIS_OPERATION_FAILED', 'Failed to save DLQ entry', { cause });
    }
  }
}

/**
 * Production-ready Distributed Lock Provider using Redis SET NX PX.
 */
export class RedisLockProvider {
  constructor(private client: RedisClientLike, private lockPrefix = 'lock:') {
    requireNonEmpty(lockPrefix, 'lock prefix');
  }

  async acquire(lockName: string, ttlMs: number): Promise<string | null> {
    requireNonEmpty(lockName, 'lock name');
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
      throw new RedisAdapterError('INVALID_ARGUMENT', 'lock TTL must be a positive safe integer');
    }
    const lockKey = `${this.lockPrefix}${lockName}`;
    const token = secureLockToken();
    let result: unknown;
    try {
      result = await this.client.set(lockKey, token, 'PX', ttlMs, 'NX');
    } catch (cause) {
      throw new RedisAdapterError('REDIS_OPERATION_FAILED', 'Failed to acquire lock', { cause });
    }
    if (result === 'OK' || result === true) return token;
    if (result === null || result === false) return null;
    throw new RedisAdapterError('UNEXPECTED_REDIS_RESPONSE', 'Redis returned an unexpected lock acquisition response');
  }

  async release(lockName: string, token: string): Promise<boolean> {
    requireNonEmpty(lockName, 'lock name');
    requireNonEmpty(token, 'lock token');
    const lockKey = `${this.lockPrefix}${lockName}`;
    let result: unknown;
    try {
      result = await this.client.eval(COMPARE_AND_DELETE_SCRIPT, 1, lockKey, token);
    } catch (cause) {
      throw new RedisAdapterError('REDIS_OPERATION_FAILED', 'Failed to release lock', { cause });
    }
    if (result === 1 || result === '1') return true;
    if (result === 0 || result === '0') return false;
    throw new RedisAdapterError('UNEXPECTED_REDIS_RESPONSE', 'Redis returned an unexpected lock release response');
  }
}
