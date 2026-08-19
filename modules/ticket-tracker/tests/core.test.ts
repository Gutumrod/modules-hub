import { describe, expect, it } from 'vitest';
import { ALLOWED_TRANSITIONS, isStatus } from '../core/constants.js';
import { nextTicketId } from '../core/id.js';
import { validateCreatePayload } from '../core/validation.js';

describe('validateCreatePayload', () => {
  it('accepts a valid payload and defaults priority to Medium', () => {
    const result = validateCreatePayload({
      reporter_name: 'Alice',
      title: 'Broken widget',
      description: 'It does not spin.'
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.priority).toBe('Medium');
  });

  it('rejects missing required fields', () => {
    const result = validateCreatePayload({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.reporter_name).toBeDefined();
      expect(result.errors.title).toBeDefined();
      expect(result.errors.description).toBeDefined();
    }
  });

  it('rejects an unknown priority', () => {
    const result = validateCreatePayload({
      reporter_name: 'Alice',
      title: 'x',
      description: 'y',
      priority: 'Critical'
    });
    expect(result.ok).toBe(false);
  });
});

describe('status transitions', () => {
  it('allows every documented transition', () => {
    expect(ALLOWED_TRANSITIONS.REPORTED).toContain('RECEIVED');
    expect(ALLOWED_TRANSITIONS.CLOSED).toEqual(['IN_PROGRESS']);
  });

  it('isStatus rejects unknown values', () => {
    expect(isStatus('REPORTED')).toBe(true);
    expect(isStatus('ARCHIVED')).toBe(false);
  });
});

describe('nextTicketId', () => {
  it('starts at TCK-1001 for an empty list', () => {
    expect(nextTicketId([])).toBe('TCK-1001');
  });

  it('increments past the highest existing id', () => {
    expect(nextTicketId([{ id: 'TCK-1001' }, { id: 'TCK-1007' }])).toBe('TCK-1008');
  });
});
