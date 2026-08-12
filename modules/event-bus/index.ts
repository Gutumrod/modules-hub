export { createEventBus } from './core/bus.js';
export { EventBusError } from './core/error.js';
export type { EventBusErrorCode } from './core/error.js';
export type {
  Event,
  EventBus,
  EventBusConfig,
  EventBusHooks,
  EventHandler,
  EventHandlerFn,
  PublishFailure,
  PublishResult,
  UnsubscribeFn,
} from './core/types.js';
