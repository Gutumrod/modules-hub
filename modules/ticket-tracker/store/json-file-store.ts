import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { ALLOWED_TRANSITIONS, isStatus } from '../core/constants.js';
import { nextTicketId } from '../core/id.js';
import type { CreateTicketInput, Ticket, UpdateStatusResult } from '../core/types.js';
import type { TicketListFilter, TicketStore } from './types.js';

/** Default TicketStore: a single JSON file, read/rewritten in full per write. No locking — fine for a demo, not for concurrent load (see DESIGN.md). */
export function createJsonFileStore(filePath: string): TicketStore {
  function ensureFile(): void {
    if (!existsSync(filePath)) {
      writeFileSync(filePath, '[]\n', 'utf8');
    }
  }

  function readAll(): Ticket[] {
    ensureFile();
    const raw = readFileSync(filePath, 'utf8').trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  }

  function writeAll(tickets: Ticket[]): void {
    writeFileSync(filePath, `${JSON.stringify(tickets, null, 2)}\n`, 'utf8');
  }

  return {
    async list(filter?: TicketListFilter): Promise<Ticket[]> {
      let tickets = readAll();
      if (filter?.status) tickets = tickets.filter((t) => t.status === filter.status);
      if (filter?.priority) tickets = tickets.filter((t) => t.priority === filter.priority);
      return [...tickets].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    },

    async get(id: string): Promise<Ticket | null> {
      return readAll().find((t) => t.id === id) ?? null;
    },

    async create(data: CreateTicketInput): Promise<Ticket> {
      const tickets = readAll();
      const now = new Date().toISOString();
      const ticket: Ticket = {
        id: nextTicketId(tickets),
        title: data.title,
        description: data.description,
        reporter_name: data.reporter_name,
        priority: data.priority,
        status: 'REPORTED',
        handler_notes: '',
        created_at: now,
        updated_at: now
      };
      tickets.push(ticket);
      writeAll(tickets);
      return ticket;
    },

    async updateStatus(id: string, patch: { status: string; handler_notes: string }): Promise<UpdateStatusResult> {
      const tickets = readAll();
      const index = tickets.findIndex((t) => t.id === id);
      if (index === -1) return { ok: false, reason: 'NOT_FOUND' };

      const current = tickets[index];
      const allowed = ALLOWED_TRANSITIONS[current.status] ?? [];
      if (!isStatus(patch.status) || !allowed.includes(patch.status)) {
        return { ok: false, reason: 'INVALID_TRANSITION', current_status: current.status, allowed_statuses: allowed };
      }

      const updated: Ticket = {
        ...current,
        status: patch.status,
        handler_notes: patch.handler_notes,
        updated_at: new Date().toISOString()
      };
      tickets[index] = updated;
      writeAll(tickets);
      return { ok: true, ticket: updated };
    }
  };
}
