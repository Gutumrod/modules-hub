# Tenant Context Module — DESIGN.md (Enterprise v0.2.0)

**Version:** 0.2.0 (P1, Advanced Isolation & Dynamic Resolution)
**Status:** Design & Research Complete (Phase 1).
**Language / runtime:** TypeScript, ES2022, strict mode.

---

## 1. Purpose & Architectural Objectives

The **Tenant Context Module** provides multi-tenant isolation, dynamic tenant resolution (Subdomain, Custom Domain, Headers), and Row Level Security (RLS) context binding.

> **CRITICAL BOUNDARY:**
> - v0.2.0 introduces **Dynamic Tenant Resolver** for multi-tenant SaaS architectures.
> - Adds strict context isolation for asynchronous execution contexts.

---

## 2. Core Domain Models & Interfaces (v0.2.0)

### 2.1 Tenant & Resolution Interfaces
```ts
export type TenantInfo = {
  id: string;
  slug: string;
  name: string;
  tier: 'free' | 'pro' | 'enterprise';
  metadata?: Record<string, unknown>;
};

export type TenantResolutionStrategy = 'subdomain' | 'header' | 'custom_domain';

export interface TenantResolver {
  resolveFromHeader(headerValue?: string): Promise<TenantInfo | null>;
  resolveFromHostname(hostname: string): Promise<TenantInfo | null>;
}
```
