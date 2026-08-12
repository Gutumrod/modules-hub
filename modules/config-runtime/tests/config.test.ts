/**
 * config-runtime-module / tests/config.test.ts
 * Run with: npm test (vitest)
 */

import { describe, it, expect } from 'vitest';
import {
  defineConfig,
  parseConfig,
  validateConfig,
  redactConfig,
  createRuntimeContext,
} from '../core';
import type { ConfigError, ConfigSchema } from '../core';

// ──────────────────────────────────────────────
// Helper: catch a thrown ConfigError (plain object, not an Error instance)
// ──────────────────────────────────────────────
function catchErr(fn: () => void): ConfigError {
  try {
    fn();
  } catch (e) {
    return e as ConfigError;
  }
  throw new Error('Expected fn to throw, but it did not');
}

// ══════════════════════════════════════════════
// defineConfig / schema
// ══════════════════════════════════════════════
describe('defineConfig', () => {
  it('returns a frozen schema', () => {
    const schema = defineConfig({
      port: { required: true, validate: { type: 'integer' } },
    });
    expect(Object.isFrozen(schema)).toBe(true);
    expect(Object.isFrozen(schema.port)).toBe(true);
  });

  it('rejects required + default on the same field -> CONFIG_INVALID', () => {
    const err = catchErr(() =>
      defineConfig({
        port: { required: true, default: 3000, validate: { type: 'integer' } },
      }),
    );
    expect(err.code).toBe('CONFIG_INVALID');
    expect(err.field).toBe('port');
  });

  it('rejects unknown validator type -> CONFIG_INVALID', () => {
    const err = catchErr(() =>
      defineConfig({
        foo: { validate: { type: 'unknown-type' } as unknown as never },
      }),
    );
    expect(err.code).toBe('CONFIG_INVALID');
    expect(err.field).toBe('foo');
  });

  it('accepts a field with no validate (loose passthrough)', () => {
    const schema = defineConfig({ anything: {} });
    expect(schema.anything).toBeDefined();
  });
});

// ══════════════════════════════════════════════
// parseConfig — required & defaults
// ══════════════════════════════════════════════
describe('parseConfig — required & defaults', () => {
  it('required field present -> ok', () => {
    const schema = defineConfig({
      apiKey: { required: true, validate: { type: 'string' } },
    });
    const result = parseConfig(schema, { apiKey: 'abc123' });
    expect(result.apiKey).toBe('abc123');
  });

  it('missing required field -> CONFIG_MISSING', () => {
    const schema = defineConfig({
      apiKey: { required: true, validate: { type: 'string' } },
    });
    const err = catchErr(() => parseConfig(schema, {}));
    expect(err.code).toBe('CONFIG_MISSING');
    expect(err.field).toBe('apiKey');
  });

  it('default value applied when optional field is absent', () => {
    const schema = defineConfig({
      port: { default: 3000, validate: { type: 'integer' } },
    });
    const result = parseConfig(schema, {});
    expect(result.port).toBe(3000);
  });

  it('default string "false" for boolean field -> coerced to false', () => {
    const schema = defineConfig({
      debug: { default: 'false', validate: { type: 'boolean' } },
    });
    const result = parseConfig(schema, {});
    expect(result.debug).toBe(false);
  });

  it('explicit value overrides default', () => {
    const schema = defineConfig({
      port: { default: 3000, validate: { type: 'integer' } },
    });
    const result = parseConfig(schema, { port: '8080' });
    expect(result.port).toBe(8080);
  });

  it('optional field with no default and absent -> omitted from output', () => {
    const schema = defineConfig({
      region: { validate: { type: 'string' } },
    });
    const result = parseConfig(schema, {});
    expect(Object.keys(result)).not.toContain('region');
    expect((result as Record<string, unknown>)['region']).toBeUndefined();
  });
});

