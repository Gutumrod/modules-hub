import { describe, it, expect } from 'vitest';
import { AdaptiveWorkflowRuntime } from '../../core/runtime';
import { DefaultIntentResolver, DefaultActionExecutor } from '../../adapters/default-adapters';
import { HostManifest } from '../../core/types';

describe('AI Workflow Engine (Module 20)', () => {
  const sampleManifest: HostManifest = {
    version: '1.0.0',
    actions: {
      send_notification: {
        description: 'Send a notification to user',
        parametersSchema: { userId: 'string' },
        requiresApproval: false,
      },
      refund_payment: {
        description: 'Refund payment to user',
        parametersSchema: { paymentId: 'string' },
        requiresApproval: true,
      },
    },
    contextProviders: {
      user_profile: {
        description: 'Fetch user profile',
        fetcher: async () => ({ name: 'John Doe' }),
      },
    },
    approvalPolicies: {
      refund_policy: {
        actionName: 'refund_payment',
        riskLevel: 'high',
        requiredRole: 'admin',
      },
    },
  };

  it('should execute non-approval actions successfully', async () => {
    const runtime = new AdaptiveWorkflowRuntime({
      ...sampleManifest,
      actions: {
        send_notification: sampleManifest.actions.send_notification,
      },
    });

    const result = await runtime.execute({
      tenantId: 'tenant-1',
      actorId: 'user-1',
      triggerType: 'event',
      payload: { message: 'Hello' },
    });

    expect(result.status).toBe('completed');
    expect(result.actionsExecuted.length).toBe(1);
    expect(result.actionsExecuted[0].action).toBe('send_notification');
    expect(result.auditTrailId).toBeDefined();
  });

  it('should trigger pending_approval when action requires approval', async () => {
    const runtime = new AdaptiveWorkflowRuntime(sampleManifest);

    const result = await runtime.execute({
      tenantId: 'tenant-1',
      actorId: 'user-1',
      triggerType: 'event',
      payload: {},
    });

    expect(result.status).toBe('pending_approval');
  });

  it('should resolve intent correctly with default adapter', async () => {
    const resolver = new DefaultIntentResolver();
    const intent = await resolver.resolveIntent('Please book a room for me');
    expect(intent.intent).toBe('create_booking');
    expect(intent.confidence).toBeGreaterThan(0.9);
  });

  it('should execute action via default executor', async () => {
    const executor = new DefaultActionExecutor();
    const res = await executor.executeAction('test_action', { foo: 'bar' });
    expect(res.success).toBe(true);
    expect(res.data).toHaveProperty('actionName', 'test_action');
  });
});
