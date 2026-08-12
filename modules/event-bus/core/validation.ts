import { EventBusError } from './error.js';
import type { Event, EventHandler, EventHandlerFn } from './types.js';

const EVENT_TYPE_PATTERN = /^[a-zA-Z0-9_\-.]+$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasOwnProperty(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function validateEventType(eventType: unknown): asserts eventType is string {
  if (typeof eventType !== 'string' || eventType.length === 0 || !EVENT_TYPE_PATTERN.test(eventType)) {
    throw new EventBusError({
      message: 'Event type must be a non-empty string matching /^[a-zA-Z0-9_\\-.]+$/.',
      code: 'EVENT_TYPE_INVALID',
      eventType: typeof eventType === 'string' ? eventType : undefined,
    });
  }
}

export function validateEvent(event: unknown): asserts event is Event {
  if (!isRecord(event)) {
    throw new EventBusError({
      message: 'Event must be an object.',
      code: 'EVENT_INVALID',
    });
  }

  validateEventType(event['type']);

  if (typeof event['id'] !== 'string' || event['id'].length === 0) {
    throw new EventBusError({
      message: 'Event id must be a non-empty string.',
      code: 'EVENT_INVALID',
      eventType: event['type'],
    });
  }

  if (!hasOwnProperty(event, 'payload')) {
    throw new EventBusError({
      message: 'Event payload is required.',
      code: 'EVENT_INVALID',
      eventId: event['id'],
      eventType: event['type'],
    });
  }

  if (typeof event['timestamp'] !== 'string' || event['timestamp'].length === 0) {
    throw new EventBusError({
      message: 'Event timestamp must be a non-empty string.',
      code: 'EVENT_INVALID',
      eventId: event['id'],
      eventType: event['type'],
    });
  }

  const metadata = event['metadata'];
  if (metadata !== undefined && !isRecord(metadata)) {
    throw new EventBusError({
      message: 'Event metadata must be an object when provided.',
      code: 'EVENT_INVALID',
      eventId: event['id'],
      eventType: event['type'],
    });
  }
}

export function validateHandler<T = unknown>(
  handler: unknown,
): asserts handler is EventHandler<T> | EventHandlerFn<T> {
  const isFunctionHandler = typeof handler === 'function';
  const isObjectHandler = isRecord(handler) && typeof handler['handle'] === 'function';

  if (!isFunctionHandler && !isObjectHandler) {
    throw new EventBusError({
      message: 'Handler must be a function or an object with a handle method.',
      code: 'SUBSCRIBER_INVALID',
    });
  }

  const subscriberId = (handler as { subscriberId?: unknown }).subscriberId;
  if (subscriberId !== undefined && (typeof subscriberId !== 'string' || subscriberId.length === 0)) {
    throw new EventBusError({
      message: 'Subscriber id must be a non-empty string when provided.',
      code: 'SUBSCRIBER_INVALID',
    });
  }
}

export function validateMaxSubscribersPerType(maxSubscribersPerType: number): void {
  if (!Number.isInteger(maxSubscribersPerType) || maxSubscribersPerType < 1) {
    throw new EventBusError({
      message: 'maxSubscribersPerType must be a positive integer.',
      code: 'SUBSCRIBER_INVALID',
    });
  }
}
