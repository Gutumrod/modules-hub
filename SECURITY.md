# Security Policy

## Reporting a vulnerability

While this repository is private, report security issues directly to the repository owner. Do not include live credentials, production payloads, or customer data in an issue or pull request.

Before a public release, this file should be updated with a dedicated private reporting channel.

## Scope

Security-sensitive modules must preserve these principles:

- secrets are injected by the host and are never hard-coded;
- external effects pass through explicit adapters;
- risky actions can be gated by host policy or human approval;
- logs and errors redact sensitive fields;
- tests use mock credentials only.

