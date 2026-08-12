import { AIWorkflowRuntime, HostManifest } from '../index';

async function run() {
  const manifest: HostManifest = {
    version: '1.0.0',
    actions: {
      send_email: {
        description: 'Send email notification',
        parametersSchema: { to: 'string' },
        requiresApproval: false,
      },
    },
    contextProviders: {},
    approvalPolicies: {},
  };

  const runtime = new AIWorkflowRuntime(manifest);

  const result = await runtime.execute({
    tenantId: 'tenant-999',
    actorId: 'user-001',
    triggerType: 'event',
    payload: { event: 'user.signup' },
  });

  console.log('Workflow Result:', result);
}

run().catch(console.error);
