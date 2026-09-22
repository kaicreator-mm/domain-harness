# T-024 L3 — Cross-host conformance + migration/retention validation

**Task:** T-024 (#242)
**Branch:** `v0.3_t024`
**Exact Base:** `2d3ba3b94ddd54d5fc4aa3b7388b54d2a73062c4` (v0.3 after the T-023 merge — the integration SHA this wave validates; re-read GitHub facts at every resume)
**Authority:** GitHub issue #242; `docs/implementation/DomainHarness_v0.3_TASK_DAG.md` §7.3/§9 ("parity matrix, pre-A1 fail-closed migration, package/governance/artifact retention compatibility → exact-SHA cross-host evidence"); PROJECT_OVERRIDES ("Cross-host parity, migration/compatibility … are version-closure concerns", executed here ahead of T-026).

## 1. Task statement (from issue #242, verbatim intent)

Reconcile exact Node + Expo host evidence and validate cross-host logical parity, migration/compatibility, package/governance/artifact retention, pre-A1 fail-closed behavior, and Amendment V1–V12 at the applicable integration/host level. **No new product implementation** except minimal separately-scoped validation fixes. No guessed PASS.

Upstream exact-SHA host evidence being reconciled:

- **T-022 Node Build Host**: PR #289 merged @ `efc991716e2f8428a8864f7ad9661dc0d611a9f5`; V1–V16 matrix on the real Node host (issue #240 record).
- **T-023 Expo Android/Hermes device**: PR #290 merged @ `2d3ba3b94ddd54d5fc4aa3b7388b54d2a73062c4`; two-phase force-stop PASS on a real Expo SDK 55 / Hermes / expo-sqlite device environment at validation HEAD `2cfb65b18703899fc6a71d62786360a9059b88d5` (issue #241 comment-5771692057, full logcat JSON).

## 2. Survey facts on the Exact Base (verified by direct read; each checkable)

1. **Schema parity claim is currently human-reviewed, not executable**: the T-023 reviewer verified the 24 `dh_v3_*` CREATE TABLEs are DDL-identical between `packages/domain-harness-node/src/store/migrations.ts` and `packages/domain-harness-expo/src/store/migrations.ts` by whitespace-normalized diff. No test enforces it; drift would not fail any gate.
2. **No cross-host executable parity suite exists.** The shared RuntimeStore conformance suite (`packages/domain-harness-expo/tests/store/runtime-store-conformance.ts`) covers only the v0.2 `RuntimeStoreLike` surface; it is consumed by Node (`packages/domain-harness-node/tests/store/shared-conformance.test.ts`) and by the T-023 device app. The 12 v0.3 authority seams have per-host validation (T-022 V-matrix, T-023 E-matrix) but no byte-level cross-host comparison.
3. **Expo adapters are executable under Node** through the T-023 smoke harness pattern: `tests/hosts/expo-v3-host/node-smoke-sqlite-stub.ts` wraps better-sqlite3 behind the structural `ExpoSqliteDatabaseLike` interface via a tsconfig paths alias (`TSX_TSCONFIG_PATH`). That harness is explicitly builder-side pre-check, not host evidence; T-024 promotes the *pattern* (not the smoke suite) into a version-controlled parity driver with the same honesty boundary: it produces **logical-parity evidence**, never host claims.
4. **Retention/GC surfaces are exactly three** (no other deletion paths exist):
   - `GovernanceBaselineStore.collectBodyIfUnreferenced` (`packages/domain-harness/src/governance/contracts.ts:71-96`): atomically deletes a body only when no live retention reference targets it; live reference → fail closed (`GOVERNANCE_BASELINE_RETAINED` / false); released referenceIds leave tombstones that cannot be rebound (`releaseReference` contract, contracts.ts:85-92).
   - `PromotedArtifactStore` retention references (`src/promoted-artifact/contracts.ts:112-218`): `putRetention` / `releaseRetention(expected)` (CAS on the exact expected reference; T-022 carryover keeps original bytes after release).
   - `VolatileSemanticCacheRetentionPolicy` on the authority factories (cache eviction bounds only; no authority-body deletion).
   - There is **no durable compiled-package body store**: packages are content-addressed (`packageId`) and resolved through `PackageRegistry`; package retention reduces to "no deletion path exists" plus pin durability.
5. **Pre-A1 fail-closed paths exist and are coded, not just reviewed**: `requirePinnedExecution` throws `GOVERNANCE_EXECUTION_PIN_MISSING` for unpinned instances (`src/governance/execution-binding.ts:496-507`); `persistSnapshot` before any pin throws `SNAPSHOT_BEFORE_GOVERNANCE_PIN` (:509-528); pin conflicts throw `GOVERNANCE_EXECUTION_PIN_CONFLICT` (:475-479). Core `src/` contains no `current`/`latest` floating recovery selector (grep-verified); `StaticPackageRegistry` resolves exact ids only.
6. **v0.2 persisted data is historical-only**: migration v2 appends `dh_v3_*` tables to a v1 file in place (meta 1→2, rows preserved — device-proven in T-023 E10); no semantic migration of v0.2 instances into v0.3 authority exists or is permitted ("v0.2 persisted semantics remain historical and v0.3 migration is explicit", PROJECT_OVERRIDES).
7. **Amendment A1 review vectors V1–V12** are defined at `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1.md:889-998`. Most already own core-level evidence from T-014…T-021 suites; T-024's duty is the *integration/host-level* reconciliation: which vectors hold on durable adapters of both hosts, and which already hold at core level with cited evidence.

## 3. Design

All executable artifacts are tests; no product code. Three new suites plus one reconciliation matrix.

### 3.1 Executable schema-parity gate (`packages/domain-harness-node/tests/cross-host/schema-parity.test.ts`)

Import both migration chains, extract every `dh_v3_*` (and `dh_v2_*`) DDL statement from each, whitespace-normalize, sort, and assert set equality — including index statements. Also assert: both chains number migration v2 identically, both keep the `dh_v2_store_meta` ledger semantics, and both reject newer-than-adapter files. Any future drift fails this test in CI.

### 3.2 Cross-host operation-script parity (`packages/domain-harness-node/tests/cross-host/operation-parity.test.ts`)

One deterministic operation script (fixed timestamps, fixed digests via the same SHA-256 vectors, fixed ids) driving the full v0.3 surface: baseline publish + retention reference, activation publication (non-torn under interleaved reads), exact-CDI registration, governance pin + bound snapshot, processed command turn commit (process data + outcome), provisioning key idempotency, external-work correlation + CAS, promoted artifact + alias + retention, child pin, semantic cache write/hit, evidence append, effect journal begin/complete, two admitted turns through the assembled `createDomainRuntimeV3`.

Executed twice per run: once against the Node adapter stack (`openNodeSqliteAuthorityStores` + `NodeSqliteRuntimeStore`), once against the Expo adapter stack (`openExpoSqliteAuthorityStores` + `ExpoSqliteRuntimeStore`) over the parity driver (better-sqlite3 behind `ExpoSqliteDatabaseLike`, §2.3). Then dump every `dh_v2_*`/`dh_v3_*` table's rows as canonical JSON and assert **byte-identical dumps across hosts**. Any divergence is a P1 parity defect.

Honesty boundary (written into the suite header): this is logical-parity evidence over a Node-runnable SQLite driver for the Expo adapters. Real host claims remain T-022 (Node) and T-023 (device) evidence; this suite exists to make drift impossible between those two validated stacks.

### 3.3 Migration / pre-A1 / retention suite (`packages/domain-harness-node/tests/cross-host/migration-retention.test.ts`)

Run on both adapter stacks (same driver pattern):

- **M1 pre-A1 fail-closed**: fabricate a v1 (meta=1) database with a v0.2 instance row and **no** governance pin → open with v0.3 adapters → meta upgrades to 2, v0.2 rows untouched → recovery of the unpinned instance fails closed (`GOVERNANCE_EXECUTION_PIN_MISSING`), snapshot persistence before pin rejected (`SNAPSHOT_BEFORE_GOVERNANCE_PIN`); no path binds `current`/`latest` (behavioral: registry exposes exact-id resolution only).
- **M2 deterministic migration only with exact authority**: pinned instance whose pinned baseline body is present → recovery proceeds; same pin with the baseline body absent → fail closed (`MISSING_RETAINED_GOVERNANCE_BASELINE` class error, V2 vector), never substitution.
- **M3 governance-body retention**: `collectBodyIfUnreferenced` deletes an unreferenced body (true) and refuses a retained one; released referenceId cannot be rebound (tombstone); repeating a live reference is idempotent.
- **M4 promoted-artifact retention**: released retention preserves original bytes (T-022 carryover P3-2); revoked artifact stays revoked across reopen; alias cannot resurrect a revoked digest.
- **M5 package retention**: no package-body deletion API exists (structural assertion: the durable schema contains no package-body table and the registry port exposes no delete); a pinned packageId remains resolvable after activation movement (V1 vector at host level).
- **M6 cache retention bound**: a bounded `VolatileSemanticCacheRetentionPolicy` evicts only evictable entries; quarantined entries are never served; invalidation survives reopen.

### 3.4 Amendment V1–V12 host-level reconciliation matrix

For each vector, the matrix names either the new T-024 test that executes it on both adapter stacks, or the existing exact-SHA evidence that already owns it, with the suite/file. Initial mapping (confirmed during implementation; the matrix lands in the PR record):

| Vector | Host-level evidence |
|---|---|
| V1 pin survives baseline movement | M5 + T-022 V10 (Node, efc9917) + T-023 E4 (device, 2cfb65b) |
| V2 missing pinned baseline fails closed | M2 (both stacks) |
| V3 governance self-approval rejected | core T-015 authority suite (existing); host: audit append evidence via parity script |
| V4 pre-change evaluation | core T-015 suite (existing); not a persistence concern — cite, no new test |
| V5 guard purity | compile-time/contract gate (core tests + expo structural check); cite |
| V6 reasoning explicit | core decision-resolver suite (T-018); cite |
| V7 candidate invalid after governance change | core promotion-authority suite (T-015/T-004); cite |
| V8 evidence cannot replay work | parity script: evidence record present but journal lacks committed fact → retry not suppressed (both stacks) |
| V9 tenant evidence isolation | evidence-store scoping probe on both stacks + core T-005 suite citation |
| V10 shadow L4 cannot mutate | core T-020 suite (existing); cite |
| V11 exact stable fallback | behavioral: alias/current never used for recovery — parity script moves alias, recovery resolves pinned digest only (both stacks) |
| V12 existing durability unchanged | T-022 V8/V9 crash windows (Node) + T-023 E5 (device force-stop); parity script journal-hit replay (both stacks) |

## 4. Validation matrix (issue #242 bullets → evidence)

| # | Bullet | Evidence |
|---|---|---|
| C1 | Node/Expo logical persistence semantics match | 3.1 schema-parity gate + 3.2 byte-identical operation dumps |
| C2 | pre-A1 instance/snapshot without provable pin never binds `current` silently | M1 (both stacks) |
| C3 | deterministic migration succeeds only when exact historical authority is provable, else fail closed | M1/M2 |
| C4 | GC/retention cannot delete package/governance/promoted bodies required by active/recoverable pins/audit | M3/M4/M5/M6 |
| C5 | v0.2 persisted semantics remain historical; v0.3 migration explicit | M1 (rows untouched, no semantic import path exists) |
| C6 | host evidence tied to exact validated SHAs | this pack §1 binds T-022/T-023 SHAs; all T-024 suites run on this branch HEAD and are reported against it |
| C7 | V1–V12 at applicable integration/host level | §3.4 matrix |

## 5. Failure handling / blocker protocol

- Any bullet that cannot pass on this SHA becomes a **reproducible blocker**: failing test + reproduction + root cause in the PR/issue record. No guessed PASS.
- Cross-host divergences are P1 by default; product fixes (if any) are minimal, separately-scoped commits with focused tests, called out in the PR record.
- The parity driver is labeled in code and in the record as logical-parity infrastructure; it never substitutes for T-022/T-023 host evidence.

## 6. Reference / ownership boundary

- Owns: `docs/implementation/v0.3/task-packs/T024_*` (this pack), `packages/domain-harness-node/tests/cross-host/**`, the parity driver test infrastructure; minimal separately-scoped validation fixes.
- Does not own: core contract semantics, host adapter semantics (T-022/T-023, merged), docs/examples (T-025), release qualification (T-026).

## 7. Scope guard

Out of scope: new product implementation; changing frozen semantics; weakening any gate; edits to T-022/T-023 evidence harnesses beyond read-only consumption. PR write set is expected to be this pack + `packages/domain-harness-node/tests/cross-host/**` (+ scoped fixes with individual justification if validation uncovers real bugs).

## 8. Gates

Standard: `npm run build && npm run lint && npm run typecheck && npm test && npm pack -w @kaicreator/domain-harness` from repo root on the PR HEAD. The new cross-host suites run under `node --import tsx --test` inside the node package test target. CI (Woodpecker verify) must pass on the exact PR HEAD; no device re-run is required by this task (host evidence is inherited from T-022/T-023 at the SHAs bound in §1 — no upstream SHA changes during this task).
