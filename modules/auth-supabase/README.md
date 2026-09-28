# @module-hub/auth-supabase

Supabase Auth context and authorization helpers. See [MODULE.md](./MODULE.md) and [DESIGN.md](./DESIGN.md) for setup and contracts.

## Security note (0.2.1)

Default authorization claims come only from Supabase `app_metadata` or explicit host resolvers. User-editable `user_metadata` is never an authorization source. JWT/Postgres roles `authenticated`, `anon`, and `service_role` are never treated as app roles. Returned `appMetadata` and `userMetadata` remain separate.
