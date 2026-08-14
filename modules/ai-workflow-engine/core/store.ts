export interface StateStore {
  set(key: string, value: any): Promise<void>;
  get(key: string): Promise<any | null>;
  delete(key: string): Promise<void>;
}

export class PersistentMemoryStore implements StateStore {
  private store = new Map<string, any>();

  async set(key: string, value: any): Promise<void> {
    this.store.set(key, JSON.parse(JSON.stringify(value)));
  }

  async get(key: string): Promise<any | null> {
    const value = this.store.get(key);
    return value ? JSON.parse(JSON.stringify(value)) : null;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

export class RedisStateStore implements StateStore {
  constructor(private client: any, private prefix = 'workflow:') {}

  async set(key: string, value: any): Promise<void> {
    await this.client.set(`${this.prefix}${key}`, JSON.stringify(value));
  }

  async get(key: string): Promise<any | null> {
    const raw = await this.client.get(`${this.prefix}${key}`);
    return raw ? JSON.parse(raw) : null;
  }

  async delete(key: string): Promise<void> {
    await this.client.del(`${this.prefix}${key}`);
  }
}
