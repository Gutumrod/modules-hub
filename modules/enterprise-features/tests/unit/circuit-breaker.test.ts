import { afterEach, describe, expect, it, vi } from 'vitest';
import { CircuitBreaker, CircuitBreakerError } from '../../core/circuit-breaker.js';

describe('CircuitBreaker', () => {
  afterEach(() => vi.useRealTimers());

  it('executes successfully while closed', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 1_000 });
    await expect(breaker.execute(async () => 'ok')).resolves.toBe('ok');
    expect(breaker.getStatus()).toMatchObject({ state: 'CLOSED', failures: 0 });
  });

  it('opens after consecutive failures and fails fast while open', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 1_000 });
    await expect(breaker.execute(async () => { throw new Error('first'); })).rejects.toThrow('first');
    await expect(breaker.execute(async () => { throw new Error('second'); })).rejects.toThrow('second');
    const blocked = vi.fn();
    await expect(breaker.execute(blocked)).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' });
    expect(blocked).not.toHaveBeenCalled();
  });

  it('resets the consecutive failure count after a closed-state success', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1_000 });
    for (let index = 0; index < 3; index += 1) {
      await expect(breaker.execute(async () => { throw new Error('failure'); })).rejects.toThrow('failure');
      await expect(breaker.execute(async () => 'success')).resolves.toBe('success');
    }
    expect(breaker.getStatus()).toMatchObject({ state: 'CLOSED', failures: 0 });
  });

  it('allows one half-open probe and closes after it succeeds', async () => {
    vi.useFakeTimers();
    const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 1_000 });
    await expect(breaker.execute(async () => { throw new Error('failure'); })).rejects.toThrow('failure');
    vi.advanceTimersByTime(1_001);
    expect(breaker.getStatus().state).toBe('HALF_OPEN');
    await expect(breaker.execute(async () => 'recovered')).resolves.toBe('recovered');
    expect(breaker.getStatus().state).toBe('CLOSED');
  });

  it('reopens when the half-open probe fails', async () => {
    vi.useFakeTimers();
    const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 1_000 });
    await expect(breaker.execute(async () => { throw new Error('failure'); })).rejects.toThrow();
    vi.advanceTimersByTime(1_001);
    await expect(breaker.execute(async () => { throw new Error('probe failed'); })).rejects.toThrow('probe failed');
    expect(breaker.getStatus().state).toBe('OPEN');
  });

  it('rejects concurrent half-open probes', async () => {
    vi.useFakeTimers();
    const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 1_000 });
    await expect(breaker.execute(async () => { throw new Error('failure'); })).rejects.toThrow();
    vi.advanceTimersByTime(1_001);
    let resolveProbe!: (value: string) => void;
    const probe = breaker.execute(() => new Promise<string>((resolve) => { resolveProbe = resolve; }));
    await expect(breaker.execute(async () => 'second')).rejects.toMatchObject({ code: 'HALF_OPEN_PROBE_IN_PROGRESS' });
    resolveProbe('recovered');
    await expect(probe).resolves.toBe('recovered');
  });

  it.each([
    { failureThreshold: 0, resetTimeoutMs: 1_000 },
    { failureThreshold: -1, resetTimeoutMs: 1_000 },
    { failureThreshold: 1.5, resetTimeoutMs: 1_000 },
    { failureThreshold: Number.NaN, resetTimeoutMs: 1_000 },
    { failureThreshold: 1, resetTimeoutMs: 0 },
    { failureThreshold: 1, resetTimeoutMs: Number.POSITIVE_INFINITY },
  ])('rejects invalid config %#', (config) => {
    expect(() => new CircuitBreaker(config)).toThrow(CircuitBreakerError);
    try { new CircuitBreaker(config); } catch (error) { expect(error).toMatchObject({ code: 'INVALID_CONFIG' }); }
  });
});
