import type { EventBusError } from './error.js';

export type Event<T = unknown> = {
  id: string;
  type: string;
  payload: T;
  timestamp: string;
  source?: string;
  subject?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
};

export type EventHandler<T = unknown> = {
  handle(event: Event<T>): Promise<void> | void;
  subscriberId?: string;
};

export type EventHandlerFn<T = unknown> = (event: Event<T>) => Promise<void> | void;

export type PublishFailure = {
  subscriberId?: string;
  error: EventBusError;
};

export type PublishResult = {
  delivered: number;
  failed: number;
  failures?: PublishFailure[];
};

export type EventBusHooks = {
  onPublish?: (event: Event) => void;
  onSubscribe?: (eventType: string, subscriberId?: string) => void;
  onUnsubscribe?: (eventType: string, subscriberId?: string) => void;
  onError?: (error: EventBusError, context: { event: Event; subscriberId?: string }) => void;
};

export type EventBusConfig = {
  idGenerator?: () => string;
  timestampProvider?: () => string;
  maxSubscribersPerType?: number;
  hooks?: EventBusHooks;
  onErrorSink?: (error: EventBusError, context: { event: Event; subscriberId?: string }) => void;
};

export type UnsubscribeFn = () => boolean;

export type EventBus = {
  publish<T = unknown>(event: Event<T>): Promise<PublishResult>;
  subscribe<T = unknown>(eventType: string, handler: EventHandler<T> | EventHandlerFn<T>): UnsubscribeFn;
  unsubscribe(eventType: string, subscriberIdOrHandler: string | EventHandler | EventHandlerFn): boolean;
};
