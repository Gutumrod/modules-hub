import { createJsonFileStore } from '../store/json-file-store.js';
import { createTicketRoutes } from '../routes.js';

// Host wires the default JSON-file store and mounts handlers on its own
// Express app, choosing per-route middleware itself (auth, tenant scoping,
// whatever it needs — this module has no opinion).
const store = createJsonFileStore('./tickets.json');
const tickets = createTicketRoutes(store);

// app.post('/api/tickets', tickets.createTicket);
// app.get('/api/tickets/:id', tickets.getTicket);
// app.get('/api/tickets', requireHandlerAuth, tickets.listTickets);
// app.patch('/api/tickets/:id/status', requireHandlerAuth, tickets.updateStatus);

export { store, tickets };
