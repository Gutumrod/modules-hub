# Import / Export Module — DESIGN.md (Enterprise v0.2.0)

**Version:** 0.2.0 (P2, Enterprise Streaming)
**Status:** CSV/JSONL implemented and tested. XLSX adapter is a stub only (re-verified against source 2026-08-22 — see Section 3 correction).
**Language / runtime:** TypeScript, ES2022, strict mode. Compatible with Edge runtimes (Cloudflare Workers) using Web Streams API & AsyncIterable.

---

## 1. Purpose & Architectural Boundaries

The **Import / Export Module** provides a standardized, streaming-first approach to handling large datasets without loading the entire dataset into memory.

> **CRITICAL BOUNDARY:**
> - v0.2.0 introduces **AsyncIterable Streaming** (real, implemented). The "XLSX Adapter Architecture" described in Section 3 below was the design intent but was **not built** — the shipped `XLSXAdapter` is a non-functional stub (see correction in Section 3).
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
- **CSV & JSONL:** Processed chunk-by-chunk using manual line-by-line buffering over `TextDecoder` (not `TextDecoderStream`), maintaining $O(1)$ memory complexity relative to file size. Verified real/working in `core/parser.ts` and `core/streaming-parser.ts`, covered by tests.
- **XLSX (CORRECTED 2026-08-22 — was overclaimed):** This section originally claimed XLSX was "parsed via Edge-compatible array buffer extraction (handling OpenXML zip structures or lightweight XML traversal)". That was never built. The actual `adapters/xlsx-adapter.ts`:
  - `parseStream()` buffers all input bytes and yields exactly one fake record: `{ message: 'XLSX streaming adapter initialized', bytesProcessed, format }`. It does not parse OOXML/zip/XML content at all.
  - `serializeStream()` returns the literal string `[XLSX Serializer Stub: format=...]`, not a real XLSX file.
  - No XLSX-capable dependency (`xlsx`, `exceljs`, `sheetjs`, etc.) is present in `package.json`.
  - No tests exercise XLSX behavior.
  - Real XLSX parsing/writing remains unimplemented; treat `XLSXAdapter` as a placeholder for future work, not a usable adapter.
