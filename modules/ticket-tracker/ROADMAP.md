# Ticket Tracker Module — Dynamic Schema Roadmap

Not implemented yet. This is the design for making `STATUSES`/`PRIORITIES`/`ALLOWED_TRANSITIONS` and the `Ticket` field set host-configurable input instead of hardcoded TypeScript constants — written down now so a future host doesn't have to re-derive it, per the same "copy-only, host stays in control" philosophy as the rest of this module. See DESIGN.md for the module's current (v0.1.0) shape and Non-Goals; this file only adds detail to the schema question, it doesn't relax any of them.

## 1. Problem statement

Today `core/constants.ts` and `core/types.ts` fix the field set and status/transition flow at module-copy time — a host repurposing this for a different domain (a car-repair shop, a gadget-store warranty-claim desk) edits the TypeScript source directly. Fine for a single embed. Not fine for a host that wants *its own tenants* to self-configure fields/statuses without a code change and redeploy per tenant — that was the actual trigger for this doc: someone wants to plug this into a multi-tenant self-serve SaaS product one day.

**Explicitly rejected direction:** building that SaaS product ourselves, with its own database and its own settings UI, as part of "finishing" this module. That would contradict the module's whole reason for existing — it doesn't know about frontend or backend, and it shouldn't start now. Whoever embeds this supplies their own database, their own auth, their own multi-tenancy, and their own UI. This module's only job, even after the change below, is making the *shape* of a ticket configurable input — never storing, resolving, or rendering that configuration itself.

**Checked before writing this so it doesn't reinvent anything:**
- `modules-hub/modules/tenant-context` (v0.3.0) — only resolves "which tenant" from a trusted request header, does zero membership verification, and has **no config/settings storage** at all. Never integrated by any real product yet. Not a dependency for this — multi-tenancy and settings storage stay 100% the host's problem, same conclusion this module's own Non-Goals already reached independently.
- `products/booking`'s multi-tenant pattern (`shops`/`shop_users`/`has_shop_role()` SECURITY DEFINER RPC, RLS, `shop_id` resolved server-side from the session, settings as typed columns mutated through an owner-gated RPC) — proven in production, but a **reference pattern for a future host to copy**, not something this module bundles or depends on.

## 2. Target shape — schema becomes an input, not a constant

```ts
// A field definition the host controls (per-tenant, per-install, whatever scope the host needs)
type TicketFieldDef = {
  key: string;                  // e.g. "license_plate"
  label: string;                 // e.g. "ทะเบียนรถ"
  type: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'checkbox';
  required?: boolean;
  options?: string[];            // for 'select'
};

type TicketSchema = {
  fields: TicketFieldDef[];
  statuses: string[];
  allowedTransitions: Record<string, string[]>;
  priorities?: string[];         // optional — defaults to ['Low','Medium','High'] if omitted
};

// Ticket becomes generic: fixed envelope + an open bag for whatever the schema defines
type Ticket = {
  id: string;
  status: string;
  priority?: string;
  field_values: Record<string, unknown>;   // validated against TicketSchema.fields at write time
  created_at: string;
  updated_at: string;
};
```

`validateCreatePayload`, the `updateStatus` transition check, and `nextTicketId` all become schema-driven (take a `TicketSchema` argument) instead of importing the hardcoded constants. `createTicketRoutes(store, schema)` for a single fixed schema, or `createTicketRoutes(store, resolveSchema)` where `resolveSchema(req) => TicketSchema` for a host that needs a different schema per request (e.g. per tenant). Either way the module never needs to know *how* the host resolves a schema — a per-tenant DB row, a config file, a hardcoded object, anything — only that it receives one.

## 3. Why no data migration is ever needed

Because `field_values` is an open bag rather than fixed typed columns, adding, removing, or renaming a field definition never requires a schema migration on existing tickets — old tickets just keep whatever was in their `field_values` at the time, and the host's UI simply stops rendering a removed field going forward. Same for statuses: removing a status from `TicketSchema.statuses` doesn't touch tickets already sitting in that status, it just stops being offered as a transition target for new changes. This is the same pattern `products/booking` already uses for structured payloads (`attachments JSONB`, `staff_schedules.p_days JSONB`) — it's what makes self-serve config remotely tractable without a migration story bolted on.

## 4. What stays explicitly out of scope

- **No database opinion.** `TicketStore` interface unchanged in shape, still 100% host-implemented. A host wanting Postgres/Supabase-backed multi-tenant storage implements its own `TicketStore`, exactly like `json-file-store.ts` does today for the simple case.
- **No auth, no tenant model.** Schema *resolution* — which tenant, which schema — is 100% the host's `resolveSchema` callback. The module never sees a tenant ID, a user, or a session.
- **No settings/config UI.** A host that wants self-serve field/status editing builds that UI itself, against its own database, calling nothing but this module's `TicketStore`/`TicketSchema` shapes as the contract to satisfy.
- **No visual workflow-graph editor implied.** `allowedTransitions` is a plain `Record<string, string[]>`, the same mental shape as today's constant — a settings UI for it can be as simple as a checklist per status, not a node-graph editor.

## 5. Migration note for the one real consumer today

`products/ticket-tracking-relay` keeps working unchanged whenever this actually gets implemented — it just passes a static `TicketSchema` object matching today's 5 statuses / 3 priorities / 4 fields as a constant, functionally identical to what's hardcoded now. No behavior change for that product until someone actually wants per-tenant schemas.

## 6. Status

Design only. Not implemented: the `TicketSchema`-driven refactor of `core/`/`routes.ts` itself, any settings UI, any new product, any new database. Build from this whenever a real host needs self-serve configurability — this file is not a promise it happens next session.