// ══════════════════════════════════════════════
// parseConfig — boolean coercion (strict)
// ══════════════════════════════════════════════
describe('parseConfig — boolean coercion', () => {
  const schema = defineConfig({
    flag: { required: true, validate: { type: 'boolean' } },
  });

  it('"true" -> true', () => {
    expect(parseConfig(schema, { flag: 'true' }).flag).toBe(true);
  });

  it('"false" -> false', () => {
    expect(parseConfig(schema, { flag: 'false' }).flag).toBe(false);
  });

  it('true (boolean) -> true', () => {
    expect(parseConfig(schema, { flag: true }).flag).toBe(true);
  });

  it('false (boolean) -> false', () => {
    expect(parseConfig(schema, { flag: false }).flag).toBe(false);
  });

  it('"false" must NOT become true', () => {
    expect(parseConfig(schema, { flag: 'false' }).flag).not.toBe(true);
  });

  it('"yes" -> CONFIG_TYPE_INVALID', () => {
    const err = catchErr(() => parseConfig(schema, { flag: 'yes' }));
    expect(err.code).toBe('CONFIG_TYPE_INVALID');
    expect(err.field).toBe('flag');
  });

  it('"1" -> CONFIG_TYPE_INVALID', () => {
    const err = catchErr(() => parseConfig(schema, { flag: '1' }));
    expect(err.code).toBe('CONFIG_TYPE_INVALID');
  });

  it('"0" -> CONFIG_TYPE_INVALID', () => {
    const err = catchErr(() => parseConfig(schema, { flag: '0' }));
    expect(err.code).toBe('CONFIG_TYPE_INVALID');
  });

  it('"on" -> CONFIG_TYPE_INVALID', () => {
    const err = catchErr(() => parseConfig(schema, { flag: 'on' }));
    expect(err.code).toBe('CONFIG_TYPE_INVALID');
  });

  it('"off" -> CONFIG_TYPE_INVALID', () => {
    const err = catchErr(() => parseConfig(schema, { flag: 'off' }));
    expect(err.code).toBe('CONFIG_TYPE_INVALID');
  });

  it('number 1 -> CONFIG_TYPE_INVALID', () => {
    const err = catchErr(() => parseConfig(schema, { flag: 1 }));
    expect(err.code).toBe('CONFIG_TYPE_INVALID');
  });
});

// ══════════════════════════════════════════════
// parseConfig — integer coercion
// ══════════════════════════════════════════════
describe('parseConfig — integer coercion', () => {
  const schema = defineConfig({
    port: { required: true, validate: { type: 'integer' } },
  });

  it('"42" -> 42', () => {
    expect(parseConfig(schema, { port: '42' }).port).toBe(42);
  });

  it('42 (number) -> 42', () => {
    expect(parseConfig(schema, { port: 42 }).port).toBe(42);
  });

  it('negative integer string -> ok', () => {
    expect(parseConfig(schema, { port: '-7' }).port).toBe(-7);
  });

  it('"4.5" -> CONFIG_TYPE_INVALID', () => {
    const err = catchErr(() => parseConfig(schema, { port: '4.5' }));
    expect(err.code).toBe('CONFIG_TYPE_INVALID');
    expect(err.field).toBe('port');
  });

  it('4.5 (number) -> CONFIG_TYPE_INVALID', () => {
    const err = catchErr(() => parseConfig(schema, { port: 4.5 }));
    expect(err.code).toBe('CONFIG_TYPE_INVALID');
  });

  it('NaN -> CONFIG_TYPE_INVALID', () => {
    const err = catchErr(() => parseConfig(schema, { port: NaN }));
    expect(err.code).toBe('CONFIG_TYPE_INVALID');
  });

  it('Infinity -> CONFIG_TYPE_INVALID', () => {
    const err = catchErr(() => parseConfig(schema, { port: Infinity }));
    expect(err.code).toBe('CONFIG_TYPE_INVALID');
  });

  it('-Infinity -> CONFIG_TYPE_INVALID', () => {
    const err = catchErr(() => parseConfig(schema, { port: -Infinity }));
    expect(err.code).toBe('CONFIG_TYPE_INVALID');
  });

  it('"NaN" string -> CONFIG_TYPE_INVALID', () => {
    const err = catchErr(() => parseConfig(schema, { port: 'NaN' }));
    expect(err.code).toBe('CONFIG_TYPE_INVALID');
  });

  it('non-numeric string -> CONFIG_TYPE_INVALID', () => {
    const err = catchErr(() => parseConfig(schema, { port: 'abc' }));
    expect(err.code).toBe('CONFIG_TYPE_INVALID');
  });

  it('boolean -> CONFIG_TYPE_INVALID', () => {
    const err = catchErr(() => parseConfig(schema, { port: true }));
    expect(err.code).toBe('CONFIG_TYPE_INVALID');
  });

  it('range: value below min -> CONFIG_VALUE_OUT_OF_RANGE', () => {
    const s = defineConfig({
      port: { required: true, validate: { type: 'integer', min: 1024 } },
    });
    const err = catchErr(() => parseConfig(s, { port: '80' }));
    expect(err.code).toBe('CONFIG_VALUE_OUT_OF_RANGE');
    expect(err.field).toBe('port');
  });

  it('range: value above max -> CONFIG_VALUE_OUT_OF_RANGE', () => {
    const s = defineConfig({
      port: { required: true, validate: { type: 'integer', max: 65535 } },
    });
    const err = catchErr(() => parseConfig(s, { port: 70000 }));
    expect(err.code).toBe('CONFIG_VALUE_OUT_OF_RANGE');
  });

  it('range: value at min boundary -> ok', () => {
    const s = defineConfig({
      port: { required: true, validate: { type: 'integer', min: 0, max: 100 } },
    });
    expect(parseConfig(s, { port: 0 }).port).toBe(0);
  });

  it('range: value at max boundary -> ok', () => {
    const s = defineConfig({
      port: { required: true, validate: { type: 'integer', min: 0, max: 100 } },
    });
    expect(parseConfig(s, { port: 100 }).port).toBe(100);
  });
});

