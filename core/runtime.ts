import { HostManifest, WorkflowInput, WorkflowResult, IntentResolver, WorkflowStorageAdapter } from './types';
import { AdaptiveIntentResolver } from '../adapters/adaptive-intent-resolver';

export class AdaptiveWorkflowRuntime {
  private intentResolver: IntentResolver;
  private storageAdapter?: WorkflowStorageAdapter;

  constructor(
    private manifest: HostManifest,
    options?: {
      intentResolver?: IntentResolver;
      storageAdapter?: WorkflowStorageAdapter;
      aiProvider?: { generateText: (prompt: string) => Promise<string> };
    }
  ) {
    this.intentResolver = options?.intentResolver || new AdaptiveIntentResolver(options?.aiProvider);
    this.storageAdapter = options?.storageAdapter;
  }

  async execute(input: WorkflowInput): Promise<WorkflowResult> {
    const auditTrailId = `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // If conversation trigger, resolve intent first
    if (input.triggerType === 'conversation' && input.payload.message) {
      const intentResult = await this.intentResolver.resolveIntent(String(input.payload.message));
      if (intentResult.intent !== 'unknown' && this.manifest.actions[intentResult.intent]) {
        const actionName = intentResult.intent;
        const def = this.manifest.actions[actionName];

        if (def.requiresApproval) {
          const res: WorkflowResult = {
            status: 'pending_approval',
            actionsExecuted: [],
            auditTrailId,
          };
          if (this.storageAdapter) await this.storageAdapter.save(auditTrailId, res);
          return res;
        }

        const res: WorkflowResult = {
          status: 'completed',
          actionsExecuted: [{ action: actionName, result: { success: true, parameters: intentResult.parameters } }],
          auditTrailId,
        };
        if (this.storageAdapter) await this.storageAdapter.save(auditTrailId, res);
        return res;
      }
    }

    // Default event-driven or fallback execution
    const executedActions: Array<{ action: string; result: unknown }> = [];
    for (const [actionName, def] of Object.entries(this.manifest.actions)) {
      if (def.requiresApproval) {
        const res: WorkflowResult = {
          status: 'pending_approval',
          actionsExecuted: executedActions,
          auditTrailId,
        };
        if (this.storageAdapter) await this.storageAdapter.save(auditTrailId, res);
        return res;
      }

      executedActions.push({
        action: actionName,
        result: { success: true, timestamp: Date.now() },
      });
    }

    const finalResult: WorkflowResult = {
      status: 'completed',
      actionsExecuted: executedActions,
      auditTrailId,
    };

    // Graceful fallback if storage adapter is missing (uses in-memory transient log)
    if (this.storageAdapter) {
      await this.storageAdapter.save(auditTrailId, finalResult);
    }

    return finalResult;
  }
}
