import type { RecordedSpan, Span, SpanAttributeValue, Tracer } from './types.js';

function requireSpanName(name: string): void {
  if (typeof name !== 'string' || name.trim().length === 0) throw new TypeError('span name must be a non-empty string');
}

export class NoopTracer implements Tracer {
  startSpan(name: string): Span {
    requireSpanName(name);
    return { setAttribute: () => undefined, end: () => undefined };
  }
}

export class MemoryTracer implements Tracer {
  private readonly completedSpans: RecordedSpan[] = [];

  startSpan(name: string): Span {
    requireSpanName(name);
    const startedAt = Date.now();
    const attributes: Record<string, SpanAttributeValue> = {};
    let ended = false;

    return {
      setAttribute(key, value) {
        if (ended) throw new Error('Cannot mutate an ended span');
        if (key.trim().length === 0) throw new TypeError('attribute key must be non-empty');
        attributes[key] = value;
      },
      end: () => {
        if (ended) return;
        ended = true;
        const endedAt = Date.now();
        this.completedSpans.push(Object.freeze({
          name,
          startedAt,
          endedAt,
          durationMs: endedAt - startedAt,
          attributes: Object.freeze({ ...attributes }),
        }));
      },
    };
  }

  getCompletedSpans(): readonly RecordedSpan[] {
    return this.completedSpans.map((span) => ({ ...span, attributes: { ...span.attributes } }));
  }

  clear(): void {
    this.completedSpans.length = 0;
  }
}
