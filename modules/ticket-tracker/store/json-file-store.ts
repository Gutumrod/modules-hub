import fs from 'node:fs';
import path from 'node:path';
import type { TicketStore } from './types.js';
import type { Ticket, CreateTicketInput, TicketListFilter, TicketSchema, UpdateStatusResult } from '../core/types.js';
import { nextTicketId } from '../core/id.js';

export function createJsonFileStore(filePath = './tickets.json'): TicketStore {
  const resolvedPath = path.resolve(filePath);

  function readAll(): Ticket[] {
    try {
      if (!fs.existsSync(resolvedPath)) return [];
      const content = fs.readFileSync(resolvedPath, 'utf8');
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err: any) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  function writeAll(tickets: Ticket[]): void {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, JSON.stringify(tickets, null, 2), 'utf8');
  }

  return {
    async list(filter?: TicketListFilter): Promise<Ticket[]> {
      const tickets = readAll();
      return tickets.filter(t => {
        if (filter?.status && t.status !== filter.status) return false;
        if (filter?.priority && t.priority !== filter.priority) return false;
        return true;
      });
    },

    async get(id: string): Promise<Ticket | null> {
      const tickets = readAll();
      return tickets.find(t => t.id === id) || null;
    },

    async create(data: CreateTicketInput, schema: TicketSchema): Promise<Ticket> {
      const tickets = readAll();
      const now = new Date().toISOString();
      const newTicket: Ticket = {
        id: nextTicketId(tickets),
        status: schema.statuses[0],
        priority: data.priority,
        field_values: data.field_values,
        created_at: now,
        updated_at: now
      };
      tickets.push(newTicket);
      writeAll(tickets);
      return newTicket;
    },

    async updateStatus(
      id: string,
      patch: { status: string; field_values?: Record<string, unknown> },
      schema: TicketSchema
    ): Promise<UpdateStatusResult> {
      const tickets = readAll();
      const index = tickets.findIndex(t => t.id === id);
      if (index === -1) {
        return { ok: false, error: 'NOT_FOUND', message: `Ticket ${id} not found.` };
      }

      const current = tickets[index];

      if (!schema.statuses.includes(patch.status)) {
        return {
          ok: false,
          error: 'INVALID_STATUS',
          message: `Status '${patch.status}' is not valid for this schema.`,
          current_status: current.status,
          allowed_statuses: schema.statuses
        };
      }

      const allowed = schema.allowedTransitions[current.status] || [];
      if (!allowed.includes(patch.status)) {
        return {
          ok: false,
          error: 'INVALID_TRANSITION',
          message: `Cannot transition from ${current.status} to ${patch.status}. Allowed: ${allowed.join(', ')}`,
          current_status: current.status,
          allowed_statuses: allowed
        };
      }

      const now = new Date().toISOString();
      const updated: Ticket = {
        ...current,
        status: patch.status,
        field_values: patch.field_values
          ? { ...current.field_values, ...patch.field_values }
          : current.field_values,
        updated_at: now
      };

      tickets[index] = updated;
      writeAll(tickets);
      return { ok: true, ticket: updated };
    }
  };
}
