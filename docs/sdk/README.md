# DomainHarness SDK Documentation

Use this directory as the consumer/Agent entry point for `@kaicreator/domain-harness`.

## Current line: v0.3

1. `DomainHarness_v0.3_SDK_USAGE.md` — v0.3 integration entry point: what v0.3 adds, runnable examples, ownership boundaries.
2. `DomainHarness_v0.3_SDK_REFERENCE.md` — complete v0.3 public API reference (assembly, governance, admission, promotion/activation, Runtime Evidence, error codes).
3. `../migration/DomainHarness_v0.2_TO_v0.3.md` — v0.2 → v0.3 migration, including the forbidden floating-authority substitutions.
4. `../integration/DomainHarness_v0.3_HOST_INTEGRATION.md` — durable Node/Expo host setup and the validation evidence behind durability claims.

Executable v0.3 examples (run in CI, import the published package by name) live in `packages/domain-harness/tests/examples/`.

## v0.1 line (legacy)

1. `DomainHarness_v0.1_SDK_USAGE.md` — short integration entry point and ownership boundaries.
2. `DomainHarness_v0.1_SDK_REFERENCE.md` — complete public API, Harness DSL, lifecycle, recovery and error reference.
3. `DomainHarness_v0.1_AGENT_MIGRATION_GUIDE.md` — step-by-step playbook and handoff prompt for coding Agents refactoring an existing project.

## Consumer rule

Until v0.1 is formally release-qualified/tagged, downstream projects should integrate an **exact DomainHarness commit SHA** and record that SHA in their own integration evidence. Do not depend on a moving branch as though it were a released package.

### Supported install spec (issue #299)

There is no npm release; the packages are consumed as exact-SHA git dependencies. The built `dist/` trees of `@kaicreator/domain-harness` and `@kaicreator/domain-harness-compiler` are committed to the repository, so a git install delivers a usable package without lifecycle scripts:

```sh
pnpm add "github:kaicreator-mm/domain-harness#<exact-sha>&path:packages/domain-harness" \
          "github:kaicreator-mm/domain-harness#<exact-sha>&path:packages/domain-harness-compiler"
```

- Pin `<exact-sha>` to the full commit SHA you validated against (the same SHA for every DomainHarness package you consume).
- The `&path:` subdirectory form is required (monorepo packages); pnpm resolves it — npm does not support git subdirectory dependencies.
- `@kaicreator/domain-harness-compiler` declares the runtime as a **peer dependency** (`0.2.0`), satisfied by the `@kaicreator/domain-harness` install above; installing the compiler alone would try to fetch an unpublished npm version and fail by design.
- `npm run build` in the DomainHarness repository verifies via `scripts/check-committed-dist.mjs` that the committed `dist/` trees always match a fresh build of the committed sources.

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
