# Module Hub — Common Rules

**Status:** Current governance reference
**Reconciled:** 2026-09-04

## Authority

Current module version and maturity come from:
1. `../REGISTRY.md`
2. `../<module>/VERSION`
3. `../<module>/MODULE.md`
4. `../<module>/DESIGN.md`
5. live source/tests when documentation and implementation disagree

`REGISTRY.md` currently contains 24 modules: 23 `✅ Completed` and 1 `🧪 Pilot / Testing` (`line-oa-ai-module`).

Files in `briefs/` other than this document and `99-dependency-map-and-sequence.md` are historical implementation inputs. Their old Planned/Stage labels are not current status.

## Architecture rule

A Module Hub component is normally an embedded reusable building block:

```text
Host Project
    ↓
Copied Module
    ↓
Adapter / Provider
```

It is not a central deployed service unless that module explicitly declares otherwise.

## Domain boundary

Core modules must stay generic. Do not hard-code a consuming product, tenant, shop, booking flow, ticket workflow, or other product-specific domain into shared core contracts.

Use generic concepts such as `entity`, `resource`, `actor`, `event`, `subject`, `account`, and `tenant` only where the module contract genuinely requires them.

## Config and secrets

The host owns runtime configuration and secrets:

```text
Runtime / Secret Store
        ↓
Host Integration
        ↓
Typed Config
        ↓
Copied Module
```

Core modules do not read host environment variables or secret stores directly unless the module contract explicitly documents a runtime-specific adapter boundary.

## Provider / adapter rule

Core behavior should depend on contracts, not provider SDKs. Provider-specific code belongs under `adapters/` or `providers/` when applicable. Adding an adapter should not require business-domain changes to core.

## Consumer rule

WSTERA consumers must follow the canonical Module Reuse Check in `saas-product-hub/docs/platform/MODULE-REUSE-POLICY.md`: inspect first, classify, copy-and-own when selected, and record provenance. Upstream changes are separate scoped work.

## Canonical module documentation set

Every registered module must have:
- `VERSION`
- `package.json` version matching `VERSION`
- `MODULE.md` with current version/status and public operational contract
- `DESIGN.md` with current architecture/boundaries
- a public entry point
- tests
- an integration example, either under `examples/` or as an integration example file documented by the module

`README.md` per module is optional; it is not a maturity gate.

## Maturity

Registry status is authoritative. `✅ Completed` means the repository currently records source, public entry point, tests/typecheck evidence, docs, and version metadata as complete. It does **not** by itself prove production readiness for every host, provider, or deployment environment.

`🧪 Pilot / Testing` means the module still has a named validation gap. For `line-oa-ai-module`, the current open gate is real LINE OA end-to-end validation plus the remaining persistent-session reference work recorded in its docs.

## Change rule

When source contract changes, update `VERSION`/package metadata as required by the change policy and update `MODULE.md`, `DESIGN.md`, `REGISTRY.md`, `ROADMAP.md`, and `INDEX.md` in the same scoped work when they are affected. Historical briefs remain historical; do not rewrite them to fake chronology.
