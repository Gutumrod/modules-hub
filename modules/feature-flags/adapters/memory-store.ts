import type { FeatureFlagContext, FeatureFlagStore, StoredFlag } from '../core/index.js';

/**
 * WARNING: This is an in-memory, single-instance store for automated tests,
 * local development, and contract validation only. It is NOT a distributed
 * production flag store and does not synchronize state across processes,
 * serverless instances, or Cloudflare Workers.
 */
export interface MemoryFeatureFlagStore extends FeatureFlagStore {
  setFlag(key: string, flag: StoredFlag | boolean): void;
  removeFlag(key: string): void;
  clear(): void;
}

export function createMemoryFlagStore(
  initialFlags: Record<string, StoredFlag | boolean> = {},
): MemoryFeatureFlagStore {
  const flags = new Map<string, StoredFlag>();

  const store: MemoryFeatureFlagStore = {
    async getFlag(key: string, _context?: FeatureFlagContext): Promise<StoredFlag | null> {
      return flags.get(key) ?? null;
    },

    setFlag(key: string, flag: StoredFlag | boolean): void {
      flags.set(key, normalizeStoredFlag(key, flag));
    },

    removeFlag(key: string): void {
      flags.delete(key);
    },

    clear(): void {
      flags.clear();
    },
  };

  for (const [key, flag] of Object.entries(initialFlags)) {
    store.setFlag(key, flag);
  }

  return store;
}

function normalizeStoredFlag(key: string, flag: StoredFlag | boolean): StoredFlag {
  if (typeof flag === 'boolean') {
    return { key, enabled: flag };
  }

  return flag;
}
