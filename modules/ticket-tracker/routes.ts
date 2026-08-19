import { isStatus, isPriority } from './core/constants.js';
import { validateCreatePayload, cleanString } from './core/index.js';
import type { TicketStore } from './store/types.js';
import type { TicketSchema } from './core/types.js';

/** Duck-typed against Express req/res — no hard dependency on the express package. */
export type MinimalRequest = {
  params: Record<string, string>;
  query: Record<string, unknown>;
  body: unknown;
};
export type MinimalResponse = {
  status(code: number): MinimalResponse;
  json(body: unknown): void;
};

export function createTicketRoutes(
  store: TicketStore,
  schema: TicketSchema | ((req: MinimalRequest) => TicketSchema)
) {
  function resolveSchema(req: MinimalRequest): TicketSchema {
    return typeof schema === 'function' ? schema(req) : schema;
  }

  return {
    async createTicket(req: MinimalRequest, res: MinimalResponse): Promise<void> {
      const resolvedSchema = resolveSchema(req);
      const result = validateCreatePayload(resolvedSchema, (req.body as Record<string, unknown>) ?? {});
      if (!result.ok) {
        res.status(400).json({ error: 'Validation failed', errors: result.errors });
        return;
      }
      const ticket = await store.create(result.data, resolvedSchema);
      res.status(201).json(ticket);
    },

    async listTickets(req: MinimalRequest, res: MinimalResponse): Promise<void> {
      const resolvedSchema = resolveSchema(req);
      const status = cleanString(req.query.status);
      const priority = cleanString(req.query.priority);
      if (status && !isStatus(resolvedSchema, status)) {
        res.status(400).json({ error: `Invalid status filter. Must be one of: ${resolvedSchema.statuses.join(', ')}.` });
        return;
      }
      if (priority && !isPriority(resolvedSchema, priority)) {
        res.status(400).json({ error: `Invalid priority filter.` });
        return;
      }
      const tickets = await store.list({ status: status || undefined, priority: priority || undefined });
      res.json(tickets);
    },

    async getTicket(req: MinimalRequest, res: MinimalResponse): Promise<void> {
      const id = cleanString(req.params.id).toUpperCase();
      const ticket = await store.get(id);
      if (!ticket) {
        res.status(404).json({ error: 'Ticket not found' });
        return;
      }
      res.json(ticket);
    },

    async updateStatus(req: MinimalRequest, res: MinimalResponse): Promise<void> {
      const resolvedSchema = resolveSchema(req);
      const id = cleanString(req.params.id).toUpperCase();
      const body = (req.body as Record<string, unknown>) ?? {};
      const status = cleanString(body.status);
      const field_values =
        body.field_values && typeof body.field_values === 'object'
          ? (body.field_values as Record<string, unknown>)
          : undefined;

      if (!isStatus(resolvedSchema, status)) {
        res.status(400).json({ error: 'Invalid target status' });
        return;
      }

      const result = await store.updateStatus(id, { status, field_values }, resolvedSchema);
      if (!result.ok) {
        if (result.error === 'NOT_FOUND') {
          res.status(404).json({ error: result.message });
          return;
        }
        res.status(409).json({
          error: result.message,
          current_status: result.current_status,
          allowed_statuses: result.allowed_statuses
        });
        return;
      }
      res.json(result.ticket);
    }
  };
}
