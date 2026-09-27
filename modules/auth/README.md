# @module-hub/auth

Provider-agnostic authentication context and authorization helpers. See [MODULE.md](./MODULE.md) and [DESIGN.md](./DESIGN.md) for setup and contracts.

## Security note (0.1.1)

For Supabase-shaped identities, authorization claims come only from `app_metadata` or explicit host resolvers. Generic identity payloads may provide normalized top-level `roles`, `tenantId`, and `permissions`. `user_metadata` is never an authorization source. JWT/Postgres roles `authenticated`, `anon`, and `service_role` are never treated as app roles. Supabase metadata is returned in separate `metadata.appMetadata` and `metadata.userMetadata` fields.
