import { ParserOptions, SerializerOptions, ImportedRecord } from '../core/types';

export class XLSXAdapter {
  async *parseStream<T = Record<string, unknown>>(
    stream: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>,
    options: ParserOptions
  ): AsyncIterableIterator<ImportedRecord<T>> {
    const chunks: Uint8Array[] = [];
    const asyncIterable = isReadableStream(stream)
      ? readableStreamToAsyncIterable(stream)
      : stream;

    for await (const chunk of asyncIterable) {
      chunks.push(chunk);
    }

    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);

    yield {
      row: 1,
      value: { message: 'XLSX streaming adapter initialized', bytesProcessed: totalLength, format: options.format } as unknown as T,
      valid: true,
    };
  }

  serializeStream<T = Record<string, unknown>>(
    _records: AsyncIterable<T> | T[],
    options: SerializerOptions
  ): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(`[XLSX Serializer Stub: format=${options.format}]`));
        controller.close();
      },
    });
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
