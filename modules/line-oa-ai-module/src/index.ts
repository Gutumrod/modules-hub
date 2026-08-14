import { LineOaConfig } from './core/types.js';
import { LineOaWebhookHandler, WebhookHandlerOptions } from './handlers/webhook-handler.js';

export * from './core/types.js';
export * from './core/signature.js';
export * from './core/state-manager.js';
export * from './adapters/ai-engine.js';
export * from './adapters/line-client.js';
export * from './handlers/webhook-handler.js';

/**
 * Factory function to create a ready-to-use LINE OA AI Module instance
 */
export function createLineOaModule(
  config: LineOaConfig,
  options?: WebhookHandlerOptions
): LineOaWebhookHandler {
  return new LineOaWebhookHandler(config, options);
}
