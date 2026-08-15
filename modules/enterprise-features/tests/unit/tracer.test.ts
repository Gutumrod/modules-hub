import { describe, expect, it, vi } from 'vitest';
import { MemoryTracer, NoopTracer } from '../../core/tracer.js';

describe('tracing contracts', () => {
  it('provides a no-op tracer with the same span contract', () => {
    const span = new NoopTracer().startSpan('operation');
    expect(() => { span.setAttribute('tenant', 'acme'); span.end(); }).not.toThrow();
  });

  it('records completed spans and attributes in memory', () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(125);
    const tracer = new MemoryTracer();
    const span = tracer.startSpan('operation');
    span.setAttribute('attempt', 1);
    span.end();
    expect(tracer.getCompletedSpans()).toEqual([expect.objectContaining({ name: 'operation', durationMs: 25, attributes: { attempt: 1 } })]);
  });

  it('ends idempotently and protects completed span state', () => {
    const tracer = new MemoryTracer();
    const span = tracer.startSpan('operation');
    span.end();
    span.end();
    expect(tracer.getCompletedSpans()).toHaveLength(1);
    expect(() => span.setAttribute('late', true)).toThrow(/ended span/);
  });

  it('rejects an empty span name', () => {
    expect(() => new MemoryTracer().startSpan(' ')).toThrow(TypeError);
  });
});
