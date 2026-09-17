# DomainHarness v0.1 SDK Documentation

Use this directory as the consumer/Agent entry point for `@kaicreator/domain-harness`.

## Read in this order

1. `DomainHarness_v0.1_SDK_USAGE.md` — short integration entry point and ownership boundaries.
2. `DomainHarness_v0.1_SDK_REFERENCE.md` — complete public API, Harness DSL, lifecycle, recovery and error reference.
3. `DomainHarness_v0.1_AGENT_MIGRATION_GUIDE.md` — step-by-step playbook and handoff prompt for coding Agents refactoring an existing project.

## Consumer rule

Until v0.1 is formally release-qualified/tagged, downstream projects should integrate an **exact DomainHarness commit SHA** and record that SHA in their own integration evidence. Do not depend on a moving branch as though it were a released package.

A downstream project should import only from:

```ts
import { ... } from '@kaicreator/domain-harness';
```

Do not import `src/`, `dist/` internal module paths, XState types, SQLite store classes, Runner internals or recovery internals.

## Ownership boundary

DomainHarness owns generic durable execution mechanics. The consuming project remains authoritative for:

- domain/business state and rules;
- application APIs and UI;
- databases/repositories;
- authentication/authorization;
- credentials and external clients;
- Tool implementations;
- AI provider/model/routing policy behind `AIOperationPort`.

## For coding Agents

Do not prompt an Agent with only “convert this project to DomainHarness”. Give it:

- the exact DomainHarness SHA;
- the SDK Reference;
- the Agent Migration Guide;
- the downstream project’s own PRD/architecture/development standard;
- one Critical Journey to migrate first.

Require a migration map before code changes and require every external side effect to have an explicit Tool effect classification.

## Current Script note

The v0.1 Runtime executes Loader-frozen Script source as JavaScript ESM in a Worker. Downstream Harness Script assets should therefore contain executable JavaScript/ESM syntax (for example `.mjs`), or be precompiled to JavaScript before the Harness is loaded. DomainHarness v0.1 does not perform TypeScript transpilation for Script assets at runtime.

## Release status

SDK documentation may be used for downstream refactor/integration before final v0.1 Release Qualification. That does **not** mean the version is tag/publish authorized. Release state is tracked separately in `docs/validation/DomainHarness_v0.1_VALIDATION_REPORT.md` and `docs/release/DomainHarness_v0.1_CLOSEOUT.md`.
