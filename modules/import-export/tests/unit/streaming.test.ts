import { describe, it, expect } from 'vitest';
import { StreamingParser } from '../../core/streaming-parser';

describe('StreamingParser', () => {
  it('should parse CSV stream correctly', async () => {
    const csvContent = 'name,age\nAlice,30\nBob,25';
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(csvContent));
        controller.close();
      },
    });

    const parser = new StreamingParser();
    const records: any[] = [];

    for await (const record of parser.parseStream(stream, { format: 'csv', hasHeader: true })) {
      records.push(record);
    }

    expect(records.length).toBe(2);
    expect(records[0].value).toEqual({ name: 'Alice', age: '30' });
    expect(records[1].value).toEqual({ name: 'Bob', age: '25' });
  });

  it('should parse JSONL stream correctly', async () => {
    const jsonlContent = '{"id":1}\n{"id":2}';
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(jsonlContent));
        controller.close();
      },
    });

    const parser = new StreamingParser();
    const records: any[] = [];

    for await (const record of parser.parseStream(stream, { format: 'jsonl' })) {
      records.push(record);
    }

    expect(records.length).toBe(2);
    expect(records[0].value).toEqual({ id: 1 });
    expect(records[1].value).toEqual({ id: 2 });
  });
});
