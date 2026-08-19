import { createJsonFileStore, createTicketRoutes, DEFAULT_SCHEMA } from '../index.js';
import type { TicketSchema } from '../index.js';

// 1. Simple/default case (backward-compatible with ticket-tracking-relay)
const store1 = createJsonFileStore('./tickets-default.json');
const routes1 = createTicketRoutes(store1, DEFAULT_SCHEMA);

// 2. Repurposed case: Car repair shop custom schema
const carRepairSchema: TicketSchema = {
  fields: [
    { key: 'license_plate', label: 'License Plate', type: 'text', required: true },
    { key: 'vehicle_model', label: 'Vehicle Model', type: 'text', required: true },
    { key: 'estimated_cost', label: 'Estimated Cost', type: 'number', required: true }
  ],
  statuses: ['RECEIVED', 'IN_REPAIR', 'TESTING', 'READY'],
  allowedTransitions: {
    RECEIVED: ['IN_REPAIR'],
    IN_REPAIR: ['TESTING'],
    TESTING: ['READY', 'IN_REPAIR'],
    READY: []
  },
  priorities: ['Normal', 'Urgent']
};

const store2 = createJsonFileStore('./tickets-car.json');
const routes2 = createTicketRoutes(store2, carRepairSchema);

export { store1, routes1, store2, routes2 };
