import type { Ticket, CreateTicketInput, TicketListFilter, TicketSchema, UpdateStatusResult } from '../core/types.js';

export interface TicketStore {
  list(filter?: TicketListFilter): Promise<Ticket[]>;
  get(id: string): Promise<Ticket | null>;
  create(data: CreateTicketInput, schema: TicketSchema): Promise<Ticket>;
  updateStatus(
    id: string,
    patch: { status: string; field_values?: Record<string, unknown> },
    schema: TicketSchema
  ): Promise<UpdateStatusResult>;
}
