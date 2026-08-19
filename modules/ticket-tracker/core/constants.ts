export const PRIORITIES = ['Low', 'Medium', 'High'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const STATUSES = ['REPORTED', 'RECEIVED', 'IN_PROGRESS', 'DONE', 'CLOSED'] as const;
export type Status = (typeof STATUSES)[number];

export const ALLOWED_TRANSITIONS: Record<Status, Status[]> = {
  REPORTED: ['RECEIVED', 'CLOSED'],
  RECEIVED: ['IN_PROGRESS', 'REPORTED'],
  IN_PROGRESS: ['DONE', 'RECEIVED'],
  DONE: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: ['IN_PROGRESS']
};

export function isPriority(value: string): value is Priority {
  return (PRIORITIES as readonly string[]).includes(value);
}

export function isStatus(value: string): value is Status {
  return (STATUSES as readonly string[]).includes(value);
}
