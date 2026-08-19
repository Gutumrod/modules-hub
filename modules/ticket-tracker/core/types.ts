import type { Priority, Status } from './constants.js';

/**
 * Ticket shape. Field set matches this module's default use case (a reporter
 * files an issue, a handler works it). A host repurposing this module for a
 * different domain (e.g. product claims tied to an order) edits this type in
 * its own copy — see DESIGN.md Non-Goals.
 */
export type Ticket = {
  id: string;
  title: string;
  description: string;
  reporter_name: string;
  priority: Priority;
  status: Status;
  handler_notes: string;
  created_at: string;
  updated_at: string;
};

export type CreateTicketInput = {
  reporter_name: string;
  title: string;
  description: string;
  priority: Priority;
};

export type ValidationResult =
  | { ok: true; data: CreateTicketInput }
  | { ok: false; errors: Record<string, string> };

export type UpdateStatusResult =
  | { ok: true; ticket: Ticket }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'INVALID_TRANSITION'; current_status: Status; allowed_statuses: Status[] };
