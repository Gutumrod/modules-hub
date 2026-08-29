import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSubscriptionCore, Plan } from '../../index.js';
import { createMockPlanRepository, createMockSubscriptionRepository } from '../../adapters/mock-repository.js';

describe('Subscription & Entitlement Core', () => {
  const plans: Plan[] = [
    {
      id: 'free',
      name: 'Free Plan',
      entitlements: {
        ai_reply: false,
        max_staff: 2,
        custom_domain: false,
      },
    },
    {
      id: 'pro',
      name: 'Pro Plan',
      entitlements: {
        ai_reply: true,
        max_staff: null, // unlimited
        custom_domain: true,
      },
    },
  ];

  it('should create subscription and check boolean entitlements', async () => {
    const planRepo = createMockPlanRepository(plans);
    const subRepo = createMockSubscriptionRepository();
    const core = createSubscriptionCore(subRepo, planRepo);

    await core.createSubscription({
      accountId: 'acc_123',
      planId: 'pro',
    });

    const canAi = await core.canUseFeature('acc_123', 'ai_reply');
    expect(canAi).toBe(true);

    const canDomain = await core.canUseFeature('acc_123', 'custom_domain');
    expect(canDomain).toBe(true);

    const limit = await core.getLimit('acc_123', 'max_staff');
    expect(limit).toBeNull(); // unlimited
  });

  it('should enforce numeric limits and usage checking', async () => {
    const planRepo = createMockPlanRepository(plans);
    const subRepo = createMockSubscriptionRepository();
    const core = createSubscriptionCore(subRepo, planRepo);

    await core.createSubscription({
      accountId: 'acc_free',
      planId: 'free',
    });

    const limit = await core.getLimit('acc_free', 'max_staff');
    expect(limit).toBe(2);

    const usageCheck1 = await core.checkUsage({
      accountId: 'acc_free',
      featureKey: 'max_staff',
      currentUsage: 1,
    });
    expect(usageCheck1.allowed).toBe(true);

    const usageCheck2 = await core.checkUsage({
      accountId: 'acc_free',
      featureKey: 'max_staff',
      currentUsage: 2,
    });
    expect(usageCheck2.allowed).toBe(false);
  });

  it('should handle billing events and state transitions', async () => {
    const planRepo = createMockPlanRepository(plans);
    const subRepo = createMockSubscriptionRepository();
    const core = createSubscriptionCore(subRepo, planRepo);

    await core.createSubscription({
      accountId: 'acc_billing',
      planId: 'pro',
    });

    let sub = await core.getSubscription('acc_billing');
    expect(sub?.status).toBe('active');

    // Simulate payment failure -> grace_period
    await core.handleBillingEvent({
      eventType: 'subscription.payment_failed',
      accountId: 'acc_billing',
    });

    sub = await core.getSubscription('acc_billing');
    expect(sub?.status).toBe('grace_period');

    // Simulate cancellation
    await core.cancelSubscription({
      accountId: 'acc_billing',
      atPeriodEnd: false,
    });

    sub = await core.getSubscription('acc_billing');
    expect(sub?.status).toBe('cancelled');

    // Cancelled subscription should block features
    const canAi = await core.canUseFeature('acc_billing', 'ai_reply');
    expect(canAi).toBe(false);
  });

  it('should change plan and update entitlements', async () => {
    const planRepo = createMockPlanRepository(plans);
    const subRepo = createMockSubscriptionRepository();
    const core = createSubscriptionCore(subRepo, planRepo);

    await core.createSubscription({
      accountId: 'acc_change',
      planId: 'free',
    });

    const initialAi = await core.canUseFeature('acc_change', 'ai_reply');
    expect(initialAi).toBe(false);

    const updated = await core.changePlan({
      accountId: 'acc_change',
      newPlanId: 'pro',
    });

    expect(updated.planId).toBe('pro');

    const sub = await core.getSubscription('acc_change');
    expect(sub?.planId).toBe('pro');

    const canAi = await core.canUseFeature('acc_change', 'ai_reply');
    expect(canAi).toBe(true);
  });

  it('should cancel subscription at period end', async () => {
    const planRepo = createMockPlanRepository(plans);
    const subRepo = createMockSubscriptionRepository();
    const core = createSubscriptionCore(subRepo, planRepo);

    await core.createSubscription({
      accountId: 'acc_cancel_period',
      planId: 'pro',
    });

    const cancelled = await core.cancelSubscription({
      accountId: 'acc_cancel_period',
      atPeriodEnd: true,
    });

    expect(cancelled.status).toBe('cancel_at_period_end');
    expect(cancelled.cancelAtPeriodEnd).toBe(true);

    const sub = await core.getSubscription('acc_cancel_period');
    expect(sub?.status).toBe('cancel_at_period_end');
    expect(sub?.cancelAtPeriodEnd).toBe(true);
  });

  it('should throw PLAN_NOT_FOUND when creating subscription with nonexistent plan', async () => {
    const planRepo = createMockPlanRepository(plans);
    const subRepo = createMockSubscriptionRepository();
    const core = createSubscriptionCore(subRepo, planRepo);

    await expect(
      core.createSubscription({
        accountId: 'acc_invalid_plan',
        planId: 'nonexistent',
      })
    ).rejects.toMatchObject({ code: 'PLAN_NOT_FOUND' });
  });

  it('should throw SUBSCRIPTION_ALREADY_EXISTS when creating duplicate subscription for active account', async () => {
    const planRepo = createMockPlanRepository(plans);
    const subRepo = createMockSubscriptionRepository();
    const core = createSubscriptionCore(subRepo, planRepo);

    await core.createSubscription({
      accountId: 'acc_duplicate',
      planId: 'free',
    });

    await expect(
      core.createSubscription({
        accountId: 'acc_duplicate',
        planId: 'pro',
      })
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_ALREADY_EXISTS' });
  });

  it('should throw SUBSCRIPTION_NOT_FOUND when changing plan or cancelling for nonexistent subscription', async () => {
    const planRepo = createMockPlanRepository(plans);
    const subRepo = createMockSubscriptionRepository();
    const core = createSubscriptionCore(subRepo, planRepo);

    await expect(
      core.changePlan({
        accountId: 'acc_missing',
        newPlanId: 'pro',
      })
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_NOT_FOUND' });

    await expect(
      core.cancelSubscription({
        accountId: 'acc_missing',
        atPeriodEnd: true,
      })
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_NOT_FOUND' });
  });

  it('should handle subscription.started billing event and update period end', async () => {
    const planRepo = createMockPlanRepository(plans);
    const subRepo = createMockSubscriptionRepository();
    const core = createSubscriptionCore(subRepo, planRepo);

    await core.createSubscription({
      accountId: 'acc_started',
      planId: 'pro',
      trialDays: 14,
    });

    let sub = await core.getSubscription('acc_started');
    expect(sub?.status).toBe('trialing');

    const newPeriodEnd = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    await core.handleBillingEvent({
      eventType: 'subscription.started',
      accountId: 'acc_started',
      currentPeriodEnd: newPeriodEnd,
    });

    sub = await core.getSubscription('acc_started');
    expect(sub?.status).toBe('active');
    expect(sub?.currentPeriodEnd).toEqual(newPeriodEnd);
  });

  it('should handle subscription.renewed billing event and reset cancelAtPeriodEnd', async () => {
    const planRepo = createMockPlanRepository(plans);
    const subRepo = createMockSubscriptionRepository();
    const core = createSubscriptionCore(subRepo, planRepo);

    await core.createSubscription({
      accountId: 'acc_renewed',
      planId: 'pro',
    });

    await core.cancelSubscription({
      accountId: 'acc_renewed',
      atPeriodEnd: true,
    });

    let sub = await core.getSubscription('acc_renewed');
    expect(sub?.cancelAtPeriodEnd).toBe(true);

    const renewalPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await core.handleBillingEvent({
      eventType: 'subscription.renewed',
      accountId: 'acc_renewed',
      currentPeriodEnd: renewalPeriodEnd,
    });

    sub = await core.getSubscription('acc_renewed');
    expect(sub?.status).toBe('active');
    expect(sub?.cancelAtPeriodEnd).toBe(false);
    expect(sub?.currentPeriodEnd).toEqual(renewalPeriodEnd);
  });

  it('should handle subscription.expired billing event', async () => {
    const planRepo = createMockPlanRepository(plans);
    const subRepo = createMockSubscriptionRepository();
    const core = createSubscriptionCore(subRepo, planRepo);

    await core.createSubscription({
      accountId: 'acc_expired',
      planId: 'pro',
    });

    await core.handleBillingEvent({
      eventType: 'subscription.expired',
      accountId: 'acc_expired',
    });

    const sub = await core.getSubscription('acc_expired');
    expect(sub?.status).toBe('expired');
  });

  it('should ignore duplicate billing events with the same eventId (idempotency)', async () => {
    const planRepo = createMockPlanRepository(plans);
    const subRepo = createMockSubscriptionRepository();
    const core = createSubscriptionCore(subRepo, planRepo);

    await core.createSubscription({
      accountId: 'acc_idempotent',
      planId: 'pro',
    });

    // First event with eventId 'evt_test_1'
    await core.handleBillingEvent({
      eventType: 'subscription.payment_failed',
      accountId: 'acc_idempotent',
      eventId: 'evt_test_1',
    });

    let sub = await core.getSubscription('acc_idempotent');
    expect(sub?.status).toBe('grace_period');
    expect(sub?.lastProcessedEventId).toBe('evt_test_1');

    // Duplicate event with the same eventId but different eventType
    await core.handleBillingEvent({
      eventType: 'subscription.expired',
      accountId: 'acc_idempotent',
      eventId: 'evt_test_1',
    });

    sub = await core.getSubscription('acc_idempotent');
    // Status must remain unchanged because the duplicate event was ignored
    expect(sub?.status).toBe('grace_period');
  });

  it('should ignore a processed event replayed after a different event', async () => {
    vi.useFakeTimers();
    const planRepo = createMockPlanRepository(plans);
    const subRepo = createMockSubscriptionRepository();
    let hookCount = 0;
    const core = createSubscriptionCore(subRepo, planRepo, {
      hooks: { onSubscriptionChange: () => { hookCount += 1; } },
    });
    await core.createSubscription({ accountId: 'acc_replay', planId: 'pro' });
    hookCount = 0;

    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    await core.handleBillingEvent({
      eventType: 'subscription.payment_failed', accountId: 'acc_replay', eventId: 'evt_A',
    });
    const firstGrace = (await core.getSubscription('acc_replay'))?.gracePeriodEnd;

    vi.setSystemTime(new Date('2026-01-02T00:00:00Z'));
    await core.handleBillingEvent({
      eventType: 'subscription.renewed', accountId: 'acc_replay', eventId: 'evt_B',
    });

    vi.setSystemTime(new Date('2026-01-03T00:00:00Z'));
    await core.handleBillingEvent({
      eventType: 'subscription.payment_failed', accountId: 'acc_replay', eventId: 'evt_A',
    });

    const sub = await core.getSubscription('acc_replay');
    expect(sub?.status).toBe('active');
    expect(sub?.gracePeriodEnd).toEqual(firstGrace);
    expect(sub?.lastProcessedEventId).toBe('evt_B');
    expect(hookCount).toBe(2);
  });

  it('should not reactivate a cancelled subscription when an old event is replayed', async () => {
    vi.useFakeTimers();
    const planRepo = createMockPlanRepository(plans);
    const subRepo = createMockSubscriptionRepository();
    const core = createSubscriptionCore(subRepo, planRepo);
    await core.createSubscription({ accountId: 'acc_cancel_replay', planId: 'pro' });

    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    await core.handleBillingEvent({
      eventType: 'subscription.payment_failed', accountId: 'acc_cancel_replay', eventId: 'evt_A',
    });
    vi.setSystemTime(new Date('2026-01-02T00:00:00Z'));
    await core.handleBillingEvent({
      eventType: 'subscription.cancelled', accountId: 'acc_cancel_replay', eventId: 'evt_B',
    });
    vi.setSystemTime(new Date('2026-01-03T00:00:00Z'));
    await core.handleBillingEvent({
      eventType: 'subscription.payment_failed', accountId: 'acc_cancel_replay', eventId: 'evt_A',
    });

    expect((await core.getSubscription('acc_cancel_replay'))?.status).toBe('cancelled');
    expect(await core.canUseFeature('acc_cancel_replay', 'ai_reply')).toBe(false);
  });

  it('should apply concurrent deliveries of the same event only once', async () => {
    const planRepo = createMockPlanRepository(plans);
    const subRepo = createMockSubscriptionRepository();
    let hookCount = 0;
    const core = createSubscriptionCore(subRepo, planRepo, {
      hooks: { onSubscriptionChange: () => { hookCount += 1; } },
    });
    await core.createSubscription({ accountId: 'acc_concurrent', planId: 'pro' });
    hookCount = 0;
    const event = {
      eventType: 'subscription.payment_failed' as const,
      accountId: 'acc_concurrent',
      eventId: 'evt_concurrent',
    };

    await Promise.all([core.handleBillingEvent(event), core.handleBillingEvent(event)]);

    expect(hookCount).toBe(1);
  });
});

describe('Billing Phase 0 regressions', () => {
  afterEach(() => vi.useRealTimers());

  function setup(billingInterval?: 'month' | 'year', gracePeriodDays?: number) {
    const repo = createMockSubscriptionRepository();
    const core = createSubscriptionCore(repo, createMockPlanRepository([{
      id: 'pro', name: 'Pro', billingInterval,
      entitlements: { feature: true, seats: 10 },
    }]), { gracePeriodDays });
    return { repo, core };
  }

  it.each([
    ['past_due', undefined, false],
    ['grace_period', new Date('2025-01-17T12:00:00Z'), true],
    ['grace_period', new Date('2025-01-14T12:00:00Z'), false],
    ['grace_period', new Date('2025-01-15T12:00:00Z'), false],
    ['grace_period', undefined, false],
    ['grace_period', new Date('invalid'), false],
    ['active', undefined, true],
    ['trialing', undefined, true],
    ['cancel_at_period_end', undefined, true],
    ['expired', undefined, false],
    ['cancelled', undefined, false],
  ] as const)('gates %s with deadline %s -> %s', async (status, gracePeriodEnd, allowed) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
    const { core, repo } = setup();
    const sub = await core.createSubscription({ accountId: 'a', planId: 'pro' });
    await repo.save({ ...sub, status, gracePeriodEnd });
    expect(await core.canUseFeature('a', 'feature')).toBe(allowed);
    expect(await core.getLimit('a', 'seats')).toBe(allowed ? 10 : 0);
    expect((await core.checkUsage({ accountId: 'a', featureKey: 'seats', currentUsage: 0 })).allowed).toBe(allowed);
  });

  it.each([
    ['month', '2025-01-15', '2025-02-15'],
    [undefined, '2025-01-15', '2025-02-15'],
    ['month', '2025-01-31', '2025-02-28'],
    ['month', '2024-01-31', '2024-02-29'],
    ['month', '2025-03-31', '2025-04-30'],
    ['month', '2025-12-31', '2026-01-31'],
    ['year', '2024-02-29', '2025-02-28'],
    ['year', '2025-01-15', '2026-01-15'],
  ] as const)('uses %s calendar interval from %s to %s', async (interval, start, end) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${start}T23:45:12.345Z`));
    const { core } = setup(interval);
    const sub = await core.createSubscription({ accountId: 'a', planId: 'pro' });
    expect(sub.currentPeriodStart.toISOString()).toBe(`${start}T23:45:12.345Z`);
    expect(sub.currentPeriodEnd.toISOString()).toBe(`${end}T23:45:12.345Z`);
  });

  it('keeps trial end as the period end for an annual plan', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
    const { core } = setup('year');
    const sub = await core.createSubscription({ accountId: 'a', planId: 'pro', trialDays: 7 });
    expect(sub.status).toBe('trialing');
    expect(sub.trialEnd?.toISOString()).toBe('2025-01-22T12:00:00.000Z');
    expect(sub.currentPeriodEnd).toEqual(sub.trialEnd);
  });

  it.each([
    [undefined, '2025-01-18T12:00:00.000Z'],
    [3, '2025-01-18T12:00:00.000Z'],
    [7, '2025-01-22T12:00:00.000Z'],
    [0, '2025-01-15T12:00:00.000Z'],
  ] as const)('uses grace config %s and does not extend duplicate events', async (days, deadline) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
    const { core } = setup('month', days);
    await core.createSubscription({ accountId: 'a', planId: 'pro' });
    const event = { accountId: 'a', eventType: 'subscription.payment_failed', eventId: 'failure-1' } as const;
    await core.handleBillingEvent(event);
    let sub = await core.getSubscription('a');
    expect(sub?.status).toBe('grace_period');
    expect(sub?.gracePeriodEnd?.toISOString()).toBe(deadline);
    expect(sub?.lastProcessedEventId).toBe('failure-1');
    expect(await core.canUseFeature('a', 'feature')).toBe(days !== 0);
    vi.setSystemTime(new Date('2025-01-16T12:00:00Z'));
    await core.handleBillingEvent(event);
    sub = await core.getSubscription('a');
    expect(sub?.gracePeriodEnd?.toISOString()).toBe(deadline);
    vi.setSystemTime(new Date(deadline));
    expect(await core.canUseFeature('a', 'feature')).toBe(false);
  });
});
