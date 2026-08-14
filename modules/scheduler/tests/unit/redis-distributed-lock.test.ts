import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryDistributedLock, RedisDistributedLock, type RedisDistributedLockClient } from '../../adapters/distributed-lock.js';

describe('distributed locks', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('acquires once and rejects a duplicate acquisition', async () => {
    const lock = new MemoryDistributedLock();
    const token = await lock.acquireLock('daily-sync', 1_000);
    expect(token).toEqual(expect.any(String));
    await expect(lock.acquireLock('daily-sync', 1_000)).resolves.toBeNull();
  });

  it('only releases the matching ownership token', async () => {
    const lock = new MemoryDistributedLock();
    const token = await lock.acquireLock('daily-sync', 1_000);
    await expect(lock.releaseLock('daily-sync', 'wrong-token')).resolves.toBe(false);
    await expect(lock.releaseLock('daily-sync', token!)).resolves.toBe(true);
  });

  it('prevents an expired owner from releasing a new owner lock', async () => {
    vi.useFakeTimers();
    const lock = new MemoryDistributedLock();
    const expiredToken = await lock.acquireLock('daily-sync', 100);
    vi.advanceTimersByTime(101);
    const currentToken = await lock.acquireLock('daily-sync', 100);
    await expect(lock.releaseLock('daily-sync', expiredToken!)).resolves.toBe(false);
    await expect(lock.releaseLock('daily-sync', currentToken!)).resolves.toBe(true);
    vi.useRealTimers();
  });

  it('creates unique secure ownership tokens', async () => {
    const lock = new MemoryDistributedLock();
    const first = await lock.acquireLock('first', 1_000);
    const second = await lock.acquireLock('second', 1_000);
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid TTL %s', async (ttl) => {
    await expect(new MemoryDistributedLock().acquireLock('daily-sync', ttl)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  it('uses SET NX PX and atomic compare-and-delete for Redis', async () => {
    const client: RedisDistributedLockClient = { set: vi.fn().mockResolvedValue('OK'), eval: vi.fn().mockResolvedValue(1) };
    const lock = new RedisDistributedLock(client);
    const token = await lock.acquireLock('daily-sync', 5_000);
    expect(client.set).toHaveBeenCalledWith('lock:scheduler:daily-sync', token, 'PX', 5_000, 'NX');
    await expect(lock.releaseLock('daily-sync', token!)).resolves.toBe(true);
    expect(client.eval).toHaveBeenCalledWith(expect.stringContaining('redis.call("get", KEYS[1]) == ARGV[1]'), 1, 'lock:scheduler:daily-sync', token);
  });

  it('returns lock conflict results without throwing', async () => {
    const client: RedisDistributedLockClient = { set: vi.fn().mockResolvedValue(null), eval: vi.fn().mockResolvedValue(0) };
    const lock = new RedisDistributedLock(client);
    await expect(lock.acquireLock('daily-sync', 5_000)).resolves.toBeNull();
    await expect(lock.releaseLock('daily-sync', 'wrong-token')).resolves.toBe(false);
  });

  it('propagates Redis failures as structured lock errors', async () => {
    const cause = new Error('redis unavailable');
    const client: RedisDistributedLockClient = { set: vi.fn().mockRejectedValue(cause), eval: vi.fn().mockRejectedValue(cause) };
    const lock = new RedisDistributedLock(client);
    await expect(lock.acquireLock('daily-sync', 5_000)).rejects.toMatchObject({ code: 'LOCK_OPERATION_FAILED', cause });
    await expect(lock.releaseLock('daily-sync', 'token')).rejects.toMatchObject({ code: 'LOCK_OPERATION_FAILED', cause });
  });
});
