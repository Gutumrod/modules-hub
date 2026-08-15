import { describe, it, expect, beforeEach } from 'vitest';
import { MemorySessionStore, StateManager } from '../../src/core/state-manager.js';

describe('LINE OA State & Session Manager', () => {
  let store: MemorySessionStore;
  let stateManager: StateManager;

  beforeEach(() => {
    store = new MemorySessionStore();
    stateManager = new StateManager(store, 1000 * 60); // 1 minute TTL
  });

  it('should initialize a new session with IDLE state if not existing', async () => {
    const session = await stateManager.getSession('user_1');
    expect(session.userId).toBe('user_1');
    expect(session.state).toBe('IDLE');
    expect(session.contextData).toEqual({});
    expect(session.history).toEqual([]);
  });

  it('should update session state and persist it', async () => {
    await stateManager.updateState('user_1', 'ORDERING');
    const session = await stateManager.getSession('user_1');
    expect(session.state).toBe('ORDERING');
  });

  it('should merge context data correctly', async () => {
    await stateManager.updateContext('user_1', { itemName: 'Pad Thai', quantity: 2 });
    await stateManager.updateContext('user_1', { notes: 'No spicy' });

    const session = await stateManager.getSession('user_1');
    expect(session.contextData).toEqual({
      itemName: 'Pad Thai',
      quantity: 2,
      notes: 'No spicy',
    });
  });

  it('should append chat history and trim to max limit', async () => {
    for (let i = 1; i <= 5; i++) {
      await stateManager.appendHistory(
        'user_1',
        { role: 'user', content: `Message ${i}`, timestamp: Date.now() },
        3 // max history = 3
      );
    }

    const session = await stateManager.getSession('user_1');
    expect(session.history.length).toBe(3);
    expect(session.history[0].content).toBe('Message 3');
    expect(session.history[2].content).toBe('Message 5');
  });

  it('should clear session upon request', async () => {
    await stateManager.updateState('user_1', 'BOOKING');
    await stateManager.clearSession('user_1');

    // Getting session again should re-initialize to IDLE
    const freshSession = await stateManager.getSession('user_1');
    expect(freshSession.state).toBe('IDLE');
  });

  it('should expire session when TTL has passed in MemorySessionStore', async () => {
    const shortTtlStore = new MemorySessionStore();
    const shortTtlManager = new StateManager(shortTtlStore, 10); // 10ms

    await shortTtlManager.updateState('user_exp', 'ACTIVE');
    const immediate = await shortTtlManager.getSession('user_exp');
    expect(immediate.state).toBe('ACTIVE');

    // Wait for TTL to pass
    await new Promise((r) => setTimeout(r, 25));

    const expired = await shortTtlManager.getSession('user_exp');
    expect(expired.state).toBe('IDLE'); // Should be fresh session
  });
});