// ══════════════════════════════════════════════
// parseConfig — positiveNumber
// ══════════════════════════════════════════════
describe('parseConfig — positiveNumber', () => {
  const schema = defineConfig({
    timeout: { required: true, validate: { type: 'positiveNumber' } },
  });

  it('"3.5" -> 3.5', () => {
    expect(parseConfig(schema, { timeout: '3.5' }).timeout).toBe(3.5);
  });

  it('1 -> 1', () => {
    expect(parseConfig(schema, { timeout: 1 }).timeout).toBe(1);
  });

  it('0 -> CONFIG_TYPE_INVALID', () => {
    const err = catchErr(() => parseConfig(schema, { timeout: 0 }));
    expect(err.code).toBe('CONFIG_TYPE_INVALID');
    expect(err.field).toBe('timeout');
  });

  it('-5 -> CONFIG_TYPE_INVALID', () => {
    const err = catchErr(() => parseConfig(schema, { timeout: -5 }));
    expect(err.code).toBe('CONFIG_TYPE_INVALID');
  });

  it('NaN -> CONFIG_TYPE_INVALID', () => {
    const err = catchErr(() => parseConfig(schema, { timeout: NaN }));
    expect(err.code).toBe('CONFIG_TYPE_INVALID');
  });

  it('Infinity -> CONFIG_TYPE_INVALID', () => {
    const err = catchErr(() => parseConfig(schema, { timeout: Infinity }));
    expect(err.code).toBe('CONFIG_TYPE_INVALID');
  });

  it('range: value below min -> CONFIG_VALUE_OUT_OF_RANGE', () => {
    const s = defineConfig({
      timeout: { required: true, validate: { type: 'positiveNumber', min: 10 } },
    });
    const err = catchErr(() => parseConfig(s, { timeout: 5 }));
    expect(err.code).toBe('CONFIG_VALUE_OUT_OF_RANGE');
  });
});

// ══════════════════════════════════════════════
// parseConfig — url
// ══════════════════════════════════════════════
describe('parseConfig — url', () => {
  const schema = defineConfig({
    endpoint: { required: true, validate: { type: 'url' } },
  });

  it('valid HTTPS URL -> ok', () => {
    expect(parseConfig(schema, { endpoint: 'https://example.com/api' }).endpoint).toBe(
      'https://example.com/api',
    );
  });

  it('valid HTTP URL -> ok', () => {
    expect(parseConfig(schema, { endpoint: 'http://localhost:3000' }).endpoint).toBe(
      'http://localhost:3000',
    );
  });

  it('invalid URL string -> CONFIG_TYPE_INVALID', () => {
    const err = catchErr(() => parseConfig(schema, { endpoint: 'not-a-url' }));
    expect(err.code).toBe('CONFIG_TYPE_INVALID');
    expect(err.field).toBe('endpoint');
  });

  it('non-string -> CONFIG_TYPE_INVALID', () => {
    const err = catchErr(() => parseConfig(schema, { endpoint: 42 }));
    expect(err.code).toBe('CONFIG_TYPE_INVALID');
  });
});

