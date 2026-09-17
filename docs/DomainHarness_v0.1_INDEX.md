# DomainHarness v0.1 — Documentation Index

**Product scope:** FROZEN  
**Architecture:** FROZEN  
**Task DAG:** CLOSED — T-001..T-017 complete  
**Repository integration:** `v0.1` integrated to `main` via PR #65  
**Release status:** BLOCKED — owner-held Hidden Validation remains

## Authority order

1. `docs/product/DomainHarness_v0.1_PRD_FROZEN.md`, SHA-256 `4f19317dc46ae1eb888ff99bd4f50a21246483895fab16086341d0222a60e440`.
2. `docs/architecture/DomainHarness_v0.1_L2_ARCHITECTURE_EVIDENCE.md`.
3. `docs/implementation/DomainHarness_v0.1_TASK_DAG.md`.
4. Task-specific L3 evidence for T-006, T-009, T-010, T-011 and T-012.
5. Public package contracts/tests in `packages/domain-harness/`.
6. Descriptive architecture / Domain Data / Harness / SDK documents derived from the authorities and current implementation.
7. `docs/validation/DomainHarness_v0.1_VALIDATION_REPORT.md` plus exact-SHA GitHub evidence.
8. `docs/release/DomainHarness_v0.1_CLOSEOUT.md` and #39 for the current release verdict.

The bilingual technical documents below are explanatory/authoring specifications. They do not reopen frozen product scope or technology decisions.

## Entry points

- repository overview: `README.md`;
- documentation map: `docs/README.md`;
- Domain Data: `docs/domain-data/README.md`;
- Harness: `docs/harness/README.md`;
- SDK/consumer map: `docs/sdk/README.md`;
- this version index: `docs/DomainHarness_v0.1_INDEX.md`.

## Detailed architecture / 详细架构

Frozen architecture authority:

- `docs/architecture/DomainHarness_v0.1_L2_ARCHITECTURE_EVIDENCE.md`

Descriptive detailed architecture:

- English: `docs/architecture/DomainHarness_ARCHITECTURE.md`
- 中文：`docs/architecture/DomainHarness_ARCHITECTURE.zh-CN.md`

Integration boundary:

- English: `docs/architecture/DOMAINHARNESS_INTEGRATION_MODEL.md`
- 中文：`docs/architecture/DOMAINHARNESS_INTEGRATION_MODEL.zh-CN.md`

The detailed architecture explains Loader/Compiler/Runner/Step Journal/SQLite/Worker boundaries, portable control state, Child Workflow frame stack, deterministic time, definition lock, deployment topology and domain authority separation.

## Domain Data specification / Domain Data 规范

Start at `docs/domain-data/README.md`.

- English specification: `docs/domain-data/DOMAIN_DATA_SPEC.md`
- 中文规范：`docs/domain-data/DOMAIN_DATA_SPEC.zh-CN.md`
- English authoring guide: `docs/domain-data/DOMAIN_DATA_AUTHORING_GUIDE.md`
- 中文编写指南：`docs/domain-data/DOMAIN_DATA_AUTHORING_GUIDE.zh-CN.md`

These documents distinguish domain authority, executable Harness assets, reference knowledge, patterns/recipes, examples and validation/evidence. They also define how humans/Agents should extract Domain Data from an existing project without turning every domain concept into a Runtime primitive.

## Harness technical documentation / Harness 技术文档

Start at `docs/harness/README.md`.

- English technical spec: `docs/harness/HARNESS_TECHNICAL_SPEC.md`
- 中文技术规范：`docs/harness/HARNESS_TECHNICAL_SPEC.zh-CN.md`
- English authoring guide: `docs/harness/HARNESS_AUTHORING_GUIDE.md`
- 中文编写指南：`docs/harness/HARNESS_AUTHORING_GUIDE.zh-CN.md`

The technical spec centralizes the v0.1 executable definition contract: manifest, load/static validation, Workflow states/routes, JSONata scope, Skill/AI, Tool effects, Script, Child Workflow, waiting events, visits/attempts, persistence/recovery, definition lock, lifecycle and normalized errors.

The authoring guide provides the primitive decision model, recovery-aware Tool design, Skill/schema design, Workflow/Child boundaries, route/error semantics, anti-patterns and validation checklist.

## Public SDK

Use these files in order:

