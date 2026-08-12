export type ScheduleType = 'interval' | 'cron';

export type Schedule = {
  readonly id: string;
  readonly type: ScheduleType;
  readonly value: string | number; // cron string or ms interval
  readonly taskType: string;
  readonly payload?: Record<string, unknown>;
  readonly enabled: boolean;
};

export type ScheduleTriggerEvent = {
  readonly scheduleId: string;
  readonly taskType: string;
  readonly payload?: Record<string, unknown>;
  readonly triggeredAt: string; // ISO-8601
};

export interface SchedulerEngine {
  register(schedule: Schedule): void;
  unregister(scheduleId: string): void;
  start(): void;
  stop(): void;
  onTrigger(callback: (event: ScheduleTriggerEvent) => void): void;
}
