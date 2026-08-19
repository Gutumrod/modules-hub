import { PRIORITIES, isPriority } from './constants.js';
import type { ValidationResult } from './types.js';

export function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function validateCreatePayload(body: Record<string, unknown>): ValidationResult {
  const errors: Record<string, string> = {};
  const reporter_name = cleanString(body.reporter_name);
  const title = cleanString(body.title);
  const description = cleanString(body.description);
  const priority = cleanString(body.priority) || 'Medium';

  if (!reporter_name) errors.reporter_name = 'Reporter name is required.';
  if (!title) errors.title = 'Issue title is required.';
  if (title.length > 100) errors.title = 'Issue title must be 100 characters or fewer.';
  if (!description) errors.description = 'Description is required.';
  if (!isPriority(priority)) errors.priority = `Priority must be one of: ${PRIORITIES.join(', ')}.`;

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, data: { reporter_name, title, description, priority: priority as (typeof PRIORITIES)[number] } };
}
