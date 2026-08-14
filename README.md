# Module Hub

Module Hub is a collection of dependency-light TypeScript building blocks for SaaS applications. Each module is designed to be copied into a project, adapted to that project's requirements, and owned by the destination project.

## Design goals

- Framework-agnostic core logic
- Explicit contracts and dependency injection
- Adapters separated from core behavior
- No direct access to host secrets from core modules
- Tests and integration examples alongside each implemented module
- Copy-and-own usage instead of cross-repository runtime imports

## Repository layout

```text
modules/
  <module-name>/      Source, tests, design, and integration examples
  briefs/             Shared implementation briefs and dependency map
  REGISTRY.md         Module status
  ROADMAP.md          Planned sequence and milestones
INDEX.md              Detailed catalog and usage map
utilities/            Small utility drafts and reusable patterns
```

See [INDEX.md](./INDEX.md) for the complete module catalog, entry points, and usage rules.

## Using a module

1. Select a module from [INDEX.md](./INDEX.md).
2. Copy the complete module directory into the destination project.
3. Read its `MODULE.md`, `DESIGN.md`, and integration example.
4. Install and test dependencies inside the destination project.
5. Adapt only the copied version to project-specific requirements.

Do not import modules across repositories using relative filesystem paths. Module Hub is a source library, not a deployed runtime or a monorepo package registry.

## Development status

Modules have different maturity levels. Check [modules/REGISTRY.md](./modules/REGISTRY.md) and each module's documentation before production use.

## Security

Do not commit credentials or production data. Examples and tests use mock values only. Host applications must inject secrets and external services through explicit configuration or adapters.

## License

This repository is public, but no open-source license has been selected. Public visibility does not grant reuse rights beyond applicable law; add a license before distributing Module Hub as open source.
