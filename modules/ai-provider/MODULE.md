# Module 18: AI Provider

**Version:** 0.2.0 (P2)
**Status:** ✅ Completed

## Overview
The **AI Provider Module** provides a lightweight, unified abstraction for LLM inference supporting `generateText` and `generateStructured`.

## Features
- Unified `AIProvider` interface.
- Secret injection (no hardcoded environment access in core).
- Robust error normalization (`RATE_LIMITED`, `TIMEOUT`, `PROVIDER_ERROR`, etc.).
- Request timeout management.

## Usage
Refer to `DESIGN.md` and integration examples.
