import { IntentResolver } from '../core/types';

export class AdaptiveIntentResolver implements IntentResolver {
  constructor(private aiProvider?: { generateText: (prompt: string) => Promise<string> }) {}

  async resolveIntent(message: string): Promise<{ intent: string; confidence: number; parameters: Record<string, unknown> }> {
    // 1. Try AI Provider if available
    if (this.aiProvider) {
      try {
        const prompt = `Classify intent for message: "${message}". Return JSON with intent, confidence, parameters.`;
        const response = await this.aiProvider.generateText(prompt);
        const parsed = JSON.parse(response);
        if (parsed && parsed.intent) {
          return parsed;
        }
      } catch (err) {
        // Graceful degradation to fallback rule-based resolver upon AI failure or timeout
        console.warn('AI Provider failed or unavailable, falling back to rule-based resolver.', err);
      }
    }

    // 2. Fallback: Rule-based / Regex matching
    const lower = message.toLowerCase();
    if (lower.includes('book') || lower.includes('reserve')) {
      return { intent: 'create_booking', confidence: 0.85, parameters: { type: 'general' } };
    }
    if (lower.includes('refund') || lower.includes('cancel')) {
      return { intent: 'refund_payment', confidence: 0.85, parameters: {} };
    }
    if (lower.includes('notify') || lower.includes('alert')) {
      return { intent: 'send_notification', confidence: 0.85, parameters: {} };
    }

    return { intent: 'unknown', confidence: 0.1, parameters: {} };
  }
}
