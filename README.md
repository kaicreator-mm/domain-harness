# DomainHarness

DomainHarness is the shared **Domain Harness Runtime** and contract SDK used by domain products. It is an embedded TypeScript/Node.js runtime for executing persistent, resumable workflows composed of Skills, Tools, Expressions, Scripts and Child Workflows.

Package: `@kaicreator/domain-harness`  
Target: v0.1  
Status: implementation complete; final successor-candidate release qualification still in progress.

## What belongs here

DomainHarness owns generic execution mechanics:

- workflow/state/event execution;
- Skill → AI Operation invocation;
- host Tool execution;
- deterministic JSONata expressions;
- trusted Script Worker execution;
- Child Workflow composition;
- SQLite persistence/journaling;
- waiting/resume/cancel lifecycle;
- crash recovery and definition locking;
- JSON Schema validation and normalized errors.

Domain semantics do **not** belong here. Tally, Formula, Cairn, Forge and City Atlas keep their own domain authority.

## Public API

```ts
import { createDomainHarness } from '@kaicreator/domain-harness';

const harness = await createDomainHarness({
  root: '/path/to/harness',
  sqlitePath: '/path/to/runtime.sqlite',
  ai,
  tools,
});
```

Lifecycle operations:

```text
start / send / wait / resume / cancel / get / listRuns
```

XState, SQLite store/Runner internals and engine snapshots are not public API.

## SDK documentation for downstream projects

Start with `docs/sdk/README.md`.

- `docs/sdk/DomainHarness_v0.1_SDK_USAGE.md` — short integration entry point;
- `docs/sdk/DomainHarness_v0.1_SDK_REFERENCE.md` — complete consumer API/DSL/lifecycle/recovery reference;
- `docs/sdk/DomainHarness_v0.1_AGENT_MIGRATION_GUIDE.md` — coding-Agent migration workflow, acceptance checklist and handoff prompt.

Until v0.1 is formally release-qualified/tagged, downstream projects should pin an **exact DomainHarness commit SHA/tarball** rather than consume a moving branch as though it were a release.

A downstream project remains authoritative for its domain/business state, API, database, authentication/authorization, credentials, external clients and AI provider/model strategy. DomainHarness provides generic durable execution mechanics only.

## Canonical development commands

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm pack -w @kaicreator/domain-harness
```

`npm test` builds first and includes the plain-ESM host regression.

## Documentation

Start with `docs/README.md` and `docs/DomainHarness_v0.1_INDEX.md`.

- frozen Product authority: `docs/product/DomainHarness_v0.1_PRD_FROZEN.md`, SHA-256 `4f19317dc46ae1eb888ff99bd4f50a21246483895fab16086341d0222a60e440`;
- architecture: `docs/architecture/DomainHarness_v0.1_L2_ARCHITECTURE_EVIDENCE.md`;
- terminal Task DAG: `docs/implementation/DomainHarness_v0.1_TASK_DAG.md`;
- SDK: `docs/sdk/README.md`;
- storage/recovery: `docs/operations/DomainHarness_v0.1_STORAGE_RECOVERY.md`;
- validation: `docs/validation/DomainHarness_v0.1_VALIDATION_REPORT.md`;
- release closeout: `docs/release/DomainHarness_v0.1_CLOSEOUT.md`.

## v0.1 boundaries

v0.1 intentionally excludes static parallel composition, generic DAG execution, dynamic spawn, distributed execution, storage abstraction/PostgreSQL, server/admin console, visual workflow design, full XState DSL passthrough and hostile-code sandboxing.

## Current release state

The historical visible candidate `edbe2b53c936107ba4dfbb4eef7aef5408c26b39` passed the visible release gates. Post-candidate quality hardening (#49/#50/#51), canonical test-flow hardening (#52/#53), frozen PRD provenance (#54/#55), supplemental dual-OS durability #42, documentation closure (#58/#64), and minimal Woodpecker configuration (#59/#63) are complete on the `v0.1` line.

The SDK documentation may be used by downstream projects to begin exact-SHA integration/refactoring before formal release qualification. That does not authorize tag/publish/release.

Remaining before release qualification:

- freeze/update #60 to the exact `v0.1` SHA after all current documentation concerns merge;
- execute visible rerun #60;
- run owner-held Hidden Validation;
- #57/#56 remain repository-process follow-ups because this repository is not yet connected to Woodpecker and `main` protection cannot require an unknown status context.

Therefore v0.1 is **not yet authorized for tag/publish/release**.