// ══════════════════════════════════════════════
// parseConfig — enum
// ══════════════════════════════════════════════
describe('parseConfig — enum', () => {
  const schema = defineConfig({
    level: { required: true, validate: { type: 'enum', values: ['debug', 'info', 'warn', 'error'] } },
  });

  it('value in values -> ok', () => {
    expect(parseConfig(schema, { level: 'info' }).level).toBe('info');
  });

  it('value not in values -> CONFIG_TYPE_INVALID', () => {
    const err = catchErr(() => parseConfig(schema, { level: 'trace' }));
    expect(err.code).toBe('CONFIG_TYPE_INVALID');
    expect(err.field).toBe('level');
  });

  it('non-string -> CONFIG_TYPE_INVALID', () => {
    const err = catchErr(() => parseConfig(schema, { level: 42 }));
    expect(err.code).toBe('CONFIG_TYPE_INVALID');
  });
});

// ══════════════════════════════════════════════
// parseConfig — custom validator
// ══════════════════════════════════════════════
describe('parseConfig — custom validator', () => {
  it('fn returns true -> value accepted', () => {
    const schema = defineConfig({
      custom: { required: true, validate: { type: 'custom', fn: () => true } },
    });
    expect(parseConfig(schema, { custom: 'anything' }).custom).toBe('anything');
  });

  it('fn returns false -> CONFIG_INVALID with generic message', () => {
    const schema = defineConfig({
      custom: { required: true, validate: { type: 'custom', fn: () => false } },
    });
    const err = catchErr(() => parseConfig(schema, { custom: 'bad' }));
    expect(err.code).toBe('CONFIG_INVALID');
    expect(err.field).toBe('custom');
    expect(err.message).not.toContain('bad');
  });

  it('fn returns string message -> CONFIG_INVALID with that message', () => {
    const schema = defineConfig({
      custom: { required: true, validate: { type: 'custom', fn: () => 'must be a palindrome' } },
    });
    const err = catchErr(() => parseConfig(schema, { custom: 'hello' }));
    expect(err.code).toBe('CONFIG_INVALID');
    expect(err.message).toBe('must be a palindrome');
  });

  it('fn returns empty string -> CONFIG_INVALID with generic message', () => {
    const schema = defineConfig({
      custom: { required: true, validate: { type: 'custom', fn: () => '' } },
    });
    const err = catchErr(() => parseConfig(schema, { custom: 'x' }));
    expect(err.code).toBe('CONFIG_INVALID');
  });
});

// ══════════════════════════════════════════════
// validateConfig — does NOT apply defaults
// ══════════════════════════════════════════════
describe('validateConfig', () => {
  it('does NOT apply defaults (absent optional field stays absent)', () => {
    const schema = defineConfig({
      port: { default: 3000, validate: { type: 'integer' } },
    });
    const result = validateConfig(schema, {});
    expect(Object.keys(result)).not.toContain('port');
  });

  it('validates and coerces provided values', () => {
    const schema = defineConfig({
      port: { validate: { type: 'integer' } },
    });
    const result = validateConfig(schema, { port: '42' });
    expect(result.port).toBe(42);
  });

  it('throws CONFIG_MISSING for absent required field', () => {
    const schema = defineConfig({
      apiKey: { required: true, validate: { type: 'string' } },
    });
    const err = catchErr(() => validateConfig(schema, {}));
    expect(err.code).toBe('CONFIG_MISSING');
  });

  it('returns a frozen object', () => {
    const schema = defineConfig({
      port: { validate: { type: 'integer' } },
    });
    const result = validateConfig(schema, { port: 42 });
    expect(Object.isFrozen(result)).toBe(true);
  });
});

