# Module Registry

> Source of truth สำหรับ path, maturity และ version ของทุก Module โดย version ต้องตรงกับ `modules/<path>/VERSION`

## Status Legend

- ⬜ Planned — ยังไม่มี implementation
- 🟡 In Progress / Designed — มี design หรือ source บางส่วน แต่ contract ยังไม่พร้อม
- 🧪 Pilot / Testing — implementation ครบระดับหนึ่งและกำลังพิสูจน์กับ use case จริง
- ✅ Completed — source, public entry point, tests, typecheck, docs และ version metadata ครบ

## Module Registry

| # | Module | Module Path | Priority | Status | Version |
|---:|---|---|:---:|---|:---:|
| 1 | Notification | `notification` | P0 | ✅ Completed | 0.2.0 |
| 2 | Config / Runtime | `config-runtime` | P0 | ✅ Completed | 0.1.0 |
| 3 | File Storage | `file-storage` | P0 | ✅ Completed | 0.1.0 |
| 4 | Webhook Receiver | `webhook-receiver` | P0 | ✅ Completed | 0.1.0 |
| 5 | Audit Log | `audit-log` | P0 | ✅ Completed | 0.1.0 |
| 6 | HTTP Client | `http-client` | P0 | ✅ Completed | 0.1.0 |
| 7 | Event Bus | `event-bus` | P1 | ✅ Completed | 0.1.0 |
| 8 | Payment Core + Stripe | `payment` | P1 | ✅ Completed | 0.1.0 |
| 9 | Subscription + Entitlement | `subscription` | P1 | ✅ Completed | 0.1.0 |
| 10 | Supabase Auth Helpers | `auth-supabase` | P1 | ✅ Completed | 0.2.0 |
| 11 | Tenant Context | `tenant-context` | P1 | ✅ Completed | 0.3.0 |
| 12 | Rate Limit | `rate-limit` | P1 | ✅ Completed | 0.1.0 |
| 13 | Feature Flags | `feature-flags` | P1 | ✅ Completed | 0.1.0 |
| 14 | Job / Retry | `job-retry` | P2 | ✅ Completed | 0.3.0 |
| 15 | Scheduler | `scheduler` | P2 | ✅ Completed | 0.3.0 |
| 16 | Import / Export | `import-export` | P2 | ✅ Completed | 0.2.0 |
| 17 | Health Check | `health-check` | P2 | ✅ Completed | 0.2.0 |
| 18 | AI Provider | `ai-provider` | P2 | ✅ Completed | 0.3.0 |
| 19 | Product Catalog | `product-catalog` | P1 | ✅ Completed | 0.1.0 |
| 20 | AI Workflow Engine | `ai-workflow-engine` | P2 | ✅ Completed | 0.3.0 |
| 21 | Enterprise Features | `enterprise-features` | P1 | ✅ Completed | 0.3.0 |

## Completion Gate

Pull request ที่เปลี่ยน Module สถานะ `✅ Completed` ต้องผ่าน CI ซึ่งรัน consistency check, `npm ci`, tests และ typecheck ของทุก Module ที่มี `package.json`

## Next Action

```
Module Hub v0.3.0 adds tested resiliency contracts, ownership-safe Redis locks, provider fallback, typed workflow state stores, and framework-neutral tenant resolution. OpenTelemetry integration remains a host-provided extension.
```
