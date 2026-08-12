export type EventBusErrorCode =
  | 'EVENT_INVALID'
  | 'EVENT_TYPE_INVALID'
  | 'SUBSCRIBER_INVALID'
  | 'HANDLER_FAILED'
  | 'PUBLISH_FAILED';

export class EventBusError extends Error {
  public readonly code: EventBusErrorCode;
  public readonly eventId?: string;
  public readonly eventType?: string;
  public readonly subscriberId?: string;
  public override readonly cause?: unknown;

  public constructor(options: {
    message: string;
    code: EventBusErrorCode;
    eventId?: string;
    eventType?: string;
    subscriberId?: string;
    cause?: unknown;
  }) {
    super(options.message);
    this.name = 'EventBusError';
    this.code = options.code;
    this.eventId = options.eventId;
    this.eventType = options.eventType;
    this.subscriberId = options.subscriberId;
    this.cause = options.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
