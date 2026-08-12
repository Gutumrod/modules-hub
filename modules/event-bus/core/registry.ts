import { EventBusError } from './error.js';
import type { Event, EventHandler, EventHandlerFn, UnsubscribeFn } from './types.js';
import { validateHandler } from './validation.js';

export type SubscriberRecord = {
  readonly handler: EventHandler | EventHandlerFn;
  readonly subscriberId?: string;
  readonly unsubscribe: UnsubscribeFn;
  invoke(event: Event): Promise<void> | void;
};

export class SubscriberRegistry {
  private readonly subscribersByType = new Map<string, SubscriberRecord[]>();

  public get(eventType: string): SubscriberRecord[] {
    return [...(this.subscribersByType.get(eventType) ?? [])];
  }

  public add(eventType: string, handler: EventHandler | EventHandlerFn, maxSubscribersPerType: number): UnsubscribeFn {
    validateHandler(handler);

    const subscribers = this.subscribersByType.get(eventType) ?? [];
    const subscriberId = getSubscriberId(handler);
    const duplicate = subscribers.find((subscriber) => isDuplicateSubscriber(subscriber, handler, subscriberId));

    if (duplicate !== undefined) {
      return duplicate.unsubscribe;
    }

    if (subscribers.length >= maxSubscribersPerType) {
      throwSubscriberLimitError(eventType);
    }

    const unsubscribe = (): boolean => this.remove(eventType, handler);
    const subscriber: SubscriberRecord = {
      handler,
      subscriberId,
      unsubscribe,
      invoke: (event: Event): Promise<void> | void => invokeHandler(handler, event),
    };

    this.subscribersByType.set(eventType, [...subscribers, subscriber]);
    return unsubscribe;
  }

  public remove(eventType: string, subscriberIdOrHandler: string | EventHandler | EventHandlerFn): boolean {
    const subscribers = this.subscribersByType.get(eventType);
    if (subscribers === undefined) {
      return false;
    }

    const nextSubscribers = subscribers.filter(
      (subscriber) => !matchesSubscriber(subscriber, subscriberIdOrHandler),
    );

    if (nextSubscribers.length === subscribers.length) {
      return false;
    }

    if (nextSubscribers.length === 0) {
      this.subscribersByType.delete(eventType);
    } else {
      this.subscribersByType.set(eventType, nextSubscribers);
    }

    return true;
  }
}

export function getSubscriberId(handler: EventHandler | EventHandlerFn): string | undefined {
  return (handler as { subscriberId?: string }).subscriberId;
}

function isDuplicateSubscriber(
  subscriber: SubscriberRecord,
  handler: EventHandler | EventHandlerFn,
  subscriberId?: string,
): boolean {
  return subscriber.handler === handler || (subscriberId !== undefined && subscriber.subscriberId === subscriberId);
}

function matchesSubscriber(
  subscriber: SubscriberRecord,
  subscriberIdOrHandler: string | EventHandler | EventHandlerFn,
): boolean {
  if (typeof subscriberIdOrHandler === 'string') {
    return subscriber.subscriberId === subscriberIdOrHandler;
  }

  return subscriber.handler === subscriberIdOrHandler;
}

function invokeHandler(handler: EventHandler | EventHandlerFn, event: Event): Promise<void> | void {
  if (typeof handler === 'function') {
    return handler(event);
  }

  return handler.handle(event);
}

function throwSubscriberLimitError(eventType: string): never {
  throw new EventBusError({
    message: 'Subscriber limit reached for event type.',
    code: 'SUBSCRIBER_INVALID',
    eventType,
  });
}
