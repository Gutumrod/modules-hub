export type HostManifest = {
  version: string;
  actions: Record<string, ActionDefinition>;
  contextProviders: Record<string, ContextProviderDefinition>;
  approvalPolicies: Record<string, ApprovalPolicy>;
};

export type ActionDefinition = {
  description: string;
  parametersSchema: Record<string, unknown>;
  requiresApproval: boolean;
};

export type ContextProviderDefinition = {
  description: string;
  fetcher: (context: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

export type ApprovalPolicy = {
  actionName: string;
  riskLevel: 'low' | 'medium' | 'high';
  requiredRole: string;
};

export type WorkflowInput = {
  tenantId: string;
  actorId: string;
  triggerType: 'event' | 'conversation';
  payload: Record<string, unknown>;
};

export type WorkflowResult = {
  status: 'completed' | 'pending_approval' | 'failed';
  actionsExecuted: Array<{ action: string; result: unknown }>;
  missingParameters?: string[];
  auditTrailId: string;
};

export interface IntentResolver {
  resolveIntent(message: string): Promise<{ intent: string; confidence: number; parameters: Record<string, unknown> }>;
}

export interface WorkflowStorageAdapter {
  save(auditTrailId: string, result: WorkflowResult): Promise<void>;
  get(auditTrailId: string): Promise<WorkflowResult | null>;
}
