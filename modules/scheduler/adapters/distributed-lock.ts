export interface DistributedLockAdapter {
  acquireLock(key: string, ttlMs: number): Promise<boolean>;
  releaseLock(key: string): Promise<void>;
}

export class MemoryDistributedLock implements DistributedLockAdapter {
  private locks = new Map<string, { expiresAt: number }>();

  async acquireLock(key: string, ttlMs: number): Promise<boolean> {
    const now = Date.now();
    const existing = this.locks.get(key);

    if (existing && existing.expiresAt > now) {
      return false; // Locked by another instance
    }

    this.locks.set(key, { expiresAt: now + ttlMs });
    return true;
  }

  async releaseLock(key: string): Promise<void> {
    this.locks.delete(key);
  }
}

export class RedisDistributedLock implements DistributedLockAdapter {
  constructor(private client: any, private prefix = 'lock:scheduler:') {}

  async acquireLock(key: string, ttlMs: number): Promise<boolean> {
    const lockKey = `${this.prefix}${key}`;
    const result = await this.client.set(lockKey, 'LOCKED', 'PX', ttlMs, 'NX');
    return result === 'OK' || result === true;
  }

  async releaseLock(key: string): Promise<void> {
    await this.client.del(`${this.prefix}${key}`);
  }
}
