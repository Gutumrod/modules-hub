import { ExportResult, SerializerOptions } from './types';

export class StreamSerializer {
  serialize(records: Record<string, unknown>[], options: SerializerOptions): ExportResult {
    if (options.format === 'jsonl') {
      return this.serializeJsonl(records);
    } else if (options.format === 'csv') {
      return this.serializeCsv(records, options);
    } else {
      throw new Error(`FORMAT_UNSUPPORTED: Unsupported export format ${options.format}`);
    }
  }

  private serializeJsonl(records: Record<string, unknown>[]): ExportResult {
    const lines = records.map((r) => JSON.stringify(r));
    const data = lines.join('\n') + (lines.length > 0 ? '\n' : '');
    return {
      contentType: 'application/x-ndjson',
      filenameExtension: 'jsonl',
      data,
      recordCount: records.length,
    };
  }

  private serializeCsv(records: Record<string, unknown>[], options: SerializerOptions): ExportResult {
    const delimiter = options.delimiter || ',';
    const includeHeader = options.includeHeader !== false;
    const escapeFormulas = options.escapeFormulas !== false;

    // Determine columns
    let columns = options.columns;
    if (!columns || columns.length === 0) {
      const colSet = new Set<string>();
      for (const record of records) {
        for (const key of Object.keys(record)) {
          colSet.add(key);
        }
      }
      columns = Array.from(colSet);
    }

    const lines: string[] = [];

    if (includeHeader && columns.length > 0) {
      lines.push(columns.map((c) => this.escapeCsvField(c, delimiter, false)).join(delimiter));
    }

    for (const record of records) {
      const rowFields = columns.map((col) => {
        const val = record[col];
        const strVal = val !== undefined && val !== null ? String(val) : '';
        return this.escapeCsvField(strVal, delimiter, escapeFormulas);
      });
      lines.push(rowFields.join(delimiter));
    }

    const data = lines.join('\n') + (lines.length > 0 ? '\n' : '');
    return {
      contentType: 'text/csv;charset=utf-8',
      filenameExtension: 'csv',
      data,
      recordCount: records.length,
    };
  }

  private escapeCsvField(field: string, delimiter: string, escapeFormulas: boolean): string {
    let sanitized = field;
    if (escapeFormulas && /^[=+\-@]/.test(sanitized)) {
      sanitized = `'${sanitized}`;
    }

    const needsQuotes =
      sanitized.includes(delimiter) ||
      sanitized.includes('"') ||
      sanitized.includes('\n') ||
      sanitized.includes('\r');

    if (needsQuotes) {
      return `"${sanitized.replace(/"/g, '""')}"`;
    }
    return sanitized;
  }
}
