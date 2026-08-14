# Module 16: Import / Export

**Version:** 0.2.0 (P2)
**Status:** ✅ Completed

## Overview
The **Import / Export Module** provides standardized, streaming-first data parsing and serialization for CSV and JSONL formats. Designed for Edge runtimes (Cloudflare Workers) using Web Streams API.

## Features
- **Streaming Parser**: Supports bounded in-memory parsing for JSONL and CSV with size limits and partial error reporting.
- **Streaming Serializer**: Supports deterministic column ordering, header control, and spreadsheet formula injection protection (`=`, `+`, `-`, `@`).
- **Zero Database Dependency**: Pure data transformation utility.

## Installation & Usage
```ts
import { StreamParser, StreamSerializer } from '@module-hub/import-export';

const parser = new StreamParser();
const records = await parser.parseStream(stream, { format: 'csv', hasHeader: true });
```
