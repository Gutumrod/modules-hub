# `line-oa-ai-module` — Design Notes & Improvement Plan

**Version:** 0.1.0
**Status:** 🧪 Pilot / Testing
**Documentation Authority:** Current version/status follow `../REGISTRY.md`; this document describes the module contract/design for that registered version.

## Scope of this document

This tracks planned improvements to the **core module** — the thing copied into a destination
project per Module Hub's copy-and-own convention (see repo root `README.md`). It does not
describe, require, or depend on what any specific destination project builds after copying.
Once a copy is adapted at its destination, that adaptation is owned there, not tracked back
here — this document is about what ships in the *next* copy, generalized for any future user of
the module, not a sync target for any one deployment.

---

## §persistent-session-store — planned, not yet built

**Gap:** the only `SessionStore` implementation shipped in core is `MemorySessionStore`
(in-process `Map`). This means:
- A process restart or redeploy loses every active conversation's state and history.
- The module cannot run as more than one instance (no shared state across replicas).

This is a real constraint for any host running the module past a low-traffic pilot — not a
brand-specific problem, a core-module one. (`MODULE.md` used to claim a `RedisSessionStore`
existed alongside it; it never did — corrected 2026-08-20.)

**Why now:** informed by, but not copying, an independent implementation a downstream user
built for their own needs — that confirmed the `SessionStore` interface (`get`/`set`/`delete`/
`clear`) is sufficient as-is to support a persistent backend with no interface changes. That's
useful signal about the interface's shape; the destination's actual code stays theirs per
copy-and-own.

**Plan:**
1. Ship a **reference persistent `SessionStore` implementation** as an example/adapter, not a
   required dependency — keep the core's "Zero External Runtime Dependency" feature intact.
   Candidate: a plain-SQL implementation written against generic `pg`-style query semantics
   (`get`/`upsert`/`delete` against one table: `user_id`, `state`, `context_data` (jsonb),
   `history` (jsonb), `last_interaction`) — works against any Postgres, not a specific vendor's
   SDK. Ship it under `examples/` or a `adapters/session-store/` folder, not `core/`, so hosts
   opt in explicitly.
2. Document the interface contract clearly enough that a host can write their own adapter for
   *any* backend (Redis, SQLite, Cloudflare KV, DynamoDB, whatever fits their infra) without
   needing this module's help — the interface is the product, not any one backend's code.
3. Add a stale-row cleanup note (expiry-on-read only, as currently designed, needs no active
   sweep) and an explicit "at-least-once delivery, dedupe in `history` is the host's job" note if
   a queue/worker sits in front of a future implementation.
4. Update `MODULE.md`'s feature list once an example ships — currently corrected to describe
   the interface honestly (pluggable, one implementation shipped) rather than overclaim.

**Explicitly out of scope for core:** any business-logic patterns discovered downstream (safety
rules hardcoded against a specific bot persona, product-catalog matching, queue-density
awareness, notification integrations) — those are legitimately destination-owned per copy-and-
own and do not belong in this module regardless of how well they worked somewhere.

**Status:** Planned, not started. No implementation exists in core as of 2026-08-20.
