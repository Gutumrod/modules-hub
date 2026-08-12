import { describe, it, expect } from 'vitest';
import { StreamSerializer } from '../../core/serializer';

describe('StreamSerializer', () => {
  const serializer = new StreamSerializer();

  it('should serialize records to JSONL', () => {
    const records = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ];
    const result = serializer.serialize(records, { format: 'jsonl' });
    expect(result.filenameExtension).toBe('jsonl');
    expect(result.recordCount).toBe(2);
    expect(result.data).toContain('{"name":"Alice","age":30}');
  });

  it('should serialize records to CSV with column ordering and formula escaping', () => {
    const records = [
      { name: 'Alice', formula: '=SUM(1,1)' },
      { name: 'Bob', formula: 'normal' },
    ];
    const result = serializer.serialize(records, {
      format: 'csv',
      columns: ['name', 'formula'],
      includeHeader: true,
      escapeFormulas: true,
    });

    expect(result.filenameExtension).toBe('csv');
    expect(result.recordCount).toBe(2);
    const lines = (result.data as string).trim().split('\n');
    expect(lines[0]).toBe('name,formula');
    expect(lines[1]).toBe(`Alice,"'=SUM(1,1)"`);
    expect(lines[2]).toBe('Bob,normal');
  });
});
