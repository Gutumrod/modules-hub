import { ParserOptions, ImportedRecord } from './types';

export class StreamingParser {
  async *parseStream<T = Record<string, unknown>>(
    stream: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>,
    options: ParserOptions
  ): AsyncIterableIterator<ImportedRecord<T>> {
    const format = options.format;
    const hasHeader = options.hasHeader !== false;
    const delimiter = options.delimiter || ',';
    const skipRows = options.skipRows || 0;
    const maxRows = options.maxRows || Infinity;

    let headers: string[] = [];
    let currentRow = 0;
    let skipped = 0;
    let buffer = '';

    const asyncIterable = isReadableStream(stream)
      ? readableStreamToAsyncIterable(stream)
      : stream;

    const decoder = new TextDecoder();

    for await (const chunk of asyncIterable) {
      buffer += decoder.decode(chunk, { stream: true });
      let lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || ''; // Keep the last incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;

        if (skipped < skipRows) {
          skipped++;
          continue;
        }

        if (currentRow >= maxRows) {
          return;
        }

        if (format === 'csv') {
          const values = parseCsvLine(line, delimiter);
          if (currentRow === 0 && hasHeader) {
            headers = values;
            currentRow++;
            continue;
          }

          const recordData: any = {};
          if (headers.length > 0) {
            for (let i = 0; i < headers.length; i++) {
              recordData[headers[i]] = values[i] !== undefined ? values[i] : null;
            }
          } else {
            values.forEach((val, idx) => {
              recordData[`col_${idx}`] = val;
            });
          }

          yield {
            row: currentRow + 1,
            value: recordData as T,
            valid: true,
          };
          currentRow++;
        } else if (format === 'jsonl') {
          try {
            const parsed = JSON.parse(line);
            yield {
              row: currentRow + 1,
              value: parsed as T,
              valid: true,
            };
            currentRow++;
          } catch (err: any) {
            yield {
              row: currentRow + 1,
              valid: false,
              errors: [{ code: 'INVALID_JSON', message: err.message }],
            };
            currentRow++;
          }
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim() && currentRow < maxRows) {
      if (skipped >= skipRows) {
        if (format === 'csv') {
          const values = parseCsvLine(buffer, delimiter);
          const recordData: any = {};
          if (headers.length > 0) {
            for (let i = 0; i < headers.length; i++) {
              recordData[headers[i]] = values[i] !== undefined ? values[i] : null;
            }
          } else {
            values.forEach((val, idx) => {
              recordData[`col_${idx}`] = val;
            });
          }
          yield {
            row: currentRow + 1,
            value: recordData as T,
            valid: true,
          };
        } else if (format === 'jsonl') {
          try {
            const parsed = JSON.parse(buffer);
            yield {
              row: currentRow + 1,
              value: parsed as T,
              valid: true,
            };
          } catch (err: any) {
            yield {
              row: currentRow + 1,
              valid: false,
              errors: [{ code: 'INVALID_JSON', message: err.message }],
            };
          }
        }
      }
    }
  }
}

function isReadableStream(stream: any): stream is ReadableStream<Uint8Array> {
  return stream && typeof stream.getReader === 'function';
}

async function* readableStreamToAsyncIterable(
  stream: ReadableStream<Uint8Array>
): AsyncIterableIterator<Uint8Array> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}
