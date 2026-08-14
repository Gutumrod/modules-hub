export interface DistributedLockAdapter {
  acquireLock(key: string, ttlMs: number): Promise<string | null>;
  releaseLock(key: string, token: string): Promise<boolean>;
}

export interface RedisDistributedLockClient {
  set(key: string, value: string, mode: 'PX', duration: number, flag: 'NX'): Promise<unknown>;
  eval(script: string, numberOfKeys: number, ...args: Array<string | number>): Promise<unknown>;
}

export type DistributedLockErrorCode =
  | 'INVALID_ARGUMENT'
  | 'SECURE_RANDOM_UNAVAILABLE'
  | 'LOCK_OPERATION_FAILED'
  | 'UNEXPECTED_REDIS_RESPONSE';

export class DistributedLockError extends Error {
  override readonly name = 'DistributedLockError';

  constructor(readonly code: DistributedLockErrorCode, message: string, options?: { cause?: unknown }) {
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
    throw new DistributedLockError('INVALID_ARGUMENT', `${label} must be a non-empty string`);
  }
}

function requireValidTtl(ttlMs: number): void {
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new DistributedLockError('INVALID_ARGUMENT', 'lock TTL must be a positive safe integer');
  }
}

function secureToken(): string {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new DistributedLockError('SECURE_RANDOM_UNAVAILABLE', 'Web Crypto randomUUID is required');
  }
  return globalThis.crypto.randomUUID();
}

export class MemoryDistributedLock implements DistributedLockAdapter {
  private readonly locks = new Map<string, { token: string; expiresAt: number }>();

  async acquireLock(key: string, ttlMs: number): Promise<string | null> {
    requireNonEmpty(key, 'lock key');
    requireValidTtl(ttlMs);
    const now = Date.now();
    const existing = this.locks.get(key);
    if (existing && existing.expiresAt > now) return null;
    const token = secureToken();
    this.locks.set(key, { token, expiresAt: now + ttlMs });
    return token;
  }

  async releaseLock(key: string, token: string): Promise<boolean> {
    requireNonEmpty(key, 'lock key');
    requireNonEmpty(token, 'lock token');
    const existing = this.locks.get(key);
    if (!existing || existing.token !== token) return false;
    this.locks.delete(key);
    return true;
  }
}

export class RedisDistributedLock implements DistributedLockAdapter {
  constructor(private readonly client: RedisDistributedLockClient, private readonly prefix = 'lock:scheduler:') {
    requireNonEmpty(prefix, 'lock prefix');
  }

  async acquireLock(key: string, ttlMs: number): Promise<string | null> {
    requireNonEmpty(key, 'lock key');
    requireValidTtl(ttlMs);
    const token = secureToken();
    let result: unknown;
    try {
      result = await this.client.set(`${this.prefix}${key}`, token, 'PX', ttlMs, 'NX');
    } catch (cause) {
      throw new DistributedLockError('LOCK_OPERATION_FAILED', 'Failed to acquire Redis lock', { cause });
    }
    if (result === 'OK' || result === true) return token;
    if (result === null || result === false) return null;
    throw new DistributedLockError('UNEXPECTED_REDIS_RESPONSE', 'Unexpected Redis acquire response');
  }

  async releaseLock(key: string, token: string): Promise<boolean> {
    requireNonEmpty(key, 'lock key');
    requireNonEmpty(token, 'lock token');
    let result: unknown;
    try {
      result = await this.client.eval(COMPARE_AND_DELETE_SCRIPT, 1, `${this.prefix}${key}`, token);
    } catch (cause) {
      throw new DistributedLockError('LOCK_OPERATION_FAILED', 'Failed to release Redis lock', { cause });
    }
    if (result === 1 || result === '1') return true;
    if (result === 0 || result === '0') return false;
    throw new DistributedLockError('UNEXPECTED_REDIS_RESPONSE', 'Unexpected Redis release response');
  }
}
