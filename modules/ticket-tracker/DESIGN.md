# Ticket Tracker Module — DESIGN.md

**Package name:** `@module-hub/ticket-tracker`
**Version:** 0.2.0
**Status:** Production-ready — upgraded in v0.2.0 to support a dynamic, schema-driven `TicketSchema` (defining custom fields, statuses, priorities, and transition rules) while maintaining backward compatibility via `DEFAULT_SCHEMA`.

## 1. Purpose

Login-agnostic, storage-agnostic, and schema-agnostic ticket lifecycle: a reporter/user submits payload fields defined by a `TicketSchema`, and a handler works tickets through a valid state transition graph. Same separation-of-concerns principle as `@module-hub/auth` — this module has no opinion on who's allowed to call which route; the host wires that.

```
Host Application / Route Mounting (Express, Fastify, HTTP server)
       ↓
Route Handlers (createTicket, listTickets, getTicket, updateStatus) — routes.ts
       ↓
Core (validation against TicketSchema, state transition check, ID generation) — core/
       ↓
TicketStore Interface (list/get/create/updateStatus) — store/types.ts
       ↓
Concrete Store (json-file-store.ts ships as the default; host can swap in a DB-backed store)
```

### Host responsibilities vs module responsibilities

| Host does | Module does |
|---|---|
| Mounts HTTP routes and supplies either a static `TicketSchema` or a per-request resolver function `(req) => TicketSchema` | Exposes plain per-endpoint HTTP route handlers |
| Owns the storage backend (or accepts the default JSON-file store) | Operates strictly on the `TicketStore` interface |
| Extracts/parses the request body before calling a handler | Validates payloads and transition rules dynamically against `TicketSchema` |
| Decides what authentication/authorization means, if anything | Never imports or references auth of any kind |

## 2. Non-Goals

- **No auth, no session, no role concept.** Pair with `@module-hub/auth` (or the host's own auth) at the route-mounting layer — this module doesn't know that layer exists.
- **No concurrent-write safety.** `json-file-store.ts` reads and rewrites the whole file per write. A host needing real concurrency implements its own `TicketStore`.
- **No multi-tenancy.** No built-in `tenantId`/`shopId` field on `Ticket`. A host needing tenant isolation defines it via custom fields in `TicketSchema` or extends its own store implementation.

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
│   ├── constants.ts    DEFAULT_SCHEMA, isStatus, isPriority
│   ├── types.ts         TicketFieldDef, TicketSchema, Ticket, CreateTicketInput, etc.
│   ├── validation.ts    cleanString, validateCreatePayload
│   └── id.ts             nextTicketId
├── store/
│   ├── types.ts          TicketStore interface (takes TicketSchema)
│   └── json-file-store.ts  default implementation
├── routes.ts             createTicketRoutes(store, schemaOrResolver)
├── tests/
│   └── core.test.ts
└── examples/
    └── integration.example.ts
```
