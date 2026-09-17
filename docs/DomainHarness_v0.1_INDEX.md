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
6. `docs/validation/DomainHarness_v0.1_VALIDATION_REPORT.md` plus exact-SHA GitHub Issue evidence.
7. `docs/release/DomainHarness_v0.1_CLOSEOUT.md` for the current release verdict.

No document in this closeout pack reopens product scope or the frozen technology choices.

## Entry points

- repository overview: `README.md`;
- documentation map: `docs/README.md`;
- this version index: `docs/DomainHarness_v0.1_INDEX.md`.

## Public SDK

See `packages/domain-harness/README.md` and `docs/sdk/DomainHarness_v0.1_SDK_USAGE.md`.

Factory:

```ts
createDomainHarness({ root, sqlitePath, ai, tools? })
```

Public lifecycle:

```text
start / send / wait / resume / cancel / get / listRuns
```

XState, SQLite schema/store, Runner, recovery coordinator and internal module paths are not public API.

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
- actual Woodpecker run #57: ENV-BLOCKED because the repository is not connected to Woodpecker;
- branch protection #56: pending admin action after the real Woodpecker status context is known;
- final successor visible rerun #60: NOT_RUN;
- owner-held Hidden Validation: NOT_RUN.

See `docs/validation/DomainHarness_v0.1_VALIDATION_REPORT.md` and `docs/release/DomainHarness_v0.1_CLOSEOUT.md` for exact status.

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

## Release rule

Repository integration or task completion is not a Release PASS. After this documentation concern merges, freeze the exact successor SHA, execute #60, then run owner-held Hidden Validation. Only after those gates PASS with no unresolved P0/P1 Runtime blocker may the closeout verdict change to `READY` and tag/publish/release be authorized.
