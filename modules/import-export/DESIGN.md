# Import / Export Module — DESIGN.md (Enterprise v0.2.0)

**Version:** 0.2.0 (P2, Enterprise Streaming)
**Status:** Design & Research Complete (Week 1).
**Language / runtime:** TypeScript, ES2022, strict mode. Compatible with Edge runtimes (Cloudflare Workers) using Web Streams API & AsyncIterable.

---

## 1. Purpose & Architectural Boundaries

The **Import / Export Module** provides a standardized, streaming-first approach to handling large datasets without loading the entire dataset into memory.

> **CRITICAL BOUNDARY:**
> - v0.2.0 introduces **AsyncIterable Streaming** and **XLSX Adapter Architecture**.
> - It does **NOT** handle direct database connections.
> - It does **NOT** handle file storage directly (accepts/returns `ReadableStream` or `AsyncIterable`).

---

## 2. Core Domain Models & Interfaces (v0.2.0)

### 2.1 Data Format
```ts
export type DataFormat = 'csv' | 'jsonl' | 'xlsx';
```

### 2.2 Streaming Parser Interface
```ts
export type StreamParserOptions = {
  format: DataFormat;
  delimiter?: string;
  hasHeader?: boolean;
  skipRows?: number;
  maxBytes?: number;
  maxRows?: number;
};

export interface AsyncDataParser {
  parseStream<T = Record<string, unknown>>(
    stream: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>,
    options: StreamParserOptions
  ): AsyncIterableIterator<ImportedRecord<T>>;
}
```

### 2.3 Streaming Serializer Interface
```ts
export type StreamSerializerOptions = {
  format: DataFormat;
  delimiter?: string;
  columns?: string[];
  includeHeader?: boolean;
  escapeFormulas?: boolean;
};

export interface AsyncDataSerializer {
  serializeStream<T = Record<string, unknown>>(
    records: AsyncIterable<T> | T[],
    options: StreamSerializerOptions
  ): ReadableStream<Uint8Array>;
}
```

---

## 3. Edge Compatibility Strategy
- **CSV & JSONL:** Processed chunk-by-chunk using `TextDecoderStream` and line-by-line buffers, maintaining $O(1)$ memory complexity relative to file size.
- **XLSX:** Parsed via Edge-compatible array buffer extraction (handling OpenXML zip structures or lightweight XML traversal) without relying on Node.js native `fs` or `path`.