// ══════════════════════════════════════════════
// redactConfig
// ══════════════════════════════════════════════
describe('redactConfig', () => {
  it('secret field -> [REDACTED]', () => {
    const schema = defineConfig({
      apiKey: { required: true, secret: true, validate: { type: 'string' } },
      port: { required: true, validate: { type: 'integer' } },
    });
    const config = parseConfig(schema, { apiKey: 'super-secret', port: 3000 });
    const redacted = redactConfig(config, schema);
    expect(redacted.apiKey).toBe('[REDACTED]');
    expect(redacted.port).toBe(3000);
  });

  it('non-secret fields unchanged', () => {
    const schema = defineConfig({
      name: { required: true, validate: { type: 'string' } },
    });
    const config = parseConfig(schema, { name: 'my-service' });
    const redacted = redactConfig(config, schema);
    expect(redacted.name).toBe('my-service');
  });

  it('output is a new object (not the same reference)', () => {
    const schema = defineConfig({
      name: { required: true, validate: { type: 'string' } },
    });
    const config = parseConfig(schema, { name: 'svc' });
    const redacted = redactConfig(config, schema);
    expect(redacted).not.toBe(config);
  });

  it('input config is not mutated', () => {
    const schema = defineConfig({
      apiKey: { required: true, secret: true, validate: { type: 'string' } },
      name: { required: true, validate: { type: 'string' } },
    });
    const config = parseConfig(schema, { apiKey: 'secret-val', name: 'svc' });
    const snapshot = { ...config };
    redactConfig(config, schema);
    expect({ ...config }).toEqual(snapshot);
    expect(config.apiKey).toBe('secret-val');
  });

  it('output is frozen', () => {
    const schema = defineConfig({
      apiKey: { required: true, secret: true, validate: { type: 'string' } },
    });
    const config = parseConfig(schema, { apiKey: 's' });
    const redacted = redactConfig(config, schema);
    expect(Object.isFrozen(redacted)).toBe(true);
  });

  it('nested object in non-secret field is copied by reference (no deep redaction)', () => {
    const schema = defineConfig({
      data: {},
      apiKey: { required: true, secret: true, validate: { type: 'string' } },
    });
    const nested = { inner: 'value', secretThing: 'leaked?' };
    const config = parseConfig(schema, { data: nested, apiKey: 'top-secret' });
    const redacted = redactConfig(config, schema);
    // Top-level secret is redacted
    expect(redacted.apiKey).toBe('[REDACTED]');
    // Non-secret nested object is copied by reference — no deep redaction
    expect(redacted.data).toBe(nested);
    expect((redacted.data as Record<string, unknown>).secretThing).toBe('leaked?');
  });
});

