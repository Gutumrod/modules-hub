import { describe, it, expect } from 'vitest';
import { StreamParser } from '../../core/parser';

describe('StreamParser', () => {
  const parser = new StreamParser();

  it('should parse valid JSONL stream', async () => {
    const jsonlContent = '{"name":"Alice","age":30}\n{"name":"Bob","age":25}';
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(jsonlContent));
        controller.close();
      },
    });

    const records = await parser.parseStream(stream, { format: 'jsonl' });
    expect(records).toHaveLength(2);
    expect(records[0].valid).toBe(true);
    expect(records[0].value).toEqual({ name: 'Alice', age: 30 });
    expect(records[1].value).toEqual({ name: 'Bob', age: 25 });
  });

  it('should handle invalid JSONL line gracefully', async () => {
    const jsonlContent = '{"name":"Alice"}\ninvalid-json';
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(jsonlContent));
        controller.close();
      },
    });

    const records = await parser.parseStream(stream, { format: 'jsonl' });
    expect(records).toHaveLength(2);
    expect(records[0].valid).toBe(true);
    expect(records[1].valid).toBe(false);
    expect(records[1].errors?.[0].code).toBe('ROW_INVALID');
  });

  it('should parse valid CSV stream with header', async () => {
    const csvContent = 'name,age\nAlice,30\nBob,25';
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(csvContent));
        controller.close();
      },
    });

    const records = await parser.parseStream(stream, { format: 'csv', hasHeader: true });
    expect(records).toHaveLength(2);
    expect(records[0].valid).toBe(true);
    expect(records[0].value).toEqual({ name: 'Alice', age: '30' });
  });

  it('should reject when maxBytes exceeded', async () => {
    const content = 'a,b,c\n1,2,3';
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(content));
        controller.close();
      },
    });

    await expect(
      parser.parseStream(stream, { format: 'csv', maxBytes: 5 })
    ).rejects.toThrow('IMPORT_SIZE_EXCEEDED');
  });
});
