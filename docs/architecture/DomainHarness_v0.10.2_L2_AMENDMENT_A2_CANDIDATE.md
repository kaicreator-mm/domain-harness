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

1. **Exact write set (only):** `packages/domain-harness/package.json`, `packages/contracts/package.json`, `package-lock.json`, three test files named above, and `packages/domain-harness-compiler/tests/packed-fixture-stage.ts` (README-conditional pack only). H existing manifest adds `@kaicreator/domain-harness-contracts: "0.10.2-rc.0"` as an *exact* `dependencies` entry. `packages/contracts/package.json` adds a Node24 `exports['.'].require: './dist/index.js'` alias alongside its existing `import`+`types` to resolve **the same ESM singleton** in CJS-transpiled and native ESM contexts (`require(esm)` works on Node24 modules without top-level await); it must NOT introduce a CJS clone or new published API. This explicitly removes the reason T00's provisional compatibility shims used `createRequire(import.meta.resolve(...))` and brittle sibling `dist` path probing. Lockfile updates H dependency entry only, without third-party versions, workspace membership or other dependency churn. No root/other workspace manifest edit.
2. Each of the three clean H packed consumers must stage the exact local contracts tarball with `stageNewWorkspaceTarballs` from the already selected T07a2 fixture helper, validate its SHA256 via `verifiedLocalWorkspaceTarballs(..., ['contracts'])`, install H.tgz and contracts.tgz **in the same npm install** and assert the installed contracts `name@version`. No assumption the unreleased RC package is on any registry; third-party registry allowed. Tests must still physically exercise shipped tarball and original #139/#551/#930 assertions.
3. Shared staged pack helper `stageNewWorkspace` must include `README.md` if the given workspace has it: T00 adds `packages/contracts/README.md` but did not own this helper. Conditional copy keeps packed staged-vs-live SHA equivalence; H/core compiler fixture self-validation remains unchanged. Do not rebuild LIVE dist within tests.
4. **Chronology and real-exit ownership (P2-01 R1 correction):** T07a3 precedes the T00 source migration, so its exact-HEAD physical tests can prove **only** the manifest/lock/exports correctness, same-transaction H+Contracts install from local tarballs, SHA256, positive legacy consumers **on the pre-T00 H implementation**, and a deliberately missing staged dependency **negative**. This is NOT evidence that the original T00 failures (#139/#551/#930) have closed. Once T07a3 merges, **T00 must rebase or integrate that manifest state, rebuild, rerun ALL three specific consumers** and the full serialized `tools/task-check.sh` with actual `EXIT=0` on T00's **new exact HEAD** (plus clean-installed class identity and strict NodeNext declarations). No skip, no interim red waiver, no reuse of the pre-T00 green as T00 acceptance.
5. **Two-stage module-singleton gate (P2-02 R1 correction):** T07a3 physically installs the exact `@kaicreator/domain-harness-contracts@0.10.2-rc.0` tarball in a clean Node24 consumer and compares `require('@kaicreator/domain-harness-contracts')` with native ESM `import('@kaicreator/domain-harness-contracts')`, asserting the **same resolved `dist/index.js` file**, same exported class object, no `ERR_REQUIRE_ASYNC_MODULE`, no duplicate CJS path, and strict NodeNext types. T00 subsequently removes temporary shims and physically asserts `IdentityContractError`/`QualifiedPackageError`/`V10Error` reference equality across the legacy H/compiler public paths and the **installed** Contracts package in one clean Node24 consumer. Distinct tests, distinct SHA and real logs/exit receipts required; neither is marked PASS in this design review.

### T00 explicitly bounded early type-only source write exception (P1-01 R1 correction)

Frozen L2 §12 assigns four live implementation source files to successor T04/T05; PR #1340 actually edits them to move **declarations only** into the canonical Contracts module. A2 **explicitly amends T00's admitted source write set** for exactly the following four paths, without changing their later execution/runtime ownership:

| Added early T00 source path | Successor owner still retained | Only authorized T00 transformation |
|---|---|---|
| `packages/domain-harness-compiler/src/qualified-package/v10build/activation.ts` | T04 | Relocate `V10AppView`, `V10DocStore` and other exported structural/type-only declarations to Contracts and re-export their exact TypeScript names; no changes to actual activation/link/load/dispatch functions |
| `packages/domain-harness-compiler/src/qualified-package/v10build/import-hook.ts` | T04 | Change the **type-only** `V10AppView` import to canonical Contracts; no resolve-hook/runtime change |
| `packages/domain-harness-compiler/src/qualified-package/v10build/build.ts` | T05 | Relocate `V10ModuleInput`, `V10BuiltApp`, etc. selected **interface/type** declarations into Contracts, import/re-export existing names; no BUILD validator/graph/seal behavior change |
| `packages/domain-harness-compiler/src/qualified-package/v10build/import-policy.ts` | T05 | Relocate `V10ExternalImports` interface to Contracts, retain same declaration surface; no AST/import policy implementation change |

The early permission is limited to **declaration moves and imports/reexports of those types only**. T00 may not edit runtime control flow, change BUILD or Activation behavior, add an entrypoint, modify exact ABI/wire literal strings, or alter the sealed K/S payload. Both T04 and T05 remain **downstream of T00**, so their later edits to the same sources are ordered, not overlapping unordered writes. Before adopting A2, Controller must add this exact four-file exception to #1319 Issue's official write-set amendment record; approval of the amendment document alone does not silently grant the author permissions. T00 tests must assert parity of the original declaration names, type-only structural ABI/import graph, and refused wrong-direction runtime imports at exact HEAD.

### T00 bounded mechanical dist exception

T00 remains owner of `packages/contracts/{src,tests,dist,README.md}`, existing frozen §12 legacy shim source paths **plus the four early type-only paths explicitly added above**, and the same serialized error-code catalog. Exception for **generated output only**: T00 may commit matching deterministic emitted artifacts in `packages/domain-harness/dist/contracts/{identity,json}.*`, `packages/domain-harness/dist/public-v8/contracts.*`, and `packages/domain-harness-compiler/dist/qualified-package/v10build/{digest,errors,guards,known-error-codes,activation,build,import-hook,import-policy}.*`. Each changed dist path must correspond to a T00 source path and be fresh after `npm run build`; no unrelated legacy dist churn. T00 must drop its one-line `packed-fixture-stage.ts` change when T07a3 owns it. **T00 PR #1340 may not merge with that out-of-write-set source change.** After the Contracts `require` export is reviewed and shipped by T07a3, T00 **must replace** its temporary `createRequire`/`process.getBuiltinModule` workarounds in the compiler/Core reexport shims with plain, static `export ... from '@kaicreator/domain-harness-contracts'` and prove both CJS and ESM class identity in a clean physical Node24 consumer. This eliminates transient path-based import workarounds; T00 cannot edit the Contracts manifest directly. Existing manifest/lock changes are **never** added to T00's write set.

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

Independent L2 reviewer (not this author) must pin A2 PR exact HEAD, audit original red test evidence, inspect exact source/manifest/lock changes planned, check early four-file T00 SOURCE exception plus generated dist parity, check new DAG/write overlap, check frozen blobs byte-identical and produce P0/P1/P2, PASS/BLOCK and `A2_FREEZE_READY`. Only then may Controller merge A2 docs, open the exact T07a3 implementation Issue and merge its separately reviewed/physically tested PR into `v0.10.2`. **T00 stays Draft/BLOCK until T07a3 completes and T00 exact-HEAD full task-check is green.** PR PASS ≠ Release PASS.