// ══════════════════════════════════════════════
// createRuntimeContext
// ══════════════════════════════════════════════
describe('createRuntimeContext', () => {
  it('applies defaults for all missing fields', () => {
    const ctx = createRuntimeContext({});
    expect(ctx.environment).toBe('development');
    expect(ctx.runtime).toBe('unknown');
    expect(ctx.region).toBe('unknown');
    expect(ctx.requestId).toBe('');
    expect(ctx.correlationId).toBe('');
    expect(ctx.metadata).toEqual({});
  });

  it('preserves provided values', () => {
    const ctx = createRuntimeContext({
      environment: 'production',
      runtime: 'cloudflare-workers',
      region: 'asia',
      requestId: 'req-123',
      correlationId: 'corr-456',
      metadata: { foo: 'bar' },
    });
    expect(ctx.environment).toBe('production');
    expect(ctx.runtime).toBe('cloudflare-workers');
    expect(ctx.region).toBe('asia');
    expect(ctx.requestId).toBe('req-123');
    expect(ctx.correlationId).toBe('corr-456');
    expect(ctx.metadata).toEqual({ foo: 'bar' });
  });

  it('wrong-typed environment -> RUNTIME_CONTEXT_INVALID', () => {
    const err = catchErr(() =>
      createRuntimeContext({ environment: 42 } as unknown as Record<string, unknown>),
    );
    expect(err.code).toBe('RUNTIME_CONTEXT_INVALID');
    expect(err.field).toBe('environment');
  });

  it('wrong-typed runtime -> RUNTIME_CONTEXT_INVALID', () => {
    const err = catchErr(() =>
      createRuntimeContext({ runtime: false } as unknown as Record<string, unknown>),
    );
    expect(err.code).toBe('RUNTIME_CONTEXT_INVALID');
    expect(err.field).toBe('runtime');
  });

  it('wrong-typed metadata (string) -> RUNTIME_CONTEXT_INVALID', () => {
    const err = catchErr(() =>
      createRuntimeContext({ metadata: 'not-an-object' } as unknown as Record<string, unknown>),
    );
    expect(err.code).toBe('RUNTIME_CONTEXT_INVALID');
    expect(err.field).toBe('metadata');
  });

  it('wrong-typed metadata (array) -> RUNTIME_CONTEXT_INVALID', () => {
    const err = catchErr(() =>
      createRuntimeContext({ metadata: [] } as unknown as Record<string, unknown>),
    );
    expect(err.code).toBe('RUNTIME_CONTEXT_INVALID');
    expect(err.field).toBe('metadata');
  });

  it('null input -> RUNTIME_CONTEXT_INVALID', () => {
    const err = catchErr(() =>
      createRuntimeContext(null as unknown as Record<string, unknown>),
    );
    expect(err.code).toBe('RUNTIME_CONTEXT_INVALID');
  });

  it('output is frozen', () => {
    const ctx = createRuntimeContext({});
    expect(Object.isFrozen(ctx)).toBe(true);
  });

  it('runtime accepts arbitrary strings (no hard-coded enum)', () => {
    for (const rt of ['cloudflare-workers', 'node', 'bun', 'deno', 'custom-runtime-xyz']) {
      const ctx = createRuntimeContext({ runtime: rt });
      expect(ctx.runtime).toBe(rt);
    }
  });

  it('undefined fields are treated as absent (defaults applied)', () => {
    const ctx = createRuntimeContext({ environment: undefined, runtime: undefined });
    expect(ctx.environment).toBe('development');
    expect(ctx.runtime).toBe('unknown');
  });
});

// ══════════════════════════════════════════════
// Input not mutated
// ══════════════════════════════════════════════
describe('Input not mutated', () => {
  it('parseConfig does not mutate hostConfig', () => {
    const schema = defineConfig({
      port: { required: true, validate: { type: 'integer' } },
      debug: { default: 'false', validate: { type: 'boolean' } },
    });
    const input = { port: '3000' };
    const snapshot = { ...input };
    parseConfig(schema, input);
    expect({ ...input }).toEqual(snapshot);
    expect(input.port).toBe('3000');
  });

  it('validateConfig does not mutate input', () => {
    const schema = defineConfig({
      port: { required: true, validate: { type: 'integer' } },
    });
    const input = { port: '3000' };
    const snapshot = { ...input };
    validateConfig(schema, input);
    expect({ ...input }).toEqual(snapshot);
    expect(input.port).toBe('3000');
  });

  it('redactConfig does not mutate input', () => {
    const schema = defineConfig({
      apiKey: { required: true, secret: true, validate: { type: 'string' } },
    });
    const config = parseConfig(schema, { apiKey: 'secret-val' });
    // Make a mutable copy to test against (ParsedConfig is frozen, but test anyway)
    const mutableConfig: Record<string, unknown> = { apiKey: 'secret-val', port: 3000 };
    const snapshot = { ...mutableConfig };
    redactConfig(mutableConfig as unknown as ConfigSchema, schema);
    expect({ ...mutableConfig }).toEqual(snapshot);
  });
});

