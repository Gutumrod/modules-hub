import { Plan, Subscription, SubscriptionStatus } from './types.js';

export interface SubscriptionRepository {
  getByAccountId(accountId: string): Promise<Subscription | null>;
  save(subscription: Subscription): Promise<void>;
  /**
   * Atomically persist the subscription and claim eventId in a durable
   * idempotency ledger. Returns false when the event was already claimed.
   */
  saveForBillingEvent(subscription: Subscription, eventId: string): Promise<boolean>;
  updateStatus(accountId: string, status: SubscriptionStatus, extra?: Partial<Subscription>): Promise<void>;
}

export interface PlanRepository {
  getById(planId: string): Promise<Plan | null>;
  listAll(): Promise<Plan[]>;
  save(plan: Plan): Promise<void>;
}
