# Ticket Tracker Module — DESIGN.md

**Package name:** `@module-hub/ticket-tracker`
**Version:** 0.1.0
**Status:** Speculative — extracted from `products/ticket-tracking-relay`'s working MVP with no second consumer confirmed yet. Built anyway on explicit request (2026-08-19) so a future host can copy it in without re-deriving the state machine. Keep this in mind when reviewing scope: this module intentionally does **not** try to anticipate what that future host needs beyond "the current ticket-tracking-relay shape, cleanly separated from auth and storage."

**Not a fit for `products/booking`'s claim/case tickets** — checked before building. Booking already ships its own richer ticket system directly in `supabase/migrations/20260818000000_local_service_tickets.sql` (8-state flow, `ProductClaim`/`ServiceIssue`/etc. types, tied to `shop_id`/`booking_id`, RLS + `SECURITY DEFINER` RPCs). This module is *not* an ingredient for that — it exists for a hypothetical future host that wants the simpler 5-state reporter/handler flow as-is.

## 1. Purpose

Login-agnostic, storage-agnostic ticket lifecycle: a reporter files an issue, a handler works it through a fixed status flow. Same separation-of-concerns principle as `@module-hub/auth` — this module has no opinion on who's allowed to call which route; the host wires that.

```
Host Application / Route Mounting (Express, Fastify, whatever)
       ↓
Route Handlers (createTicket, listTickets, getTicket, updateStatus) — routes.ts
       ↓
Core (validation, state machine, ID generation) — core/
       ↓
TicketStore Interface (list/get/create/updateStatus) — store/types.ts
       ↓
Concrete Store (json-file-store.ts ships as the default; host can swap in a DB-backed store)
```

### Host responsibilities vs module responsibilities

| Host does | Module does |
|---|---|
| Mounts each handler on its own route, decides which get auth middleware | Exposes plain per-endpoint handlers, no bundled Router |
| Owns the storage backend (or accepts the default JSON-file store) | Operates strictly on the `TicketStore` interface |
| Extracts/parses the request body before calling a handler (any body-parser) | Reads only `req.body`/`req.params`/`req.query` per the duck-typed `MinimalRequest` |
| Decides what "handler role" or auth means, if anything | Never imports or references auth of any kind |

## 2. Non-Goals

- **No auth, no session, no role concept.** Pair with `@module-hub/auth` (or the host's own auth) at the route-mounting layer — this module doesn't know that layer exists.
- **No configurable state machine.** `STATUSES`/`ALLOWED_TRANSITIONS` are fixed constants matching `ticket-tracking-relay`'s current flow, not a config object. A host with a genuinely different lifecycle (e.g. Booking's 8-state claim flow) edits the copied `core/constants.ts` directly rather than fighting a generic config schema for one-time reuse. See `modules-hub/INDEX.md`'s copy-only rule — this is expected, not a workaround.
- **No concurrent-write safety.** `json-file-store.ts` reads and rewrites the whole file per write, same limitation `ticket-tracking-relay`'s README already documents. A host needing real concurrency implements its own `TicketStore`.
- **No multi-tenancy.** No `tenantId`/`shopId` field on `Ticket`. A host needing tenant isolation adds the field to its copy of `core/types.ts` and threads it through its own `TicketStore` implementation.

## 3. File Structure

```
modules/ticket-tracker/
├── DESIGN.md
├── MODULE.md
├── VERSION
├── package.json
├── tsconfig.json
├── index.ts
├── core/
│   ├── index.ts
│   ├── constants.ts    STATUSES, PRIORITIES, ALLOWED_TRANSITIONS
│   ├── types.ts         Ticket, CreateTicketInput, ValidationResult, UpdateStatusResult
│   ├── validation.ts    cleanString, validateCreatePayload
│   └── id.ts             nextTicketId
├── store/
│   ├── types.ts          TicketStore interface
│   └── json-file-store.ts  default implementation
├── routes.ts             createTicketRoutes(store) → 4 handlers
├── tests/
│   └── core.test.ts
└── examples/
    └── integration.example.ts
```
