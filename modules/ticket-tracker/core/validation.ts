import type { TicketSchema, ValidationResult } from './types.js';
import { isPriority } from './constants.js';

export function cleanString(val: unknown): string {
  if (typeof val !== 'string') return '';
  return val.trim();
}

export function validateCreatePayload(schema: TicketSchema, body: Record<string, unknown>): ValidationResult {
  const errors: Record<string, string> = {};
  const field_values: Record<string, unknown> = {};

  for (const field of schema.fields) {
    const raw = body[field.key];

    if (field.type === 'text' || field.type === 'textarea') {
      const cleaned = cleanString(raw);
      if (field.required && !cleaned) {
        errors[field.key] = `${field.label} is required.`;
      } else {
        field_values[field.key] = cleaned;
      }
    } else if (field.type === 'number') {
      if (raw === undefined || raw === null || raw === '') {
        if (field.required) {
          errors[field.key] = `${field.label} is required.`;
        }
      } else {
        const num = Number(raw);
        if (isNaN(num) || !isFinite(num)) {
          errors[field.key] = `${field.label} must be a valid number.`;
        } else {
          field_values[field.key] = num;
        }
      }
    } else if (field.type === 'date') {
      if (!raw) {
        if (field.required) {
          errors[field.key] = `${field.label} is required.`;
        }
      } else {
        const d = new Date(String(raw));
        if (isNaN(d.getTime())) {
          errors[field.key] = `${field.label} must be a valid date.`;
        } else {
          field_values[field.key] = String(raw);
        }
      }
    } else if (field.type === 'select') {
      const cleaned = cleanString(raw);
      if (!cleaned) {
        if (field.required) {
          errors[field.key] = `${field.label} is required.`;
        }
      } else if (field.options && !field.options.includes(cleaned)) {
        errors[field.key] = `${field.label} must be one of: ${field.options.join(', ')}.`;
      } else {
        field_values[field.key] = cleaned;
      }
    } else if (field.type === 'checkbox') {
      if (typeof raw !== 'boolean') {
        if (field.required && raw === undefined) {
          errors[field.key] = `${field.label} is required.`;
        } else {
          field_values[field.key] = Boolean(raw);
        }
      } else {
        field_values[field.key] = raw;
      }
    }
  }

  const defaultPriorities = schema.priorities ?? ['Low', 'Medium', 'High'];
  const priority = cleanString(body.priority) || defaultPriorities[0];
  if (!isPriority(schema, priority)) {
    errors.priority = `Priority must be one of: ${defaultPriorities.join(', ')}.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { field_values, priority } };
}
