import type { ConfigSchema, ParsedConfig, RedactedConfig } from './types';

export function redactConfig(config: ParsedConfig, schema: ConfigSchema): RedactedConfig {
  const output: Record<string, unknown> = Object.create(null);

  for (const fieldName of Object.keys(config)) {
    if (
      fieldName === '__proto__' ||
      fieldName === 'constructor' ||
      fieldName === 'prototype' ||
      !Object.prototype.hasOwnProperty.call(config, fieldName)
    ) {
      continue;
    }

    output[fieldName] = schema[fieldName]?.secret === true ? '[REDACTED]' : config[fieldName];
  }

  return Object.freeze(output);
}
