import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_SCHEMA, validateCreatePayload, isStatus, isPriority } from '../core/index.js';
import { createJsonFileStore } from '../store/json-file-store.js';
import type { TicketSchema } from '../core/types.js';
import fs from 'node:fs';

describe('ticket-tracker core & store (v0.2.0)', () => {
  const testStorePath = './test-tickets.json';

  beforeEach(() => {
    if (fs.existsSync(testStorePath)) {
      fs.unlinkSync(testStorePath);
    }
  });

  it('validates default create payload correctly', () => {
    const valid = validateCreatePayload(DEFAULT_SCHEMA, {
      reporter_name: 'Alice',
      title: 'Login bug',
      description: 'Cannot login with GitHub',
      priority: 'High'
    });
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.data.priority).toBe('High');
      expect(valid.data.field_values.reporter_name).toBe('Alice');
    }
  });

  it('rejects missing required fields in default schema', () => {
    const invalid = validateCreatePayload(DEFAULT_SCHEMA, {
      reporter_name: '',
      title: 'Missing desc'
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.errors.reporter_name).toBeDefined();
      expect(invalid.errors.description).toBeDefined();
    }
  });

  it('validates custom schema payloads correctly', () => {
    const customSchema: TicketSchema = {
      fields: [
        { key: 'license_plate', label: 'License Plate', type: 'text', required: true },
        { key: 'estimated_cost', label: 'Estimated Cost', type: 'number', required: true }
      ],
      statuses: ['OPEN', 'CLOSED'],
      allowedTransitions: { OPEN: ['CLOSED'], CLOSED: [] },
      priorities: ['Low', 'Urgent']
    };

    const valid = validateCreatePayload(customSchema, {
      license_plate: '1กข 1234',
      estimated_cost: 1500,
      priority: 'Urgent'
    });
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.data.field_values.estimated_cost).toBe(1500);
      expect(valid.data.priority).toBe('Urgent');
    }

    const invalidNumber = validateCreatePayload(customSchema, {
      license_plate: '1กข 1234',
      estimated_cost: 'not-a-number'
    });
    expect(invalidNumber.ok).toBe(false);
    if (!invalidNumber.ok) {
      expect(invalidNumber.errors.estimated_cost).toBeDefined();
    }
  });

  it('checks status and priority correctly against schema', () => {
    expect(isStatus(DEFAULT_SCHEMA, 'REPORTED')).toBe(true);
    expect(isStatus(DEFAULT_SCHEMA, 'UNKNOWN')).toBe(false);
    expect(isPriority(DEFAULT_SCHEMA, 'High')).toBe(true);
    expect(isPriority(DEFAULT_SCHEMA, 'Extreme')).toBe(false);
  });

  it('creates ticket with initial status from schema.statuses[0]', async () => {
    const customSchema: TicketSchema = {
      fields: [{ key: 'topic', label: 'Topic', type: 'text', required: true }],
      statuses: ['NEW_STATUS', 'DONE_STATUS'],
      allowedTransitions: { NEW_STATUS: ['DONE_STATUS'], DONE_STATUS: [] }
    };

    const store = createJsonFileStore(testStorePath);
    const ticket = await store.create({ field_values: { topic: 'Test' } }, customSchema);

    expect(ticket.status).toBe('NEW_STATUS');
    expect(ticket.field_values.topic).toBe('Test');
  });

  it('enforces allowed transitions inside store.updateStatus', async () => {
    const store = createJsonFileStore(testStorePath);
    const ticket = await store.create(
      {
        field_values: {
          reporter_name: 'Bob',
          title: 'Bug',
          description: 'Desc'
        },
        priority: 'Medium'
      },
      DEFAULT_SCHEMA
    );

    // REPORTED -> RECEIVED is allowed
    const res1 = await store.updateStatus(ticket.id, { status: 'RECEIVED' }, DEFAULT_SCHEMA);
    expect(res1.ok).toBe(true);
    if (res1.ok) {
      expect(res1.ticket.status).toBe('RECEIVED');
    }

    // RECEIVED -> DONE is NOT allowed directly (must go through IN_PROGRESS)
    const res2 = await store.updateStatus(ticket.id, { status: 'DONE' }, DEFAULT_SCHEMA);
    expect(res2.ok).toBe(false);
    if (!res2.ok) {
      expect(res2.error).toBe('INVALID_TRANSITION');
    }
  });
});
