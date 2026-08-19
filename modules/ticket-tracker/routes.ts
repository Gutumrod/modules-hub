import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TicketStore } from './store/types.js';
import type { TicketSchema } from './core/types.js';
import { validateCreatePayload, isStatus, isPriority } from './core/index.js';

export type MinimalRequest = IncomingMessage & { url?: string; method?: string };

export function createTicketRoutes(
  store: TicketStore,
  schema: TicketSchema | ((req: MinimalRequest) => TicketSchema)
) {
  function resolveSchema(req: MinimalRequest): TicketSchema {
    return typeof schema === 'function' ? schema(req) : schema;
  }

  async function parseJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
      });
      req.on('end', () => {
        if (!body.trim()) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', err => reject(err));
    });
  }

  function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
  }

  return async function handleRequest(req: MinimalRequest, res: ServerResponse): Promise<void> {
    const method = req.method?.toUpperCase() || 'GET';
    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    const resolvedSchema = resolveSchema(req);

    // GET /tickets
    if (method === 'GET' && pathname === '/tickets') {
      const statusParam = parsedUrl.searchParams.get('status') || undefined;
      const priorityParam = parsedUrl.searchParams.get('priority') || undefined;

      if (statusParam && !isStatus(resolvedSchema, statusParam)) {
        sendJson(res, 400, { error: `Invalid status filter: ${statusParam}` });
        return;
      }
      if (priorityParam && !isPriority(resolvedSchema, priorityParam)) {
        sendJson(res, 400, { error: `Invalid priority filter: ${priorityParam}` });
        return;
      }

      const tickets = await store.list({ status: statusParam, priority: priorityParam });
      sendJson(res, 200, { tickets });
      return;
    }

    // POST /tickets
    if (method === 'POST' && pathname === '/tickets') {
      try {
        const body = await parseJsonBody(req);
        const result = validateCreatePayload(resolvedSchema, body);
        if (!result.ok) {
          sendJson(res, 400, { errors: result.errors });
          return;
        }

        const ticket = await store.create(result.data, resolvedSchema);
        sendJson(res, 201, { ticket });
      } catch (err: any) {
        sendJson(res, 400, { error: err.message || 'Invalid request' });
      }
      return;
    }

    // GET /tickets/:id
    const singleMatch = pathname.match(/^\/tickets\/([^/]+)$/);
    if (method === 'GET' && singleMatch) {
      const id = singleMatch[1];
      const ticket = await store.get(id);
      if (!ticket) {
        sendJson(res, 404, { error: `Ticket ${id} not found` });
        return;
      }
      sendJson(res, 200, { ticket });
      return;
    }

    // PATCH /tickets/:id/status
    const statusMatch = pathname.match(/^\/tickets\/([^/]+)\/status$/);
    if (method === 'PATCH' && statusMatch) {
      const id = statusMatch[1];
      try {
        const body = await parseJsonBody(req);
        const nextStatus = typeof body.status === 'string' ? body.status.trim() : '';

        if (!nextStatus || !isStatus(resolvedSchema, nextStatus)) {
          sendJson(res, 400, {
            error: `Invalid or missing status. Valid statuses: ${resolvedSchema.statuses.join(', ')}`
          });
          return;
        }

        const fieldValuesPatch =
          body.field_values && typeof body.field_values === 'object'
            ? (body.field_values as Record<string, unknown>)
            : undefined;

        const result = await store.updateStatus(
          id,
          { status: nextStatus, field_values: fieldValuesPatch },
          resolvedSchema
        );

        if (!result.ok) {
          if (result.error === 'NOT_FOUND') {
            sendJson(res, 404, { error: result.message });
          } else {
            sendJson(res, 409, {
              error: result.message,
              current_status: result.current_status,
              allowed_statuses: result.allowed_statuses
            });
          }
          return;
        }

        sendJson(res, 200, { ticket: result.ticket });
      } catch (err: any) {
        sendJson(res, 400, { error: err.message || 'Invalid request' });
      }
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  };
}
