export class DefaultIntentResolver {
  async resolveIntent(message: string): Promise<{ intent: string; confidence: number; parameters: Record<string, unknown> }> {
    if (message.toLowerCase().includes('book') || message.toLowerCase().includes('reserve')) {
      return { intent: 'create_booking', confidence: 0.95, parameters: { type: 'room' } };
    }
    return { intent: 'unknown', confidence: 0.2, parameters: {} };
  }
}

export class DefaultActionExecutor {
  async executeAction(actionName: string, payload: Record<string, unknown>): Promise<{ success: boolean; data?: unknown }> {
    return { success: true, data: { actionName, payload, executedAt: Date.now() } };
  }
}
