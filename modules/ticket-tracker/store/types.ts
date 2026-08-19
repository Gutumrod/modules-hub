import type { CreateTicketInput, Ticket, UpdateStatusResult } from '../core/types.js';

export type TicketListFilter = {
  status?: string;
  priority?: string;
};

/**
 * Storage boundary. Core/routes never touch a file, a table, or an env var —
 * the host supplies a TicketStore implementation. Default: json-file-store.ts.
 */
export interface TicketStore {
  list(filter?: TicketListFilter): Promise<Ticket[]>;
  get(id: string): Promise<Ticket | null>;
  create(data: CreateTicketInput): Promise<Ticket>;
  updateStatus(id: string, patch: { status: string; handler_notes: string }): Promise<UpdateStatusResult>;
}
