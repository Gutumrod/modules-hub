import type { ConfigError, ConfigSchema, ParsedConfig, Validator } from './types';

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function configError(code: ConfigError['code'], field: string, message: string): ConfigError {
  return { code, field, message };
}

function hasOwn(source: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function toFiniteNumber(field: string, value: unknown): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw configError('CONFIG_TYPE_INVALID', field, `field '${field}' must be a finite number`);
    }
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  throw configError('CONFIG_TYPE_INVALID', field, `field '${field}' must be numeric`);
}

function checkRange(field: string, value: number, validator: Extract<Validator, { type: 'integer' | 'positiveNumber' }>): void {
  if (
    (typeof validator.min === 'number' && value < validator.min) ||
    (typeof validator.max === 'number' && value > validator.max)
  ) {
    throw configError('CONFIG_VALUE_OUT_OF_RANGE', field, `field '${field}' is outside the allowed range`);
  }
}

function coerceInteger(field: string, value: unknown, validator: Extract<Validator, { type: 'integer' }>): number {
  const numeric = toFiniteNumber(field, value);

  if (!Number.isInteger(numeric) || Math.abs(numeric) > Number.MAX_SAFE_INTEGER) {
    throw configError('CONFIG_TYPE_INVALID', field, `field '${field}' must be a safe integer`);
  }

  checkRange(field, numeric, validator);
  return numeric;
}

function coercePositiveNumber(field: string, value: unknown, validator: Extract<Validator, { type: 'positiveNumber' }>): number {
  const numeric = toFiniteNumber(field, value);

  if (numeric <= 0) {
    throw configError('CONFIG_TYPE_INVALID', field, `field '${field}' must be a positive number`);
  }

  checkRange(field, numeric, validator);
  return numeric;
}

function coerceBoolean(field: string, value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw configError('CONFIG_TYPE_INVALID', field, `field '${field}' must be a boolean`);
}

function coerceValue(field: string, value: unknown, validator: Validator | undefined): unknown {
  if (!validator) {
    return value;
  }

  switch (validator.type) {
    case 'string':
      if (typeof value !== 'string') {
        throw configError('CONFIG_TYPE_INVALID', field, `field '${field}' must be a string`);
      }
      return value;
    case 'integer':
      return coerceInteger(field, value, validator);
    case 'positiveNumber':
      return coercePositiveNumber(field, value, validator);
    case 'boolean':
      return coerceBoolean(field, value);
    case 'url':
      if (typeof value !== 'string') {
        throw configError('CONFIG_TYPE_INVALID', field, `field '${field}' must be a URL string`);
      }
      try {
        new URL(value);
        return value;
      } catch {
        throw configError('CONFIG_TYPE_INVALID', field, `field '${field}' must be a valid URL`);
      }
    case 'enum':
      if (typeof value !== 'string' || !validator.values.includes(value)) {
        throw configError('CONFIG_TYPE_INVALID', field, `field '${field}' must be an allowed enum value`);
      }
      return value;
    case 'custom': {
      const customResult = validator.fn(value);
      if (customResult === true) {
        return value;
      }
      if (typeof customResult === 'string' && customResult.length > 0) {
        throw configError('CONFIG_INVALID', field, customResult);
      }
      throw configError('CONFIG_INVALID', field, `field '${field}' failed custom validation`);
    }
  }
}

function parseInternal(schema: ConfigSchema, config: Record<string, unknown>, applyDefaults: boolean): ParsedConfig {
  const output: Record<string, unknown> = Object.create(null);

  for (const fieldName of Object.keys(schema)) {
    if (UNSAFE_KEYS.has(fieldName)) {
      continue;
    }

    const field = schema[fieldName];
    const present = hasOwn(config, fieldName);

    if (!present) {
      if (field.required === true) {
        throw configError('CONFIG_MISSING', fieldName, `field '${fieldName}' is required`);
      }

      if (applyDefaults && hasOwn(field as Record<string, unknown>, 'default')) {
        output[fieldName] = coerceValue(fieldName, field.default, field.validate);
      }

      continue;
    }

    output[fieldName] = coerceValue(fieldName, config[fieldName], field.validate);
  }

  return Object.freeze(output);
}

export function parseConfig(schema: ConfigSchema, hostConfig: Record<string, unknown>): ParsedConfig {
  return parseInternal(schema, hostConfig, true);
}

export function validateConfig(schema: ConfigSchema, config: Record<string, unknown>): ParsedConfig {
  return parseInternal(schema, config, false);
}
