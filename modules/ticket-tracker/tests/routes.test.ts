import { describe, it, expect } from 'vitest';
import { createTicketRoutes, DEFAULT_SCHEMA } from '../index.js';
import type { TicketStore } from '../store/types.js';
import type { Ticket, CreateTicketInput, TicketListFilter, TicketSchema, UpdateStatusResult } from '../core/types.js';
import type { MinimalRequest, MinimalResponse } from '../routes.js';

// In-memory fake store for testing routes without filesystem
function createMemoryStore(): TicketStore {
  const tickets: Ticket[] = [];
  let counter = 1000;

  return {
    async list(filter?: TicketListFilter): Promise<Ticket[]> {
      return tickets.filter(t => {
        if (filter?.status && t.status !== filter.status) return false;
        if (filter?.priority && t.priority !== filter.priority) return false;
        return true;
      });
    },
    async get(id: string): Promise<Ticket | null> {
      return tickets.find(t => t.id === id) || null;
    },
    async create(data: CreateTicketInput, schema: TicketSchema): Promise<Ticket> {
      counter++;
      const now = new Date().toISOString();
      const ticket: Ticket = {
        id: `TCK-${counter}`,
        status: schema.statuses[0],
        priority: data.priority,
        field_values: data.field_values,
        created_at: now,
        updated_at: now
      };
      tickets.push(ticket);
      return ticket;
    },
    async updateStatus(
      id: string,
      patch: { status: string; field_values?: Record<string, unknown> },
      schema: TicketSchema
    ): Promise<UpdateStatusResult> {
      const ticket = tickets.find(t => t.id === id);
      if (!ticket) {
        return { ok: false, error: 'NOT_FOUND', message: 'Not found' };
      }
      const allowed = schema.allowedTransitions[ticket.status] || [];
      if (!allowed.includes(patch.status)) {
        return {
          ok: false,
          error: 'INVALID_TRANSITION',
          message: 'Invalid transition',
          current_status: ticket.status,
          allowed_statuses: allowed
        };
      }
      ticket.status = patch.status;
      if (patch.field_values) {
        ticket.field_values = { ...ticket.field_values, ...patch.field_values };
      }
      ticket.updated_at = new Date().toISOString();
      return { ok: true, ticket };
    }
  };
}

// Fake response mock
function createMockResponse() {
  let statusCode = 200;
  let responseBody: unknown = null;

  const res: MinimalResponse = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(body: unknown) {
      responseBody = body;
    }
  };

  return {
    res,
    getStatus: () => statusCode,
    getBody: () => responseBody
  };
}

describe('ticket-tracker routes (v0.2.0)', () => {
  it('returns an object with exactly 4 handlers', () => {
    const store = createMemoryStore();
    const routes = createTicketRoutes(store, DEFAULT_SCHEMA);

    expect(typeof routes.createTicket).toBe('function');
    expect(typeof routes.listTickets).toBe('function');
    expect(typeof routes.getTicket).toBe('function');
    expect(typeof routes.updateStatus).toBe('function');
  });

  it('creates ticket successfully with default schema', async () => {
    const store = createMemoryStore();
    const routes = createTicketRoutes(store, DEFAULT_SCHEMA);

    const req: MinimalRequest = {
      params: {},
      query: {},
      body: {
        reporter_name: 'Alice',
        title: 'Network timeout',
        description: 'Failed to connect to gateway',
        priority: 'High'
      }
    };

    const { res, getStatus, getBody } = createMockResponse();
    await routes.createTicket(req, res);

    expect(getStatus()).toBe(201);
    const ticket = getBody() as Ticket;
    expect(ticket.status).toBe('REPORTED');
    expect(ticket.priority).toBe('High');
    expect(ticket.field_values.reporter_name).toBe('Alice');
  });

  it('rejects invalid create payload (missing required field)', async () => {
    const store = createMemoryStore();
    const routes = createTicketRoutes(store, DEFAULT_SCHEMA);

    const req: MinimalRequest = {
      params: {},
      query: {},
      body: {
        reporter_name: 'Alice'
        // missing title and description
      }
    };

    const { res, getStatus } = createMockResponse();
    await routes.createTicket(req, res);

    expect(getStatus()).toBe(400);
  });

  it('allows valid status transition', async () => {
    const store = createMemoryStore();
    const routes = createTicketRoutes(store, DEFAULT_SCHEMA);

    // Create ticket first
    const created = await store.create(
      {
        field_values: { reporter_name: 'Bob', title: 'Bug', description: 'Desc' },
        priority: 'Medium'
      },
      DEFAULT_SCHEMA
    );

    const req: MinimalRequest = {
      params: { id: created.id },
      query: {},
      body: { status: 'RECEIVED' }
    };

    const { res, getStatus, getBody } = createMockResponse();
    await routes.updateStatus(req, res);

    expect(getStatus()).toBe(200);
    const updated = getBody() as Ticket;
    expect(updated.status).toBe('RECEIVED');
  });

  it('rejects invalid status transition with 409', async () => {
    const store = createMemoryStore();
    const routes = createTicketRoutes(store, DEFAULT_SCHEMA);

    const created = await store.create(
      {
        field_values: { reporter_name: 'Bob', title: 'Bug', description: 'Desc' },
        priority: 'Medium'
      },
      DEFAULT_SCHEMA
    );

    // REPORTED -> DONE is not allowed directly (must go through RECEIVED)
    const req: MinimalRequest = {
      params: { id: created.id },
      query: {},
      body: { status: 'DONE' }
    };

    const { res, getStatus } = createMockResponse();
    await routes.updateStatus(req, res);

    expect(getStatus()).toBe(409);
  });

  it('supports custom non-default schema end-to-end', async () => {
    const store = createMemoryStore();
    const customSchema: TicketSchema = {
      fields: [{ key: 'device_id', label: 'Device ID', type: 'text', required: true }],
      statuses: ['PENDING', 'RESOLVED'],
      allowedTransitions: { PENDING: ['RESOLVED'], RESOLVED: [] },
      priorities: ['Low', 'Critical']
    };

    const routes = createTicketRoutes(store, customSchema);

    const req: MinimalRequest = {
      params: {},
      query: {},
      body: { device_id: 'DEV-999', priority: 'Critical' }
    };

    const { res, getStatus, getBody } = createMockResponse();
    await routes.createTicket(req, res);

    expect(getStatus()).toBe(201);
    const ticket = getBody() as Ticket;
    expect(ticket.status).toBe('PENDING');
    expect(ticket.field_values.device_id).toBe('DEV-999');
  });
});
