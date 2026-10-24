# DomainHarness v0.10.2 — L2 Amendment A2: Early manifest boundary for T00

```ini
STATUS=PROPOSED_NOT_FROZEN
ISSUE=#1341
BASE=v0.10.2@2c86aa2cec14964433912c0b8dd1bd17ae912dbd
FROZEN_L2_BLOB=68e7dbc591f4c0c694818ec574b8585f95239c8b
FROZEN_PRD_BLOB=746535c97e87c24b373a02175f8681015a16a589
A1_BLOB=face555d43bcbd92990db20f32600e337cc72a14
IMPLEMENTATION_NOT_AUTHORIZED_UNTIL_INDEPENDENT_REVIEW
```

## A2 source and real blocker

T00 #1319/PR #1340 HEAD `9287cf755ddc69371d5d431f1cf4d0288ac99da4`: Windows Node24 build/typecheck/lint/root tests PASS but **full task-check EXIT 1** with three non-skipped standalone H installed-tarball consumers; the builder report is [#6380037965](https://github.com/kaicreator-mm/domain-harness/pull/1340#issuecomment-6380037965). The exact tests are:

- `packages/domain-harness/tests/root-portability.test.ts` (#139)
- `packages/domain-harness/tests/public-v7/public-v7-portability.test.ts` (#551)
- `packages/domain-harness/tests/public-v7/public-v7-execution-portability.test.ts` (#930)

Each uses a real private H `npm pack` followed by a new isolated consumer `npm install H.tgz` without the `@kaicreator/domain-harness-contracts@0.10.2-rc.0` tarball. T00 moved H identity/JSON implementation into that canonical package but H's legacy manifest and lock still only list ajv/json-schema-library/xstate; the resulting import fails `ERR_MODULE_NOT_FOUND` (not a flaky SQLite failure). A1 fixture repair covers the remaining 23 install transactions but omitted these three. T00 cannot edit the manifest/lockfile under frozen L2 §5/§12, which deferred legacy manifest owner to post-T11 T07b. Strict gate therefore deadlocks.

## Approved candidate change set (only if reviewed)

### T07a3: additional *early T07-owned* implementation task

```ini
NEW_TASK=T07a3
DEPENDS_ON=#1337,#1321
BLOCKS=#1319
OWNER=T07_MANIFEST_AND_LOCK
```

1. **Exact write set (only):** `packages/domain-harness/package.json`, `package-lock.json`, three test files named above, and `packages/domain-harness-compiler/tests/packed-fixture-stage.ts` (README-conditional pack only). H existing manifest adds `@kaicreator/domain-harness-contracts: "0.10.2-rc.0"` as an *exact* `dependencies` entry. Lockfile updates its H package dependency map, without third-party versions, workspace membership or other dependency churn. No root/new package manifest edit.
2. Each of the three clean H packed consumers must stage the exact local contracts tarball with `stageNewWorkspaceTarballs` from the already selected T07a2 fixture helper, validate its SHA256 via `verifiedLocalWorkspaceTarballs(..., ['contracts'])`, install H.tgz and contracts.tgz **in the same npm install** and assert the installed contracts `name@version`. No assumption the unreleased RC package is on any registry; third-party registry allowed. Tests must still physically exercise shipped tarball and original #139/#551/#930 assertions.
3. Shared staged pack helper `stageNewWorkspace` must include `README.md` if the given workspace has it: T00 adds `packages/contracts/README.md` but did not own this helper. Conditional copy keeps packed staged-vs-live SHA equivalence; H/core compiler fixture self-validation remains unchanged. Do not rebuild LIVE dist within tests.
4. New T07a3 source/pack tests explicitly prove success of these three previously failing consumers and failure of unbridged unpublished-package setup. Full `tools/task-check.sh EXIT 0` after `npm run build EXIT 0` on a quiet Node24 build host, preserving logs and no false CI claims. No direct archive/skip of historic tests.

### T00 bounded mechanical dist exception

T00 remains owner of `packages/contracts/{src,tests,dist,README.md}`, legacy shim *source* paths named by frozen §12 and same serialized error-code catalog. Exception for **generated output only**: T00 may commit matching deterministic emitted artifacts in `packages/domain-harness/dist/contracts/{identity,json}.*`, `packages/domain-harness/dist/public-v8/contracts.*`, and `packages/domain-harness-compiler/dist/qualified-package/v10build/{digest,errors,guards,known-error-codes,activation,build,import-hook,import-policy}.*`. Each changed dist path must correspond to a T00 source path and be fresh after `npm run build`; no unrelated legacy dist churn. T00 must drop its one-line `packed-fixture-stage.ts` change when T07a3 owns it. Existing manifest/lock changes are **never** added to T00's write set.

### Frozen authority and DAG

This is an **additive amendment** to A1's T00 prerequisite and T07a/T07b timing only. Do not edit frozen `DomainHarness_v0.10.2_PRD_CANDIDATE.md`, `DomainHarness_v0.10.2_L2_DESIGN_CANDIDATE.md`, `DomainHarness_v0.10.2_L2_FREEZE.md` or CV-01..12. New DAG:

```text
T07a ─┐
T01 ──┼─ T07a2 ─┐
T01k ───────────┴─ T07a3 ─ T00 ─ T05 ─ T04 ─ T03 ─ T06 ─ T11 ─ T07b ─ T08b ─ T09 ─ R01
T08a ──────────────────────────────────────────────┘ (T11 prerequisite)
```

No added ABI/type/wire literal, no new K/S bytes and no extra runtime kernel. T07a3 writes only the manifest/lock paths already reserved to exclusive T07 (now serialized before T07b), plus the missed tests and pack helper; no unordered overlap. T07b still owns final package private/export rules, Node24 CI smoke and final distribution packaging; T09 owns verified Tiny runtime compiler-free installed closure.

## Admission and qualification

Independent L2 reviewer (not this author) must pin A2 PR exact HEAD, audit original red test evidence, inspect exact source/manifest/lock changes planned, check new DAG/write overlap, check frozen blobs byte-identical and produce P0/P1/P2, PASS/BLOCK and `A2_FREEZE_READY`. Only then may Controller merge A2 docs, open the exact T07a3 implementation Issue and merge its separately reviewed/physically tested PR into `v0.10.2`. **T00 stays Draft/BLOCK until T07a3 completes and T00 exact-HEAD full task-check is green.** PR PASS ≠ Release PASS.