1. `docs/sdk/DomainHarness_v0.1_SDK_USAGE.md` — short integration/ownership overview;
2. `docs/sdk/DomainHarness_v0.1_SDK_REFERENCE.md` — full public API/DSL/lifecycle/recovery reference;
3. `docs/sdk/DomainHarness_v0.1_AGENT_MIGRATION_GUIDE.md` — downstream refactor playbook and Agent handoff template.

Package-root embedding example: `packages/domain-harness/README.md`.

Factory:

```ts
createDomainHarness({ root, sqlitePath, ai, tools? })
```

Public lifecycle:

```text
start / send / wait / resume / cancel / get / listRuns
```

XState, SQLite Store, Runner, Recovery Coordinator and internal module paths are not public API.

## Recommended Agent reading order

For refactoring another domain project:

```text
1. downstream frozen PRD/architecture
2. docs/domain-data/DOMAIN_DATA_SPEC(.zh-CN).md
3. docs/domain-data/DOMAIN_DATA_AUTHORING_GUIDE(.zh-CN).md
4. docs/architecture/DOMAINHARNESS_INTEGRATION_MODEL(.zh-CN).md
5. docs/harness/HARNESS_AUTHORING_GUIDE(.zh-CN).md
6. docs/harness/HARNESS_TECHNICAL_SPEC(.zh-CN).md
7. docs/sdk/DomainHarness_v0.1_AGENT_MIGRATION_GUIDE.md
8. one real Critical Journey
```

Do not ask an Agent merely to “convert the project to DomainHarness.” Require a migration map, authority analysis and Tool effect classification before implementation.

## Runtime and recovery

See `docs/operations/DomainHarness_v0.1_STORAGE_RECOVERY.md`.

Core lock:

```text
XState = control-flow reducer
Runner + Step Journal = durable execution/replay/recovery authority
```

## Implementation

- `docs/implementation/DomainHarness_v0.1_TASK_DAG.md` — terminal T-001..T-017 execution record;
- task-specific L3 documents — high-risk implementation evidence.

Task completion and repository integration remain distinct from formal Release Qualification.

## Validation and closeout

Visible/supplemental evidence includes:

- T-014 synthetic Critical Journey: PASS;
- T-015 Tally external validation: PASS;
- T-016 City Atlas external validation: PASS;
- #42 dual-OS abrupt-kill durability: PASS 750/750;
- quality/test hardening #49/#50/#51 and #52/#53: COMPLETE;
- frozen PRD provenance #54/#55: COMPLETE;
- minimal Woodpecker config #59/#63: COMPLETE;
- SDK/Agent documentation #66 and status reconciliation #67: COMPLETE;
- #60 successor visible regression: PASS on the validated executable/package tree — **117/117, 0 skipped**, package consumer + Tally + City Atlas PASS;
- later docs-only commits may carry executable/package evidence only through recorded Git tree/diff equivalence;
- PR #65: v0.1.0 version line integrated to `main` with tree equivalence recorded;
- #57: Woodpecker repository connection/context exists, but actual verify execution is infrastructure-blocked by the agent local backend/container configuration;
- #56: `main` protection is an administrator follow-up;
- owner-held Hidden Validation: NOT_RUN.

See `docs/validation/DomainHarness_v0.1_VALIDATION_REPORT.md`, `docs/release/DomainHarness_v0.1_CLOSEOUT.md` and #39 for release-state evidence.

## v0.1 known limitations

Intentional non-goals, not implementation gaps:

- no generic DAG execution;
- no parallel workflow composition;
- no distributed/multi-process execution or server control plane;
- no PostgreSQL/storage abstraction or ORM;
- no visual workflow designer or generic Admin Console;
- Child Workflow is same-Harness only;
- Script Workers are resource/isolation boundaries, not hostile-code sandboxes;
- Host Tools own credentials and real side effects;
- active-run continuation is definition-locked by `definitionHash` and `executionEngineMajor`;
- Script execution uses Loader-frozen JavaScript ESM source; Runtime does not transpile TypeScript Script assets at execution time.

## Release rule

Repository integration, task completion, SDK/technical-document availability and visible-gate PASS do not by themselves assert formal Release PASS. Owner-held Hidden Validation remains tracked by #39. Environment/admin items #57/#56 are separate process follow-ups and are not known Runtime defects.
