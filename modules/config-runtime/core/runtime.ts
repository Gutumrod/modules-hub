import type { ConfigError, RuntimeContext } from './types';

function runtimeError(field: string): ConfigError {
  return {
    code: 'RUNTIME_CONTEXT_INVALID',
    field,
    message: field === '' ? 'runtime context must be an object' : `runtime context field '${field}' is invalid`,
  };
}

function assertOptionalString(source: Partial<RuntimeContext>, field: keyof Omit<RuntimeContext, 'metadata'>): void {
  if (
    Object.prototype.hasOwnProperty.call(source, field) &&
    source[field] !== undefined &&
    typeof source[field] !== 'string'
  ) {
    throw runtimeError(field);
  }
}

export function createRuntimeContext(partial: Partial<RuntimeContext>): RuntimeContext {
  if (typeof partial !== 'object' || partial === null || Array.isArray(partial)) {
    throw runtimeError('');
  }

  assertOptionalString(partial, 'environment');
  assertOptionalString(partial, 'runtime');
  assertOptionalString(partial, 'region');
  assertOptionalString(partial, 'requestId');
  assertOptionalString(partial, 'correlationId');

  if (
    Object.prototype.hasOwnProperty.call(partial, 'metadata') &&
    partial.metadata !== undefined &&
    (typeof partial.metadata !== 'object' || partial.metadata === null || Array.isArray(partial.metadata))
  ) {
    throw runtimeError('metadata');
  }

  const metadata = partial.metadata === undefined ? Object.freeze({}) : partial.metadata;

  return Object.freeze({
    environment: partial.environment ?? 'development',
    runtime: partial.runtime ?? 'unknown',
    region: partial.region ?? 'unknown',
    requestId: partial.requestId ?? '',
    correlationId: partial.correlationId ?? '',
    metadata,
  });
}
