import { describe, it, expect } from 'vitest';
import { createMemoryFlagStore } from '../../index.js';
import type { StoredFlag } from '../../index.js';

// ---------------------------------------------------------------------------
// createMemoryFlagStore — in-memory store adapter
// ---------------------------------------------------------------------------

describe('createMemoryFlagStore', () => {
  describe('initial flags', () => {
    it('loads initial boolean flags', async () => {
      const store = createMemoryFlagStore({
        'flag-a': true,
        'flag-b': false,
      });
      const a = await store.getFlag('flag-a');
      const b = await store.getFlag('flag-b');
      expect(a).toEqual({ key: 'flag-a', enabled: true });
      expect(b).toEqual({ key: 'flag-b', enabled: false });
    });

    it('loads initial StoredFlag objects', async () => {
      const flag: StoredFlag = {
        key: 'complex',
        enabled: true,
        rules: [{ tenantId: 't1', enabled: false }],
        metadata: { version: 2 },
      };
      const store = createMemoryFlagStore({ complex: flag });
      const result = await store.getFlag('complex');
      expect(result).toEqual(flag);
    });

    it('mix of boolean and StoredFlag initial flags', async () => {
      const flag: StoredFlag = { key: 'obj', enabled: false };
      const store = createMemoryFlagStore({
        bool: true,
        obj: flag,
      });
      const boolResult = await store.getFlag('bool');
      const objResult = await store.getFlag('obj');
      expect(boolResult).toEqual({ key: 'bool', enabled: true });
      expect(objResult).toEqual(flag);
    });

    it('empty initial flags object yields a working empty store', async () => {
      const store = createMemoryFlagStore({});
      const result = await store.getFlag('anything');
      expect(result).toBeNull();
    });

    it('no initial flags argument yields a working empty store', async () => {
      const store = createMemoryFlagStore();
      const result = await store.getFlag('anything');
      expect(result).toBeNull();
    });
  });

  describe('getFlag', () => {
    it('returns null for a missing key', async () => {
      const store = createMemoryFlagStore({ exists: true });
      const result = await store.getFlag('missing');
      expect(result).toBeNull();
    });

    it('returns the stored flag for an existing key', async () => {
      const store = createMemoryFlagStore({ present: true });
      const result = await store.getFlag('present');
      expect(result).not.toBeNull();
      expect(result?.key).toBe('present');
      expect(result?.enabled).toBe(true);
    });

    it('accepts an optional context argument without error', async () => {
      const store = createMemoryFlagStore({ ctx: true });
      const result = await store.getFlag('ctx', { tenantId: 't1', userId: 'u1' });
      expect(result?.enabled).toBe(true);
    });
  });

  describe('setFlag', () => {
    it('updates a flag from false to true at runtime', async () => {
      const store = createMemoryFlagStore({ mutable: false });

      const before = await store.getFlag('mutable');
      expect(before?.enabled).toBe(false);

      store.setFlag('mutable', true);

      const after = await store.getFlag('mutable');
      expect(after?.enabled).toBe(true);
    });

    it('updates a flag from true to false at runtime', async () => {
      const store = createMemoryFlagStore({ mutable: true });

      const before = await store.getFlag('mutable');
      expect(before?.enabled).toBe(true);

      store.setFlag('mutable', false);

      const after = await store.getFlag('mutable');
      expect(after?.enabled).toBe(false);
    });

    it('auto-wraps a boolean into a StoredFlag with key and enabled', async () => {
      const store = createMemoryFlagStore();
      store.setFlag('wrapped', true);

      const result = await store.getFlag('wrapped');
      expect(result).toEqual({ key: 'wrapped', enabled: true });
    });

    it('stores a full StoredFlag object as-is', async () => {
      const store = createMemoryFlagStore();
      const flag: StoredFlag = {
        key: 'full',
        enabled: false,
        rules: [{ tenantId: 't1', enabled: true }],
        metadata: { owner: 'team-a' },
      };
      store.setFlag('full', flag);

      const result = await store.getFlag('full');
      expect(result).toEqual(flag);
    });

    it('can add a new flag key that did not exist before', async () => {
      const store = createMemoryFlagStore();
      store.setFlag('new-key', true);

      const result = await store.getFlag('new-key');
      expect(result?.enabled).toBe(true);
    });

    it('overwrites an existing StoredFlag with a boolean', async () => {
      const store = createMemoryFlagStore({
        replace: { key: 'replace', enabled: true, rules: [{ tenantId: 't1', enabled: false }] },
      });

      store.setFlag('replace', false);

      const result = await store.getFlag('replace');
      expect(result).toEqual({ key: 'replace', enabled: false });
    });
  });

  describe('removeFlag', () => {
    it('removes an existing flag', async () => {
      const store = createMemoryFlagStore({ doomed: true });

      expect(await store.getFlag('doomed')).not.toBeNull();

      store.removeFlag('doomed');

      expect(await store.getFlag('doomed')).toBeNull();
    });

    it('removing a non-existent flag is a no-op (no throw)', async () => {
      const store = createMemoryFlagStore();
      expect(() => store.removeFlag('never-existed')).not.toThrow();
      expect(await store.getFlag('never-existed')).toBeNull();
    });

    it('removed flag can be re-added with setFlag', async () => {
      const store = createMemoryFlagStore({ recycle: true });

      store.removeFlag('recycle');
      expect(await store.getFlag('recycle')).toBeNull();

      store.setFlag('recycle', false);
      const result = await store.getFlag('recycle');
      expect(result?.enabled).toBe(false);
    });
  });

  describe('clear', () => {
    it('clears all flags from the store', async () => {
      const store = createMemoryFlagStore({
        a: true,
        b: false,
        c: { key: 'c', enabled: true },
      });

      store.clear();

      expect(await store.getFlag('a')).toBeNull();
      expect(await store.getFlag('b')).toBeNull();
      expect(await store.getFlag('c')).toBeNull();
    });

    it('clear on an already-empty store is a no-op', async () => {
      const store = createMemoryFlagStore();
      expect(() => store.clear()).not.toThrow();
      expect(await store.getFlag('x')).toBeNull();
    });

    it('store is reusable after clear (setFlag works again)', async () => {
      const store = createMemoryFlagStore({ initial: true });

      store.clear();
      store.setFlag('after-clear', true);

      const result = await store.getFlag('after-clear');
      expect(result?.enabled).toBe(true);
      expect(await store.getFlag('initial')).toBeNull();
    });
  });

  describe('runtime visibility (no caching)', () => {
    it('multiple sequential updates are all visible', async () => {
      const store = createMemoryFlagStore({ toggle: false });

      expect((await store.getFlag('toggle'))?.enabled).toBe(false);

      store.setFlag('toggle', true);
      expect((await store.getFlag('toggle'))?.enabled).toBe(true);

      store.setFlag('toggle', false);
      expect((await store.getFlag('toggle'))?.enabled).toBe(false);

      store.setFlag('toggle', true);
      expect((await store.getFlag('toggle'))?.enabled).toBe(true);
    });
  });
});