export interface StateStore<T = unknown> {
  set(key: string, value: T): Promise<void>;
  get(key: string): Promise<T | null>;
  delete(key: string): Promise<void>;
}

export interface RedisStateClient {
  set(key: string, value: string): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
}

export type StateStoreErrorCode =
  | 'INVALID_KEY'
  | 'SERIALIZATION_FAILED'
  | 'MALFORMED_STATE'
  | 'STORE_OPERATION_FAILED';

export class StateStoreError extends Error {
  override readonly name = 'StateStoreError';
  constructor(readonly code: StateStoreErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

function requireKey(key: string): void {
  if (typeof key !== 'string' || key.trim().length === 0) {
    throw new StateStoreError('INVALID_KEY', 'state key must be a non-empty string');
  }
}

function serialize<T>(value: T): string {
  try {
    const result = JSON.stringify(value);
    if (result === undefined) throw new TypeError('value is not JSON serializable');
    return result;
  } catch (cause) {
    throw new StateStoreError('SERIALIZATION_FAILED', 'State value could not be serialized', { cause });
  }
}

function deserialize<T>(raw: string, code: 'MALFORMED_STATE' | 'SERIALIZATION_FAILED'): T {
  try {
    return JSON.parse(raw) as T;
  } catch (cause) {
    throw new StateStoreError(code, 'Stored state is malformed JSON', { cause });
  }
}

function clone<T>(value: T): T {
  return deserialize<T>(serialize(value), 'SERIALIZATION_FAILED');
}

export class PersistentMemoryStore<T = unknown> implements StateStore<T> {
  private readonly store = new Map<string, T>();

  async set(key: string, value: T): Promise<void> {
    requireKey(key);
    this.store.set(key, clone(value));
  }

  async get(key: string): Promise<T | null> {
    requireKey(key);
    if (!this.store.has(key)) return null;
    return clone(this.store.get(key) as T);
  }

  async delete(key: string): Promise<void> {
    requireKey(key);
    this.store.delete(key);
  }
}

export class RedisStateStore<T = unknown> implements StateStore<T> {
  constructor(private readonly client: RedisStateClient, private readonly prefix = 'workflow:') {
    if (prefix.trim().length === 0) throw new StateStoreError('INVALID_KEY', 'state key prefix must be non-empty');
  }

  async set(key: string, value: T): Promise<void> {
    requireKey(key);
    const encoded = serialize(value);
    try {
      await this.client.set(`${this.prefix}${key}`, encoded);
    } catch (cause) {
      throw new StateStoreError('STORE_OPERATION_FAILED', 'Failed to write Redis state', { cause });
    }
  }

  async get(key: string): Promise<T | null> {
    requireKey(key);
    let raw: string | null;
    try {
      raw = await this.client.get(`${this.prefix}${key}`);
    } catch (cause) {
      throw new StateStoreError('STORE_OPERATION_FAILED', 'Failed to read Redis state', { cause });
    }
    return raw === null ? null : deserialize<T>(raw, 'MALFORMED_STATE');
  }

  async delete(key: string): Promise<void> {
    requireKey(key);
    try {
      await this.client.del(`${this.prefix}${key}`);
    } catch (cause) {
      throw new StateStoreError('STORE_OPERATION_FAILED', 'Failed to delete Redis state', { cause });
    }
  }
}
