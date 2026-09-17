# DomainHarness

DomainHarness is the shared **Domain Harness Runtime** and contract SDK used by domain products. It is an embedded TypeScript/Node.js runtime for executing persistent, resumable workflows composed of Skills, Tools, Expressions, Scripts and Child Workflows.

Package: `@kaicreator/domain-harness`  
Version line: v0.1 / package `0.1.0`  
Repository integration: v0.1.0 code line integrated to `main` via PR #65  
Formal Release Qualification: owner-held Hidden Validation remains

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

XState, SQLite Store/Runner internals and engine snapshots are not public API.

## Technical documentation / 技术文档

Start with `docs/README.md` and `docs/DomainHarness_v0.1_INDEX.md`.

### Architecture / 架构

- English: `docs/architecture/DomainHarness_ARCHITECTURE.md`
- 中文：`docs/architecture/DomainHarness_ARCHITECTURE.zh-CN.md`
- English integration model: `docs/architecture/DOMAINHARNESS_INTEGRATION_MODEL.md`
- 中文集成模型：`docs/architecture/DOMAINHARNESS_INTEGRATION_MODEL.zh-CN.md`

### Domain Data

- Index: `docs/domain-data/README.md`
- English spec: `docs/domain-data/DOMAIN_DATA_SPEC.md`
- 中文规范：`docs/domain-data/DOMAIN_DATA_SPEC.zh-CN.md`
- English authoring: `docs/domain-data/DOMAIN_DATA_AUTHORING_GUIDE.md`
- 中文编写：`docs/domain-data/DOMAIN_DATA_AUTHORING_GUIDE.zh-CN.md`

### Harness

- Index: `docs/harness/README.md`
- English technical spec: `docs/harness/HARNESS_TECHNICAL_SPEC.md`
- 中文技术规范：`docs/harness/HARNESS_TECHNICAL_SPEC.zh-CN.md`
- English authoring: `docs/harness/HARNESS_AUTHORING_GUIDE.md`
- 中文编写：`docs/harness/HARNESS_AUTHORING_GUIDE.zh-CN.md`

### SDK / downstream Agent

Start with `docs/sdk/README.md`.

- `docs/sdk/DomainHarness_v0.1_SDK_USAGE.md` — short integration entry point;
- `docs/sdk/DomainHarness_v0.1_SDK_REFERENCE.md` — complete public API/DSL/lifecycle/recovery reference;
- `docs/sdk/DomainHarness_v0.1_AGENT_MIGRATION_GUIDE.md` — coding-Agent migration workflow, acceptance checklist and handoff prompt.

A downstream project remains authoritative for its domain/business state, API, database, authentication/authorization, credentials, external clients and AI provider/model strategy. DomainHarness provides generic durable execution mechanics only.

## Recommended downstream Agent reading order

```text
Downstream frozen PRD/architecture
→ Domain Data Spec
→ Domain Data Authoring Guide
→ DomainHarness Integration Model
→ Harness Authoring Guide
→ Harness Technical Spec
→ SDK Agent Migration Guide
→ one real Critical Journey
```

Do not ask an Agent only to “convert the project to DomainHarness.” Require it to identify domain authority, classify deterministic vs AI work, enumerate external side effects, classify Tool effects and produce a migration map before implementation.

## Canonical development commands

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm pack -w @kaicreator/domain-harness
```

`npm test` builds first and includes the plain-ESM host regression.

## Formal authorities and evidence

- frozen Product authority: `docs/product/DomainHarness_v0.1_PRD_FROZEN.md`, SHA-256 `4f19317dc46ae1eb888ff99bd4f50a21246483895fab16086341d0222a60e440`;
- frozen architecture: `docs/architecture/DomainHarness_v0.1_L2_ARCHITECTURE_EVIDENCE.md`;
- terminal Task DAG: `docs/implementation/DomainHarness_v0.1_TASK_DAG.md`;
- storage/recovery: `docs/operations/DomainHarness_v0.1_STORAGE_RECOVERY.md`;
- validation: `docs/validation/DomainHarness_v0.1_VALIDATION_REPORT.md`;
- release closeout: `docs/release/DomainHarness_v0.1_CLOSEOUT.md` and #39.

The new detailed architecture, Domain Data and Harness documents are descriptive/authoring companions; they do not override Frozen PRD/L2 or executable source/tests.

## v0.1 boundaries

v0.1 intentionally excludes static parallel composition, generic DAG execution, dynamic spawn, distributed execution, storage abstraction/PostgreSQL, server/admin console, visual workflow design, full XState DSL passthrough and hostile-code sandboxing.

## Validation and release state

The executable/package tree validated in #60 passed **117/117 tests with 0 skipped**, package/plain-Node consumer validation, focused recovery/Worker/definition-lock suites and Tally + City Atlas external runners.

The v0.1.0 version line is integrated to `main`. This establishes the repository baseline; it does not claim owner-held Hidden Validation has passed.

Remaining formal Release Qualification item:

- owner-held Hidden Validation tracked by #39.

Repository-process follow-ups are separate:

- #57 — Woodpecker is connected and emits `ci/woodpecker/pr/verify`, but the current agent backend cannot execute the configured container image and remains infrastructure-blocked;
- #56 — `main` protection/ruleset is an administrator follow-up after a green Woodpecker run.

Until formal tag/package publication is authorized, downstream consumers should pin an exact DomainHarness commit/tarball rather than assume a floating branch is a released dependency.
