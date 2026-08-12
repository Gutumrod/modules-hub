import type { 
  Schedule, 
  ScheduleTriggerEvent, 
  SchedulerEngine 
} from './types.js';

export class MemorySchedulerEngine implements SchedulerEngine {
  private schedules: Map<string, Schedule> = new Map();
  private timers: Map<string, any> = new Map();
  private callbacks: ((event: ScheduleTriggerEvent) => void)[] = [];
  private running: boolean = false;

  register(schedule: Schedule): void {
    this.schedules.set(schedule.id, schedule);
    if (this.running && schedule.enabled) {
      this.scheduleTask(schedule);
    }
  }

  unregister(scheduleId: string): void {
    this.stopTask(scheduleId);
    this.schedules.delete(scheduleId);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    for (const schedule of this.schedules.values()) {
      if (schedule.enabled) {
        this.scheduleTask(schedule);
      }
    }
  }

  stop(): void {
    this.running = false;
    for (const timerId of this.timers.keys()) {
      this.stopTask(timerId);
    }
  }

  onTrigger(callback: (event: ScheduleTriggerEvent) => void): void {
    this.callbacks.push(callback);
  }

  private scheduleTask(schedule: Schedule): void {
    this.stopTask(schedule.id);

    if (schedule.type === 'interval') {
      const intervalMs = typeof schedule.value === 'number' ? schedule.value : parseInt(schedule.value, 10);
      if (isNaN(intervalMs)) return;

      const timer = setInterval(() => {
        this.trigger(schedule);
      }, intervalMs);
      
      this.timers.set(schedule.id, timer);
    } 
    // v0.1: Basic Cron support is limited to a simple poller or manual trigger
    // For Cloudflare Workers, the host triggers this via 'scheduled' event
  }

  private stopTask(scheduleId: string): void {
    const timer = this.timers.get(scheduleId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(scheduleId);
    }
  }

  private trigger(schedule: Schedule): void {
    const event: ScheduleTriggerEvent = {
      scheduleId: schedule.id,
      taskType: schedule.taskType,
      payload: schedule.payload,
      triggeredAt: new Date().toISOString()
    };

    for (const callback of this.callbacks) {
      callback(event);
    }
  }

  /**
   * Manual trigger helper (useful for Cron events from Host)
   */
  triggerById(scheduleId: string): void {
    const schedule = this.schedules.get(scheduleId);
    if (schedule && schedule.enabled) {
      this.trigger(schedule);
    }
  }
}
