/**
 * modules/config-runtime/integration.example.ts
 * Generic Cloudflare Worker Host Example — reference only when integrating into a real project.
 * Do NOT copy this file wholesale into production.
 *
 * The Config/Runtime module NEVER reads env itself. The Host reads its own env
 * (process.env / env / globalThis) and injects the raw config via the public API.
 */

import {
  defineConfig,
  parseConfig,
  validateConfig,
  redactConfig,
  createRuntimeContext,
} from './core';

// Host declares its OWN env bindings — declared in wrangler.toml + set with `wrangler secret put`
interface Env {
  DB_URL: string;
  API_KEY: string;
  DEBUG?: string;
  REGION?: string;
  MAX_RETRIES?: string;
}

// 1. Declare a schema once at module scope. defineConfig validates the schema shape
//    at definition time and returns an immutable (frozen) ConfigSchema.
const schema = defineConfig({
  dbUrl: { required: true, validate: { type: 'url' } },
  apiKey: { required: true, secret: true, validate: { type: 'string' } },
  debug: { default: 'false', validate: { type: 'boolean' } },
  region: { validate: { type: 'string' } },
  maxRetries: { default: '3', validate: { type: 'integer', min: 1, max: 10 } },
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 2. Host builds the raw config from its OWN env and injects it.
    //    parseConfig validates, coerces types, applies defaults, and returns a frozen object.
    const config = parseConfig(schema, {
      dbUrl: env.DB_URL,
      apiKey: env.API_KEY,
      debug: env.DEBUG,
      region: env.REGION,
      maxRetries: env.MAX_RETRIES,
    });

    // 3. Optional: re-check an already-typed config (e.g. after deserialization).
    //    validateConfig does NOT apply defaults.
    const revalidated = validateConfig(schema, config);

    // 4. Normalize runtime info into a frozen RuntimeContext (defaults filled in).
    const runtime = createRuntimeContext({
      environment: 'production',
      runtime: 'cloudflare-workers',
      requestId: request.headers.get('cf-ray') ?? undefined,
    });

    // 5. For logging / debug / error serialization ONLY — secrets become "[REDACTED]".
    const safe = redactConfig(config, schema);
    console.log('config', safe); // apiKey shows as [REDACTED]
    console.log('runtime', runtime);

    // config.dbUrl, config.apiKey, config.debug, config.region, config.maxRetries are now
    // validated + typed. Use them in your application logic.
    void revalidated;

    return new Response('ok');
  },
};
