import { UserSession, ConversationState, SessionStore, ChatMessageHistory } from './types.js';

export class MemorySessionStore implements SessionStore {
  private sessions: Map<string, { session: UserSession; expiresAt?: number }> = new Map();

  async get(userId: string): Promise<UserSession | null> {
    const entry = this.sessions.get(userId);
    if (!entry) return null;

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.sessions.delete(userId);
      return null;
    }
    return entry.session;
  }

  async set(userId: string, session: UserSession, ttlMs?: number): Promise<void> {
    const expiresAt = ttlMs ? Date.now() + ttlMs : undefined;
    this.sessions.set(userId, { session, expiresAt });
  }

  async delete(userId: string): Promise<void> {
    this.sessions.delete(userId);
  }

  async clear(): Promise<void> {
    this.sessions.clear();
  }
}

export class StateManager {
  private store: SessionStore;
  private defaultTtlMs: number;

  constructor(store?: SessionStore, defaultTtlMs = 1000 * 60 * 30) {
    this.store = store || new MemorySessionStore();
    this.defaultTtlMs = defaultTtlMs;
  }

  public async getSession(userId: string): Promise<UserSession> {
    let session = await this.store.get(userId);
    if (!session) {
      session = {
        userId,
        state: 'IDLE',
        contextData: {},
        history: [],
        lastInteraction: Date.now(),
      };
      await this.store.set(userId, session, this.defaultTtlMs);
    }
    return session;
  }

  public async updateState(userId: string, state: ConversationState): Promise<UserSession> {
    const session = await this.getSession(userId);
    session.state = state;
    session.lastInteraction = Date.now();
    await this.store.set(userId, session, this.defaultTtlMs);
    return session;
  }

  public async updateContext(userId: string, data: Record<string, any>): Promise<UserSession> {
    const session = await this.getSession(userId);
    session.contextData = { ...session.contextData, ...data };
    session.lastInteraction = Date.now();
    await this.store.set(userId, session, this.defaultTtlMs);
    return session;
  }

  public async appendHistory(
    userId: string,
    message: ChatMessageHistory,
    maxHistory = 20
  ): Promise<UserSession> {
    const session = await this.getSession(userId);
    session.history.push(message);
    if (session.history.length > maxHistory) {
      session.history = session.history.slice(-maxHistory);
    }
    session.lastInteraction = Date.now();
    await this.store.set(userId, session, this.defaultTtlMs);
    return session;
  }

  public async clearSession(userId: string): Promise<void> {
    await this.store.delete(userId);
  }
}
