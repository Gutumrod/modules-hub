/**
 * config-runtime-module / examples/run.ts
 *
 * The single-command example:
 *
 *     npm run example
 *
 * Self-contained by design: no network, no file system writes, no secrets and no
 * environment reads. Every value below is written in this file, because the
 * module never reads env itself — the host injects the raw config and this
 * example plays the host.
 *
 * It exercises the module's real public API through the public entry point:
 *   - defineConfig()          declare the schema, validated at definition time
 *   - parseConfig()           validate + type-coerce + apply defaults + freeze
 *   - redactConfig()          mask secret fields for logging
 *   - createRuntimeContext()  normalize + freeze runtime info
 *   - validateConfig()        re-check an already typed config (no defaults)
 *   - the ConfigError codes it throws
 */

import {
  defineConfig,
  parseConfig,
  validateConfig,
  redactConfig,
  createRuntimeContext,
} from '../core/index.js';
import type { ConfigError } from '../core/index.js';

// ── Host-owned inputs. The module never reads these from the environment. ──
const SCHEMA_DEFINITION = {
  dbUrl: { required: true, validate: { type: 'url' } },
  apiKey: { required: true, secret: true, validate: { type: 'string' } },
  debug: { default: 'false', validate: { type: 'boolean' } },
  maxRetries: { default: '3', validate: { type: 'integer', min: 1, max: 10 } },
  region: { validate: { type: 'string' } },
} as const;

// Raw config exactly as a host would build it from its own env.
const HOST_CONFIG: Record<string, unknown> = {
  dbUrl: 'https://db.example.com/main',
  apiKey: 'host-supplied-secret-value',
  debug: 'true',
  maxRetries: '7',
};

function main(): void {
  const schema = defineConfig(SCHEMA_DEFINITION);

  // 1. Primary entry point: validate → normalize → type-coerce → apply defaults → freeze.
  const config = parseConfig(schema, HOST_CONFIG);

  const typeSummary = [
    `debug=${typeof config.debug}:${String(config.debug)}`,
    `maxRetries=${typeof config.maxRetries}:${String(config.maxRetries)}`,
    `region=${
      Object.prototype.hasOwnProperty.call(config, 'region') ? 'present' : 'omitted'
    }`,
  ].join(' ');

  // 2. The parsed config is frozen (downstream code cannot mutate it).
  const frozen = Object.isFrozen(config);

  // 3. redactConfig() returns a new object where secret fields read [REDACTED].
  const safe = redactConfig(config, schema);
  const redactedField = String(safe.apiKey);
  const publicFieldUnchanged = safe.dbUrl === config.dbUrl;

  // 4. validateConfig() re-checks a typed config without applying defaults.
  const revalidated = validateConfig(schema, config);
  const revalidatedKeys = Object.keys(revalidated).length;

  // 5. createRuntimeContext() fills defaults and freezes the result.
  const runtime = createRuntimeContext({
    environment: 'production',
    runtime: 'cloudflare-workers',
  });
  const runtimeSummary = `environment=${runtime.environment} runtime=${runtime.runtime} region=${runtime.region}`;

  // 6. Real error codes from the module, raised by real calls.
  const codes: string[] = [];

  try {
    parseConfig(schema, { apiKey: 'host-supplied-secret-value' });
  } catch (error) {
    codes.push((error as ConfigError).code);
  }

  try {
    parseConfig(schema, { dbUrl: 'not-a-url', apiKey: 'host-supplied-secret-value' });
  } catch (error) {
    codes.push((error as ConfigError).code);
  }

  try {
    parseConfig(schema, { dbUrl: 'https://db.example.com/main', apiKey: 'x', debug: 'yes' });
  } catch (error) {
    codes.push((error as ConfigError).code);
  }

  try {
    parseConfig(schema, {
      dbUrl: 'https://db.example.com/main',
      apiKey: 'host-supplied-secret-value',
      maxRetries: '99',
    });
  } catch (error) {
    codes.push((error as ConfigError).code);
  }

  try {
    createRuntimeContext({ environment: 42 as unknown as string });
  } catch (error) {
    codes.push((error as ConfigError).code);
  }

  console.log(`parsed keys=${Object.keys(config).length} frozen=${frozen} ${typeSummary}`);
  console.log(
    `redacted apiKey=${redactedField} dbUrlUnchanged=${publicFieldUnchanged} revalidatedKeys=${revalidatedKeys}`
  );
  console.log(`runtime ${runtimeSummary}`);
  console.log(`error codes=${codes.join(',')}`);

  // Exactly one line: the machine-readable result marker.
  console.log(
    `EXAMPLE_RESULT: OK parsedKeys=${Object.keys(config).length} frozen=${frozen} redactedApiKey=${redactedField} errorCodes=${codes.join(
      '|'
    )}`
  );
}

main();
