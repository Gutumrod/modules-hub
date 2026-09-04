# Module 18: AI Provider

**Version:** 0.3.0
**Status:** ✅ Completed
**Documentation Authority:** Current version/status follow `../REGISTRY.md`; this document describes the module contract/design for that registered version.

## Overview
The **AI Provider Module** provides a lightweight, unified abstraction for LLM inference supporting `generateText` and `generateStructured`.

## Features
- Unified `AIProvider` interface.
- Secret injection (no hardcoded environment access in core).
- Robust error normalization (`RATE_LIMITED`, `TIMEOUT`, `PROVIDER_ERROR`, etc.).
- Request timeout management.
- `FallbackAIProvider` retries after thrown errors, unsuccessful responses, or an open per-provider circuit breaker.

## Usage
Refer to `DESIGN.md` and integration examples.
