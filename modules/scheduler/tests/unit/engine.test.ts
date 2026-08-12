import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemorySchedulerEngine } from '../../core/engine.js';
import type { Schedule } from '../../core/types.js';

describe('Memory Scheduler Engine', () => {
  let engine: MemorySchedulerEngine;

  beforeEach(() => {
    vi.useFakeTimers();
    engine = new MemorySchedulerEngine();
  });

  afterEach(() => {
    engine.stop();
    vi.restoreAllMocks();
  });

  it('should trigger interval tasks', () => {
    const callback = vi.fn();
    engine.onTrigger(callback);

    const schedule: Schedule = {
      id: 's1',
      type: 'interval',
      value: 1000,
      taskType: 'test',
      enabled: true
    };

    engine.register(schedule);
    engine.start();

    vi.advanceTimersByTime(1000);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      scheduleId: 's1',
      taskType: 'test'
    }));

    vi.advanceTimersByTime(2000);
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it('should not trigger disabled tasks', () => {
    const callback = vi.fn();
    engine.onTrigger(callback);

    engine.register({
      id: 's2',
      type: 'interval',
      value: 1000,
      taskType: 'test',
      enabled: false
    });
    engine.start();

    vi.advanceTimersByTime(2000);
    expect(callback).not.toHaveBeenCalled();
  });

  it('should stop all tasks on stop()', () => {
    const callback = vi.fn();
    engine.onTrigger(callback);

    engine.register({
      id: 's3',
      type: 'interval',
      value: 1000,
      taskType: 'test',
      enabled: true
    });
    engine.start();
    engine.stop();

    vi.advanceTimersByTime(2000);
    expect(callback).not.toHaveBeenCalled();
  });

  it('should allow manual triggering by ID', () => {
    const callback = vi.fn();
    engine.onTrigger(callback);

    engine.register({
      id: 's4',
      type: 'cron',
      value: '* * * * *',
      taskType: 'cron-task',
      enabled: true
    });

    engine.triggerById('s4');
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
