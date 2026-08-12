import { EventBusError } from './error.js';
import { SubscriberRegistry, getSubscriberId } from './registry.js';
import { hasOwnKey, sanitizeEvent } from './security.js';
import type {
  Event,
  EventBus,
  EventBusConfig,
  EventHandler,
  EventHandlerFn,
  PublishFailure,
  PublishResult,
  UnsubscribeFn,
} from './types.js';
import { isRecord, validateEvent, validateEventType, validateHandler, validateMaxSubscribersPerType } from './validation.js';

const DEFAULT_MAX_SUBSCRIBERS_PER_TYPE = 100;

type ResolvedEventBusConfig = {
  readonly idGenerator: () => string;
  readonly timestampProvider: () => string;
  readonly maxSubscribersPerType: number;
  readonly hooks?: EventBusConfig['hooks'];
  readonly onErrorSink?: EventBusConfig['onErrorSink'];
};

class InProcessEventBus implements EventBus {
  private readonly registry = new SubscriberRegistry();
  private readonly config: ResolvedEventBusConfig;

  public constructor(config: EventBusConfig = {}) {
    const maxSubscribersPerType = config.maxSubscribersPerType ?? DEFAULT_MAX_SUBSCRIBERS_PER_TYPE;
    validateMaxSubscribersPerType(maxSubscribersPerType);

    this.config = {
      idGenerator: config.idGenerator ?? (() => crypto.randomUUID()),
      timestampProvider: config.timestampProvider ?? (() => new Date().toISOString()),
      maxSubscribersPerType,
      hooks: config.hooks,
      onErrorSink: config.onErrorSink,
    };
  }

  public async publish<T = unknown>(event: Event<T>): Promise<PublishResult> {
    const preparedEvent = this.prepareEvent(event);
    validateEvent(preparedEvent);
    this.notifyPublish(preparedEvent);

    const subscribers = this.registry.get(preparedEvent.type);
    let delivered = 0;
    const failures: PublishFailure[] = [];

    for (const subscriber of subscribers) {
      try {
        await subscriber.invoke(preparedEvent);
        delivered += 1;
      } catch (cause) {
        const error = new EventBusError({
          message: 'Event handler failed.',
          code: 'HANDLER_FAILED',
          eventId: preparedEvent.id,
          eventType: preparedEvent.type,
          subscriberId: subscriber.subscriberId,
          cause,
        });
        failures.push({ subscriberId: subscriber.subscriberId, error });
        this.notifyError(error, preparedEvent, subscriber.subscriberId);
      }
    }

    const result: PublishResult = {
      delivered,
      failed: failures.length,
    };

    if (failures.length > 0) {
      result.failures = failures;
    }

    return result;
  }

  public subscribe<T = unknown>(eventType: string, handler: EventHandler<T> | EventHandlerFn<T>): UnsubscribeFn {
    validateEventType(eventType);
    validateHandler(handler);

    const before = this.registry.get(eventType);
    const unsubscribe = this.registry.add(
      eventType,
      handler as EventHandler | EventHandlerFn,
      this.config.maxSubscribersPerType,
    );
    const after = this.registry.get(eventType);

    if (after.length > before.length) {
      this.notifySubscribe(eventType, getSubscriberId(handler as EventHandler | EventHandlerFn));
    }

    return unsubscribe;
  }

  public unsubscribe(eventType: string, subscriberIdOrHandler: string | EventHandler | EventHandlerFn): boolean {
    validateEventType(eventType);

    if (typeof subscriberIdOrHandler !== 'string') {
      validateHandler(subscriberIdOrHandler);
    }

    const subscriberId =
      typeof subscriberIdOrHandler === 'string'
        ? subscriberIdOrHandler
        : getSubscriberId(subscriberIdOrHandler as EventHandler | EventHandlerFn);
    const removed = this.registry.remove(eventType, subscriberIdOrHandler);

    if (removed) {
      this.notifyUnsubscribe(eventType, subscriberId);
    }

    return removed;
  }

  private prepareEvent<T>(event: Event<T>): Event<T> {
    if (!isRecord(event)) {
      throw new EventBusError({
        message: 'Event must be an object.',
        code: 'EVENT_INVALID',
      });
    }

    try {
      const id = hasOwnKey(event, 'id') || event['id'] !== undefined ? undefined : this.config.idGenerator();
      const timestamp =
        hasOwnKey(event, 'timestamp') || event['timestamp'] !== undefined
          ? undefined
          : this.config.timestampProvider();

      return sanitizeEvent<T>(event, { id, timestamp });
    } catch (cause) {
      throw new EventBusError({
        message: 'Failed to prepare event for publishing.',
        code: 'PUBLISH_FAILED',
        eventType: typeof event['type'] === 'string' ? event['type'] : undefined,
        cause,
      });
    }
  }

  private notifyError(error: EventBusError, event: Event, subscriberId?: string): void {
    const context = { event, subscriberId };

    try {
      this.config.hooks?.onError?.(error, context);
    } catch {
      return;
    }

    try {
      this.config.onErrorSink?.(error, context);
    } catch {
      return;
    }
  }

  private notifyPublish(event: Event): void {
    try {
      this.config.hooks?.onPublish?.(event);
    } catch {
      return;
    }
  }

  private notifySubscribe(eventType: string, subscriberId?: string): void {
    try {
      this.config.hooks?.onSubscribe?.(eventType, subscriberId);
    } catch {
      return;
    }
  }

  private notifyUnsubscribe(eventType: string, subscriberId?: string): void {
    try {
      this.config.hooks?.onUnsubscribe?.(eventType, subscriberId);
    } catch {
      return;
    }
  }
}

export function createEventBus(config: EventBusConfig = {}): EventBus {
  return new InProcessEventBus(config);
}
