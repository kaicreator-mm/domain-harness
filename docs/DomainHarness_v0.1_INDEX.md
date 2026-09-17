# DomainHarness v0.1 — Documentation Index

**Product scope:** FROZEN  
**Architecture:** FROZEN  
**Task DAG:** CLOSED — T-001..T-017 complete  
**Version integration branch:** `v0.1`  
**Release status:** BLOCKED — final successor visible rerun and Hidden Validation remain

## Authority order

1. `docs/product/DomainHarness_v0.1_PRD_FROZEN.md`, SHA-256 `4f19317dc46ae1eb888ff99bd4f50a21246483895fab16086341d0222a60e440`.
2. `docs/architecture/DomainHarness_v0.1_L2_ARCHITECTURE_EVIDENCE.md`.
3. `docs/implementation/DomainHarness_v0.1_TASK_DAG.md`.
4. Task-specific L3 evidence for T-006, T-009, T-010, T-011 and T-012.
5. Public package contracts and tests in `packages/domain-harness/`.
6. Consumer SDK documentation in `docs/sdk/`, derived from the public contracts/current v0.1 implementation.
7. `docs/validation/DomainHarness_v0.1_VALIDATION_REPORT.md` plus exact-SHA GitHub Issue evidence.
8. `docs/release/DomainHarness_v0.1_CLOSEOUT.md` for the current release verdict.

No document in this closeout pack reopens product scope or the frozen technology choices.

## Entry points

- repository overview: `README.md`;
- documentation map: `docs/README.md`;
- SDK/consumer map: `docs/sdk/README.md`;
- this version index: `docs/DomainHarness_v0.1_INDEX.md`.

## Public SDK

Use these files in order:

1. `docs/sdk/DomainHarness_v0.1_SDK_USAGE.md` — short integration/ownership overview;
2. `docs/sdk/DomainHarness_v0.1_SDK_REFERENCE.md` — full API/DSL/lifecycle/recovery reference;
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

XState, SQLite schema/store, Runner, recovery coordinator and internal module paths are not public API.

### Downstream Agent rule

Do not ask an Agent merely to “convert the project to DomainHarness”. Give it the exact DomainHarness SHA, SDK Reference, Agent Migration Guide, downstream project authority and one Critical Journey. Require a migration map and Tool effect classification before implementation.

Until release/tag authorization, downstream consumers should pin an exact DomainHarness SHA/tarball. A moving `v0.1` branch is not a released dependency.

## Runtime and recovery

See `docs/operations/DomainHarness_v0.1_STORAGE_RECOVERY.md`.

Core lock:

```text
XState = control-flow reducer
Runner + Step Journal = durable execution/replay/recovery authority
```

## Implementation

- `docs/implementation/DomainHarness_v0.1_TASK_DAG.md` — terminal T-001..T-017 execution record;
- task-specific L3 documents — required high-risk implementation evidence.

Task completion is separate from Release Qualification.

## Validation and closeout

- T-014 synthetic Critical Journey: PASS;
- T-015 Tally external validation: PASS on historical visible candidate;
- T-016 City Atlas external validation: PASS on historical visible candidate;
- #42 dual-OS abrupt-kill durability: PASS 750/750;
- post-candidate quality/test hardening #49/#50/#51 and #52/#53: COMPLETE / MERGED;
- frozen PRD repository provenance #54/#55: COMPLETE / MERGED;
- minimal Woodpecker config #59/#63: COMPLETE / MERGED;
- documentation/process reconciliation #58/#64: COMPLETE / MERGED;
- actual Woodpecker run #57: ENV-BLOCKED because the repository is not connected to Woodpecker;
- branch protection #56: pending admin action after the real Woodpecker status context is known;
- final successor visible rerun #60: must be pinned to the exact `v0.1` SHA after this SDK documentation concern merges;
- owner-held Hidden Validation: NOT_RUN.

See `docs/validation/DomainHarness_v0.1_VALIDATION_REPORT.md` and `docs/release/DomainHarness_v0.1_CLOSEOUT.md` for exact release status.

## v0.1 known limitations

The following are intentionally outside v0.1 and are not implementation gaps:

- no generic DAG execution;
- no parallel workflow composition;
- no distributed/multi-process execution or server control plane;
- no PostgreSQL/storage abstraction or ORM;
- no visual workflow designer or Admin Console;
- Child Workflow is same-Harness only;
- Script Workers are resource/isolation boundaries, not hostile-code security sandboxes;
- Host Tools own credentials and real side effects; Runtime does not provide a secret store;
- active-run continuation is definition-locked by `definitionHash` and `executionEngineMajor`.

Current Script implementation executes Loader-frozen JavaScript ESM source in a Worker and does not perform runtime TypeScript transpilation; consumers should use executable JavaScript/ESM Script assets or precompile them before Harness load.

## Release rule

Repository integration, task completion, or SDK-document availability is not a Release PASS. After this SDK documentation concern merges, update #60 to the resulting exact successor SHA, execute the visible gates, then run owner-held Hidden Validation. Only after those gates PASS with no unresolved P0/P1 Runtime blocker may the closeout verdict change to `READY` and tag/publish/release be authorized.
