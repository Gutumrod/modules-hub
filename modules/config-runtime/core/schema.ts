import type { ConfigError, ConfigField, ConfigSchema, Validator } from './types';

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function configError(field: string, message: string): ConfigError {
  return { code: 'CONFIG_INVALID', field, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertBooleanFlag(fieldName: string, field: Record<string, unknown>, key: 'required' | 'secret'): void {
  if (Object.prototype.hasOwnProperty.call(field, key) && typeof field[key] !== 'boolean') {
    throw configError(fieldName, `field '${fieldName}' has invalid ${key} flag`);
  }
}

function validateNumericBounds(fieldName: string, validator: Extract<Validator, { type: 'integer' | 'positiveNumber' }>): void {
  for (const key of ['min', 'max'] as const) {
    if (Object.prototype.hasOwnProperty.call(validator, key)) {
      const bound = validator[key];
      if (typeof bound !== 'number' || !Number.isFinite(bound)) {
        throw configError(fieldName, `field '${fieldName}' has invalid ${key} bound`);
      }
    }
  }

  if (
    typeof validator.min === 'number' &&
    typeof validator.max === 'number' &&
    validator.min > validator.max
  ) {
    throw configError(fieldName, `field '${fieldName}' has invalid numeric range`);
  }
}

function validateValidator(fieldName: string, validate: unknown): asserts validate is Validator {
  if (!isRecord(validate) || typeof validate.type !== 'string') {
    throw configError(fieldName, `field '${fieldName}' has invalid validator`);
  }

  switch (validate.type) {
    case 'string':
    case 'boolean':
    case 'url':
      return;
    case 'integer':
    case 'positiveNumber':
      validateNumericBounds(fieldName, validate as Extract<Validator, { type: 'integer' | 'positiveNumber' }>);
      return;
    case 'enum':
      if (!Array.isArray(validate.values) || !validate.values.every((value) => typeof value === 'string')) {
        throw configError(fieldName, `field '${fieldName}' has invalid enum values`);
      }
      return;
    case 'custom':
      if (typeof validate.fn !== 'function') {
        throw configError(fieldName, `field '${fieldName}' has invalid custom validator`);
      }
      return;
    default:
      throw configError(fieldName, `field '${fieldName}' has unknown validator type`);
  }
}

export function defineConfig(schema: Record<string, ConfigField>): ConfigSchema {
  if (!isRecord(schema)) {
    throw configError('', 'schema must be a plain object');
  }

  const result: Record<string, Readonly<ConfigField>> = Object.create(null);

  for (const fieldName of Object.keys(schema)) {
    if (UNSAFE_KEYS.has(fieldName)) {
      throw configError(fieldName, `field '${fieldName}' is not allowed`);
    }

    if (!Object.prototype.hasOwnProperty.call(schema, fieldName)) {
      continue;
    }

    const field = schema[fieldName] as unknown;
    if (!isRecord(field)) {
      throw configError(fieldName, `field '${fieldName}' must be a config field object`);
    }

    assertBooleanFlag(fieldName, field, 'required');
    assertBooleanFlag(fieldName, field, 'secret');

    if (field.required === true && Object.prototype.hasOwnProperty.call(field, 'default')) {
      throw configError(fieldName, `field '${fieldName}' cannot be required and have a default`);
    }

    if (Object.prototype.hasOwnProperty.call(field, 'validate')) {
      validateValidator(fieldName, field.validate);
    }

    result[fieldName] = Object.freeze({ ...(field as ConfigField) });
  }

  return Object.freeze(result);
}
