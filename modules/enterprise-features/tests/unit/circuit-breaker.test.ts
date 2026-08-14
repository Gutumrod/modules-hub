import { describe, it, expect, vi } from 'vitest';
import { CircuitBreaker } from '../../core/circuit-breaker.js';

describe('CircuitBreaker', () => {
  it('should execute successfully when in CLOSED state', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 1000 });
    const fn = vi.fn().mockResolvedValue('success');

    const result = await cb.execute(fn);
    expect(result).toBe('success');
    expect(cb.getStatus().state).toBe('CLOSED');
  });

  it('should open the circuit after reaching failure threshold', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 1000 });
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    await expect(cb.execute(fn)).rejects.toThrow('fail');
    await expect(cb.execute(fn)).rejects.toThrow('fail');

    expect(cb.getStatus().state).toBe('OPEN');
    await expect(cb.execute(fn)).rejects.toThrow('Circuit breaker is OPEN');
  });

  it('should transition to HALF_OPEN after reset timeout', async () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 1000 });
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    await expect(cb.execute(fn)).rejects.toThrow('fail');
    expect(cb.getStatus().state).toBe('OPEN');

    vi.advanceTimersByTime(1001);
    
    // The next call will trigger state update to HALF_OPEN
    const successFn = vi.fn().mockResolvedValue('back');
    const result = await cb.execute(successFn);
    
    expect(result).toBe('back');
    expect(cb.getStatus().state).toBe('CLOSED');
    vi.useRealTimers();
  });
});
