# Module 16: Import / Export

**Version:** 0.2.0 (P2)
**Status:** ⚠️ Partially Completed — CSV/JSONL working, XLSX is a stub (see below)

## Overview
The **Import / Export Module** provides standardized, streaming-first data parsing and serialization for CSV and JSONL formats. Designed for Edge runtimes (Cloudflare Workers) using Web Streams API.

## Verified status (re-audited against source, 2026-08-22)
- `StreamParser` (core/parser.ts) and `StreamSerializer` (core/serializer.ts): real, working CSV/JSONL parse+serialize. Covered by tests.
- `StreamingParser` (core/streaming-parser.ts): real, working chunked/streaming CSV/JSONL parser (AsyncIterable-based). Covered by tests.
- `XLSXAdapter` (adapters/xlsx-adapter.ts): **stub only, exported but not functional.** `parseStream` reads the input bytes and yields a single fake record (`{ message: 'XLSX streaming adapter initialized', bytesProcessed, format }`) — it does not parse XLSX content at all. `serializeStream` returns the literal text `[XLSX Serializer Stub: format=...]` instead of an XLSX file. There is no XLSX-parsing library dependency in `package.json` (no `xlsx`/`exceljs`/`sheetjs`), and no hand-rolled OOXML/zip parsing exists in the source. Zero test coverage for XLSX. Do not use for real XLSX import/export.
- Test suite: 8 tests pass (`vitest run` — 3 files: parser, serializer, streaming), all CSV/JSONL. No XLSX tests exist.
- Typecheck (`tsc --noEmit`): passes clean.

## Features
- **Streaming Parser**: Supports bounded in-memory parsing for JSONL and CSV with size limits and partial error reporting.
- **Streaming Serializer**: Supports deterministic column ordering, header control, and spreadsheet formula injection protection (`=`, `+`, `-`, `@`).
- **XLSX**: NOT implemented — `XLSXAdapter` is a placeholder stub only (see Verified status above).
- **Zero Database Dependency**: Pure data transformation utility.

## Installation & Usage
```ts
import { StreamParser, StreamSerializer } from '@module-hub/import-export';

const parser = new StreamParser();
const records = await parser.parseStream(stream, { format: 'csv', hasHeader: true });
```
