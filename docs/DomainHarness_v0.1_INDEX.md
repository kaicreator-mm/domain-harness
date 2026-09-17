# DomainHarness v0.1 — Documentation Index

**Product scope:** FROZEN  
**Architecture:** FROZEN  
**Version integration branch:** `v0.1`  
**Release status:** NOT QUALIFIED — mandatory validation remains open

## Authority order

1. Frozen DomainHarness v0.1 PRD, SHA-256 `4f19317dc46ae1eb888ff99bd4f50a21246483895fab16086341d0222a60e440`.
2. `docs/architecture/DomainHarness_v0.1_L2_ARCHITECTURE_EVIDENCE.md`.
3. `docs/implementation/DomainHarness_v0.1_TASK_DAG.md`.
4. Task-specific L3 evidence for T-006, T-009, T-010, T-011 and T-012.
5. Public package contracts and tests in `packages/domain-harness/`.
6. Validation evidence under `docs/validation/` and linked GitHub Issues.

No document in this closeout pack reopens product scope or the frozen technology choices.

## Public SDK

See:

- `packages/domain-harness/README.md` — minimal package-root embedding example.
- `docs/sdk/DomainHarness_v0.1_SDK_USAGE.md` — lifecycle, Tool and AI port usage rules.

The v0.1 factory is:

```ts
createDomainHarness({ root, sqlitePath, ai, tools? })
```

The returned public lifecycle is limited to:

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

## Validation and closeout

- `docs/validation/DomainHarness_v0.1_T014_CRITICAL_JOURNEYS.md` — synthetic Critical Journey matrix.
- `docs/validation/DomainHarness_v0.1_T015_TALLY_EXTERNAL.md` — Tally external-domain evidence.
- `docs/validation/DomainHarness_v0.1_T016_CITY_ATLAS_EXTERNAL.md` — City Atlas external-domain evidence.
- `docs/validation/DomainHarness_v0.1_VALIDATION_REPORT.md` — current exact validation state.
- `docs/validation/DomainHarness_v0.1_HIDDEN_VALIDATION_PREP.md` — held-out validation execution contract.

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

`v0.1` must not be merged to `main` or tagged as release-qualified until the mandatory validation report reaches PASS for all release gates.
