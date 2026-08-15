import { describe, expect, it, vi } from 'vitest';
import { PersistentMemoryStore, RedisStateStore, type RedisStateClient } from '../../core/store.js';

describe('state stores', () => {
  it.each([false, 0, ''])('preserves falsy value %#', async (value) => {
    const store = new PersistentMemoryStore<typeof value>();
    await store.set('key', value);
    await expect(store.get('key')).resolves.toBe(value);
  });

  it('stores objects with deep-copy isolation', async () => {
    const store = new PersistentMemoryStore<{ nested: { count: number } }>();
    const input = { nested: { count: 1 } };
    await store.set('key', input);
    input.nested.count = 2;
    const first = await store.get('key');
    expect(first).toEqual({ nested: { count: 1 } });
    first!.nested.count = 3;
    await expect(store.get('key')).resolves.toEqual({ nested: { count: 1 } });
  });

  it('returns null for a missing key and removes deleted state', async () => {
    const store = new PersistentMemoryStore<number>();
    await expect(store.get('missing')).resolves.toBeNull();
    await store.set('key', 1);
    await store.delete('key');
    await expect(store.get('key')).resolves.toBeNull();
  });

  it('reads and writes Redis state through the typed client contract', async () => {
    const client: RedisStateClient = { set: vi.fn().mockResolvedValue('OK'), get: vi.fn().mockResolvedValue('{"ok":true}'), del: vi.fn().mockResolvedValue(1) };
    const store = new RedisStateStore<{ ok: boolean }>(client);
    await store.set('key', { ok: true });
    await expect(store.get('key')).resolves.toEqual({ ok: true });
    await store.delete('key');
    expect(client.set).toHaveBeenCalledWith('workflow:key', '{"ok":true}');
    expect(client.del).toHaveBeenCalledWith('workflow:key');
  });

  it('rejects malformed Redis JSON', async () => {
    const client: RedisStateClient = { set: vi.fn(), get: vi.fn().mockResolvedValue('{bad'), del: vi.fn() };
    await expect(new RedisStateStore(client).get('key')).rejects.toMatchObject({ code: 'MALFORMED_STATE' });
  });

  it('wraps Redis operation failures', async () => {
    const cause = new Error('redis unavailable');
    const client: RedisStateClient = { set: vi.fn().mockRejectedValue(cause), get: vi.fn().mockRejectedValue(cause), del: vi.fn().mockRejectedValue(cause) };
    const store = new RedisStateStore(client);
    await expect(store.set('key', {})).rejects.toMatchObject({ code: 'STORE_OPERATION_FAILED', cause });
    await expect(store.get('key')).rejects.toMatchObject({ code: 'STORE_OPERATION_FAILED', cause });
    await expect(store.delete('key')).rejects.toMatchObject({ code: 'STORE_OPERATION_FAILED', cause });
  });

  it('rejects serialization failures before writing', async () => {
    const client: RedisStateClient = { set: vi.fn(), get: vi.fn(), del: vi.fn() };
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    await expect(new RedisStateStore(client).set('key', circular)).rejects.toMatchObject({ code: 'SERIALIZATION_FAILED' });
    expect(client.set).not.toHaveBeenCalled();
  });
});