// ══════════════════════════════════════════════
// Frozen output
// ══════════════════════════════════════════════
describe('Frozen output', () => {
  it('parseConfig output is frozen', () => {
    const schema = defineConfig({
      port: { required: true, validate: { type: 'integer' } },
    });
    const result = parseConfig(schema, { port: 3000 });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('validateConfig output is frozen', () => {
    const schema = defineConfig({
      port: { required: true, validate: { type: 'integer' } },
    });
    const result = validateConfig(schema, { port: 3000 });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('redactConfig output is frozen', () => {
    const schema = defineConfig({
      apiKey: { required: true, secret: true, validate: { type: 'string' } },
    });
    const config = parseConfig(schema, { apiKey: 's' });
    const redacted = redactConfig(config, schema);
    expect(Object.isFrozen(redacted)).toBe(true);
  });

  it('createRuntimeContext output is frozen', () => {
    const ctx = createRuntimeContext({});
    expect(Object.isFrozen(ctx)).toBe(true);
  });
});

// ══════════════════════════════════════════════
// Prototype pollution prevention
// ══════════════════════════════════════════════
describe('Prototype pollution prevention', () => {
  it('__proto__ in hostConfig does not pollute Object.prototype', () => {
    const schema = defineConfig({
      port: { required: true, validate: { type: 'integer' } },
    });
    // JSON.parse creates a real own property named "__proto__"
    const malicious = JSON.parse('{"port": 3000, "__proto__": {"polluted": true}}');
    parseConfig(schema, malicious);
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('constructor in hostConfig does not pollute Object.prototype', () => {
    const schema = defineConfig({
      port: { required: true, validate: { type: 'integer' } },
    });
    const malicious = JSON.parse('{"port": 3000, "constructor": {"prototype": {"polluted": true}}}');
    parseConfig(schema, malicious);
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('parsed output has no __proto__ own key', () => {
    const schema = defineConfig({
      port: { required: true, validate: { type: 'integer' } },
    });
    const malicious = JSON.parse('{"port": 3000, "__proto__": {"polluted": true}}');
    const result = parseConfig(schema, malicious);
    expect(Object.keys(result)).not.toContain('__proto__');
    expect(Object.keys(result)).not.toContain('constructor');
    expect(Object.keys(result)).not.toContain('prototype');
  });

  it('parsed output is null-prototype (no inherited properties)', () => {
    const schema = defineConfig({
      port: { required: true, validate: { type: 'integer' } },
    });
    const result = parseConfig(schema, { port: 3000 });
    // Object.create(null) -> getPrototypeOf is null
    expect(Object.getPrototypeOf(result)).toBeNull();
  });
});

// ══════════════════════════════════════════════
// Safe error serialization (no secret leakage)
// ══════════════════════════════════════════════
describe('Safe error serialization', () => {
  it('error from failed secret field validation does not leak secret value', () => {
    const schema = defineConfig({
      apiKey: { required: true, secret: true, validate: { type: 'url' } },
    });
    const secretValue = 'my-super-secret-api-key-12345';
    const err = catchErr(() => parseConfig(schema, { apiKey: secretValue }));
    const serialized = JSON.stringify(err);
    expect(serialized).not.toContain(secretValue);
    expect(err.code).toBe('CONFIG_TYPE_INVALID');
    expect(err.field).toBe('apiKey');
  });

  it('error from missing required secret references field name, not value', () => {
    const schema = defineConfig({
      apiKey: { required: true, secret: true, validate: { type: 'string' } },
    });
    const err = catchErr(() => parseConfig(schema, {}));
    const serialized = JSON.stringify(err);
    expect(err.code).toBe('CONFIG_MISSING');
    // message references the field name (design §6.2: "the message must reference the field name only")
    expect(err.field).toBe('apiKey');
    expect(err.message).toContain('apiKey');
    // the secret VALUE must never appear — for a missing field there is no value,
    // and the error structure must not carry any raw config value
    expect(err).not.toHaveProperty('value');
    expect(Object.keys(err).sort()).toEqual(['code', 'field', 'message']);
    // serializable and no extra fields leak
    expect(JSON.parse(serialized)).toEqual(err);
  });

  it('custom validator error message from user fn is included (user responsibility)', () => {
    const schema = defineConfig({
      apiKey: { required: true, secret: true, validate: { type: 'custom', fn: () => 'invalid key' } },
    });
    const secretValue = 'leaked-secret';
    const err = catchErr(() => parseConfig(schema, { apiKey: secretValue }));
    // The module passes the user's message through; it's the user's responsibility
    // not to include the secret in their custom message. The module itself doesn't add it.
    expect(err.message).toBe('invalid key');
    // The module's own error structure doesn't include the raw value
    expect(JSON.stringify(err)).not.toContain(secretValue);
  });
});