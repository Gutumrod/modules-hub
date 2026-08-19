import type { TicketSchema } from './types.js';

export function isStatus(schema: TicketSchema, value: string): boolean {
  return schema.statuses.includes(value);
}

export function isPriority(schema: TicketSchema, value: string): boolean {
  return (schema.priorities ?? ['Low', 'Medium', 'High']).includes(value);
}

export const DEFAULT_SCHEMA: TicketSchema = {
  fields: [
    { key: 'reporter_name', label: 'Reporter Name', type: 'text', required: true },
    { key: 'title', label: 'Issue Title', type: 'text', required: true },
    { key: 'description', label: 'Description', type: 'textarea', required: true }
  ],
  statuses: ['REPORTED', 'RECEIVED', 'IN_PROGRESS', 'DONE', 'CLOSED'],
  allowedTransitions: {
    REPORTED: ['RECEIVED', 'CLOSED'],
    RECEIVED: ['IN_PROGRESS', 'REPORTED'],
    IN_PROGRESS: ['DONE', 'RECEIVED'],
    DONE: ['CLOSED', 'IN_PROGRESS'],
    CLOSED: ['IN_PROGRESS']
  },
  priorities: ['Low', 'Medium', 'High']
};
