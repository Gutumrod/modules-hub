import type { ImportedRecord, ParserOptions } from './types';

export class StreamParser {
  /**
   * Parse a ReadableStream of Uint8Array into an array of ImportedRecord or stream them.
   * For v0.1 bounded streaming, we read the stream into text and parse rows.
   */
  async parseStream<T = Record<string, unknown>>(
    stream: ReadableStream<Uint8Array>,
    options: ParserOptions
  ): Promise<ImportedRecord<T>[]> {
    const reader = stream.getReader();
    const decoder = new TextDecoder('utf-8');
    let totalBytes = 0;
    let accumulatedText = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.length;
          if (options.maxBytes && totalBytes > options.maxBytes) {
            throw new Error('IMPORT_SIZE_EXCEEDED: Maximum input bytes exceeded');
          }
          accumulatedText += decoder.decode(value, { stream: true });
        }
      }
      accumulatedText += decoder.decode();
    } finally {
      reader.releaseLock();
    }

    if (options.format === 'jsonl') {
      return this.parseJsonl<T>(accumulatedText, options);
    } else if (options.format === 'csv') {
      return this.parseCsv<T>(accumulatedText, options);
    } else {
      throw new Error(`FORMAT_UNSUPPORTED: Unsupported format ${options.format}`);
    }
  }

  private parseJsonl<T>(text: string, options: ParserOptions): ImportedRecord<T>[] {
    const lines = text.split(/\r?\n/);
    const records: ImportedRecord<T>[] = [];
    const skipRows = options.skipRows || 0;
    const maxRows = options.maxRows || Infinity;

    let rowIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      rowIndex++;
      if (rowIndex <= skipRows) continue;
      if (records.length >= maxRows) break;

      try {
        const value = JSON.parse(line) as T;
        records.push({
          row: rowIndex,
          value,
          valid: true,
        });
      } catch (err: any) {
        records.push({
          row: rowIndex,
          valid: false,
          errors: [
            {
              code: 'ROW_INVALID',
              message: `Failed to parse JSON line: ${err.message}`,
            },
          ],
        });
      }
    }

    return records;
  }

  private parseCsv<T>(text: string, options: ParserOptions): ImportedRecord<T>[] {
    const lines = text.split(/\r?\n/);
    const records: ImportedRecord<T>[] = [];
    const delimiter = options.delimiter || ',';
    const hasHeader = options.hasHeader !== false;
    const skipRows = options.skipRows || 0;
    const maxRows = options.maxRows || Infinity;

    let headers: string[] = [];
    let rowIndex = 0;
    let dataRowIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim() && i === lines.length - 1) continue; // skip trailing empty line

      rowIndex++;
      if (rowIndex <= skipRows) continue;

      const parsedFields = this.parseCsvLine(line, delimiter);

      if (hasHeader && rowIndex === 1 + skipRows) {
        headers = parsedFields.map((h) => h.trim());
        continue;
      }

      dataRowIndex++;
      if (records.length >= maxRows) break;

      try {
        let value: any;
        if (hasHeader && headers.length > 0) {
          const obj: Record<string, unknown> = {};
          for (let j = 0; j < headers.length; j++) {
            obj[headers[j]] = parsedFields[j] !== undefined ? parsedFields[j] : '';
          }
          value = obj as T;
        } else {
          value = parsedFields as unknown as T;
        }

        records.push({
          row: rowIndex,
          value,
          valid: true,
        });
      } catch (err: any) {
        records.push({
          row: rowIndex,
          valid: false,
          errors: [
            {
              code: 'ROW_INVALID',
              message: `Failed to parse CSV row: ${err.message}`,
            },
          ],
        });
      }
    }

    return records;
  }

  private parseCsvLine(line: string, delimiter: string): string[] {
    const fields: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        fields.push(currentField);
        currentField = '';
      } else {
        currentField += char;
      }
    }
    fields.push(currentField);
    return fields.map((f) => f.trim());
  }
}
