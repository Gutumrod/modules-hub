import { PRIORITIES, STATUSES, isPriority, isStatus } from './core/constants.js';
import { cleanString, validateCreatePayload } from './core/validation.js';
import type { TicketStore } from './store/types.js';

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

/**
 * Plain per-endpoint handlers, not a bundled Router — the host mounts each on
 * its own path and decides which ones (if any) get auth middleware. This
 * module has no concept of auth; see DESIGN.md Non-Goals.
 */
export function createTicketRoutes(store: TicketStore) {
  return {
    async createTicket(req: MinimalRequest, res: MinimalResponse): Promise<void> {
      const result = validateCreatePayload((req.body as Record<string, unknown>) ?? {});
      if (!result.ok) {
        res.status(400).json({ error: 'Validation failed', errors: result.errors });
        return;
      }
      const ticket = await store.create(result.data);
      res.status(201).json(ticket);
    },

    async listTickets(req: MinimalRequest, res: MinimalResponse): Promise<void> {
      const status = cleanString(req.query.status);
      const priority = cleanString(req.query.priority);
      if (status && !isStatus(status)) {
        res.status(400).json({ error: `Invalid status filter. Must be one of: ${STATUSES.join(', ')}.` });
        return;
      }
      if (priority && !isPriority(priority)) {
        res.status(400).json({ error: `Invalid priority filter. Must be one of: ${PRIORITIES.join(', ')}.` });
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
      const id = cleanString(req.params.id).toUpperCase();
      const body = (req.body as Record<string, unknown>) ?? {};
      const status = cleanString(body.status);
      const handler_notes = cleanString(body.handler_notes);

      if (!isStatus(status)) {
        res.status(400).json({ error: 'Invalid target status' });
        return;
      }

      const result = await store.updateStatus(id, { status, handler_notes });
      if (!result.ok) {
        if (result.reason === 'NOT_FOUND') {
          res.status(404).json({ error: 'Ticket not found' });
          return;
        }
        res.status(400).json({
          error: 'Invalid status transition',
          current_status: result.current_status,
          allowed_statuses: result.allowed_statuses
        });
        return;
      }
      res.json(result.ticket);
    }
  };
}
