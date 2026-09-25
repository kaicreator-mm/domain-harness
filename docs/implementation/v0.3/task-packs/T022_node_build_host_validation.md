# T-022 L3 — Node Build Host validation wave (SQLite durability adapters + exact-SHA evidence)

**Task:** T-022 (#240)
**Branch:** `v0.3_t022`
**Exact Base:** `28f23b43e26312571b494fc34e6ce5efc6e08630` (T-021 merge commit on `v0.3` — the integration SHA this wave validates)
**First branch commit:** `a99dfa677c654b45d198550e05bdb6542fdb742e` (T-021 review P2/P3 carryovers; core source, reviewed pattern)
**Authority:** GitHub issue #240; `docs/implementation/DomainHarness_v0.3_TASK_DAG.md` §7.1/§9; T-014 L3 handoff ("T-022 Node SQLite/process-kill durability implementation and proof", T014 §Future work); DAG §8 write-set (host adapters belong to the host packages, not core).

## 1. Task statement (from issue #240, verbatim intent)

Dedicated **real Node/local validation task**, not a new feature task. Validate the exact T-021 integration SHA for the DAG §7.1 bullet list (SQLite open/migrate/reopen; digest parity; registry/cache/binding/pin durability; crash windows; retained-instance recovery; revocation; deadlines/provisioning/process data/command outcomes; no duplicate committed external mutation). Required output: exact-SHA Build Host evidence and any reproducible blocker. No guessed PASS.

## 2. Survey facts on the Exact Base (verified by direct read; each checkable)

1. **Core ships only volatile/in-memory reference implementations** of every v0.3 persistence port (T-014 L3 §2.3: "Physical Node/Expo implementations are deliberately not added by T-014"):
   - `MemoryGovernanceBaselineStore` (T-003, `governance/registry.ts`)
   - `MemoryPromotedArtifactStore` (T-012, `promoted-artifact/registry.ts`)
   - `VolatileExactSemanticCacheStore` (T-013, `semantic-cache/exact-semantic-cache.ts`)
   - `MemoryDynamicChildPinStore` (T-017, `promoted-child/pin.ts`)
   - `MemoryAuthorityAuditStore` (T-015, `promotion-activation/authority.ts`)
   - `VolatileRuntimeEvidenceStore` (T-005, `runtime-evidence/store.ts`)
   - `VolatileHarnessExecutionJournalStore` (T-016, `harness/execution-journal.ts`)
   - `VolatileAdmissionEffectJournal` (T-019, `admission/effect-journal.ts`)
   - `DomainActivationAuthority` / `ExactPackageCdiAuthority` / `DurableExecutionStore` (T-014): **no** implementation in `src/` at all (test fakes only).
2. **`NodeSqliteRuntimeStore implements RuntimeStore` only** (v0.2 surface: instances/messages/effect journal). It does not implement the v0.3 seams `RuntimeStoreProcessCommandExtension` (T-009), `DurableControlStore` (T-010) or `DurableExecutionStore` (T-014).
3. Migration chain: `NODE_SQLITE_RUNTIME_STORE_MIGRATIONS` = version 1 only (tables `dh_v2_instances`, `dh_v2_messages`, `dh_v2_effect_journal`), tracked in `dh_v2_schema_migrations` with a newer-than-adapter guard. Store pragmas: WAL, `synchronous = FULL`, `foreign_keys = ON`, `busy_timeout`.
4. A **shared RuntimeStore conformance suite** already exists (`domain-harness-expo/tests/store/runtime-store-conformance.ts`, consumed by `shared-conformance.test.ts`) with an open/reopen harness; `tests/store/fixtures/store-child.ts` is the existing child-process helper for crash/kill tests (used by `crash-visibility.test.ts`).
5. Same-durability-domain requirements (frozen in contract docstrings):
   - `RuntimeStoreProcessCommandExtension`: "MUST use the same transaction manager/durability domain as the RuntimeStore methods they extend."
   - `DurableExecutionStore` (T-014): "The same concrete durability/ordering authority that owns package pins and control snapshots MUST implement these methods."
   - `DurableControlStore.ensureProvisionedWorkflowInstance`: binds one provisioning key to one exact WorkflowAddress and creates/opens the instance "in the same durable transaction"; CAS for external-work correlations.
   - `DomainActivationAuthority`: publish/read the complete tuple as **one record**; field-wise updates forbidden (non-torn publication).

**Consequence:** the DAG §7.1 durability bullets cannot be evidenced on this SHA without the Node SQLite physical adapters the earlier task packs explicitly deferred to this wave. Delivering them is host-package wiring of already-frozen port contracts — no core production semantics change. This matches issue #240 ("not a new feature task"; host durability wiring is the validation object) and T-014's handoff ("implementation and proof").

## 3. Design

### 3.1 Same-durability-domain seams — extend `NodeSqliteRuntimeStore`

Implemented directly on `NodeSqliteRuntimeStore` (private `#db`, its existing transaction discipline, same migration chain):

1. **`RuntimeStoreProcessCommandExtension`** (T-009): `getProcessData`, `getCommandOutcome`, `commitProcessedCommandTurn` — new tables `dh_v3_process_data`, `dh_v3_command_outcomes`; commit runs inside the same better-sqlite3 transaction as the instance/message writes of the processed turn.
2. **`DurableExecutionStore`** (T-014): `getGovernanceExecutionPin` / `bindGovernanceExecutionPin` (bind-once: same exact pin → `existing`; differing → `conflict`; never overwrite) / `getGovernanceBoundSnapshot` / `putGovernanceBoundSnapshot` — new tables `dh_v3_governance_execution_pins` (PK `workflow_instance_id`, full pin JSON + digest columns), `dh_v3_governance_bound_snapshots`.
3. **`DurableControlStore`** (T-010): `ensureProvisionedWorkflowInstance` (single durable transaction: provisioning key → exact WorkflowAddress + instance create/open; replay returns the bound address, never duplicates), `ensureExternalWorkCorrelation` / `getExternalWorkCorrelation` / `listDueExternalWorkCorrelations` / `compareAndSetExternalWorkCorrelation` (CAS on `expectedRevision` + waiting state) — new tables `dh_v3_provisioning_keys`, `dh_v3_external_work_correlations`.

### 3.2 Standalone authority stores — new module `store/node-sqlite-authority-stores.ts`

One shared `Database` handle per opened store set (same file, WAL; busy_timeout honoured), same migration chain applied through a factored helper `applyNodeSqliteMigrations(db)` exported from `migrations.ts` so both entry points agree on the chain and the newer-than-adapter guard. Factory:

```ts
openNodeSqliteAuthorityStores({ path, busyTimeoutMs? }): NodeSqliteAuthorityStores // + close()
```

returning adapters for:

4. **`GovernanceBaselineStore`** (T-003) — `dh_v3_governance_baselines`: exact identity → body JSON; retention/delete semantics per the port.
5. **`DomainActivationAuthority`** (T-014) — `dh_v3_domain_activation_bindings`: one row per `domain_id`, complete `DomainActivationBinding` JSON written in a single `INSERT … ON CONFLICT(domain_id) DO UPDATE` of the whole record (non-torn publication; readers only ever see complete old or complete new).
6. **`ExactPackageCdiAuthority`** (T-014) — resolution against the durable activation/publication record: an exact tuple resolves iff that exact tuple was published; no floating selectors; unknown → `undefined`.
7. **`PromotedArtifactStore`** (T-012) — `dh_v3_promoted_artifacts`: exact artifact identity → record; revocation state; retention per port contract.
8. **`ExactSemanticCacheStore`** (T-013) — `dh_v3_semantic_cache_entries`: exact key (provenance digests) → value JSON; quarantine/invalidation transitions preserved.
9. **`DynamicChildPinStore`** (T-017) — `dh_v3_dynamic_child_pins`: bind-once exact child pins.
10. **`PromotionActivationAuditStore`** (T-015) — `dh_v3_authority_audit`: append-only audit actions.
11. **`RuntimeEvidencePort`** (T-005) — `dh_v3_runtime_evidence`: append-only; idempotent re-append of byte-identical canonical record (matches `VolatileRuntimeEvidenceStore` semantics); differing same-id → `RUNTIME_EVIDENCE_APPEND_CONFLICT`.
12. **`HarnessExecutionJournalStore`** (T-016) — `dh_v3_harness_execution_journal`: journal ordering per port.
13. **`AdmissionDurableEffectJournal`** (T-019) — `dh_v3_admission_effect_journal`: begin/complete/recovery matrix semantics identical to the volatile reference (completed → reuse; started idempotent/none → re-run; started non-idempotent → recovery_required).

All JSON columns store canonical serialization (`canonicalJsonStringify` where the port defines canonical identity). All adapters preserve the exact fail-closed error codes of their port contracts; no adapter invents new outcome semantics.

### 3.3 Migration v2

`NODE_SQLITE_RUNTIME_STORE_MIGRATIONS` gains `version: 2` containing every `dh_v3_*` table above (CREATE TABLE IF NOT EXISTS + indexes), appended to the existing chain; the `dh_v2_schema_migrations` ledger and newer-than-adapter guard are reused unchanged. Open/migrate/reopen evidence covers: fresh open (v1+v2 applied), reopen (idempotent), a v1-only database file upgraded in place.

### 3.4 What is NOT delivered

- No Expo adapter work (T-023 owns the Hermes/expo-sqlite physical implementations).
- No core `src/` changes to frozen contracts; validation-discovered product fixes get their own scoped commits and are called out in the PR record.
- No docs/examples (T-025), no versioning (T-026).

## 4. Validation test matrix (DAG §7.1 / issue #240 → concrete evidence)

New suite under `packages/domain-harness-node/tests/store/` (plus `tests/v3-host/` if separation reads better), all running against real SQLite files in temp dirs on the real Node host, exact SHA under test = this branch HEAD:

| # | DAG §7.1 bullet | Evidence test |
|---|---|---|
| V1 | SQLite open/migrate/reopen | open fresh → tables present; reopen → state intact; v1-file upgrade; pragma inspection (WAL/FULL) |
| V2 | canonical digest parity | node:crypto SHA-256 host binding vs core canonical digest vectors (baseline identity, pin digest, evidence id) — byte parity |
| V3 | registry persistence/retention | promote → reopen → exact lookup; revoked artifact stays revoked; retention cannot delete recoverable authority |
| V4 | semantic cache persistence/quarantine/invalidation | put → reopen → hit; quarantined entry never served; revocation-driven invalidation survives restart |
| V5 | atomic/non-torn activation publication under movement | concurrent publish/read loop (worker threads or interleaved async) — readers only ever observe complete old or complete new tuple; digest-verified |
| V6 | pin durability before first state-changing control publication | pin → kill → reopen → `requirePinnedExecution` returns exact pin; snapshot-before-pin still rejected |
| V7 | recursive snapshot + executionFactRevision + child pin + AI/query/effect journal ordering | full assembled `createDomainRuntimeV3` over SQLite ports: admit turn with effects → snapshot → reopen → journal/order identical |
| V8 | crash after committed effect before newer snapshot → no duplicate committed work | child-process batch (extends `store-child.ts` pattern): commit effect, SIGKILL before snapshot, reopen → recovery matrix reuses completed effect; tool executor call-count proves no duplicate external mutation |
| V9 | crash before commit → documented retry/recovery semantics | SIGKILL mid-transaction → reopen → no torn rows; retry path per recovery matrix |
| V10 | retained instance P1/B1 while activation moves to P2/B2 | pin bound to P1/B1 stays authoritative for the retained instance after activation publication moves; fresh instances bind P2/B2 |
| V11 | alias movement after dynamic child start → recovered child reuses exact pinned digest | child pin bound; activation/alias moves; reopen → recovered child resolves the exact pinned digest, never the moved alias |
| V12 | revoked artifact → deny/fallthrough + produced-cache invalidation | revoke → resolver denies/falls through; cache entries produced by the revoked artifact are invalidated; survives reopen |
| V13 | persistent deadlines/callbacks source identities | external-work correlation with deadline → reopen → exact source identities + deadline intact; CAS resolution once-only |
| V14 | provisioning idempotency | same provisioning key N times (incl. concurrent) → one instance, same exact address |
| V15 | process data + command outcomes across restart | commit processed command turn → reopen → exact process data + outcome replay (idempotent redelivery) |
| V16 | no duplicate durable business mutation | aggregate assertion over V8/V14/V15 fixtures: tool/provisioning/external call logs contain no duplicate committed mutation |

Execution profile: one prepared Build Host checkout (this branch), one deterministic crash-window batch (single child-process spec file driving V8/V9 windows), then the full suite via the standard gates.

## 5. Failure handling / blocker protocol

- Any DAG bullet that cannot pass on this SHA becomes a **reproducible blocker**: failing/skip-marked test + reproduction steps + root cause, reported in the PR and issue record. No guessed PASS; no infra failure reported as product failure or as PASS.
- Adapter bugs discovered by validation are fixed in this task (host wiring). Core-contract bugs become scoped commits with their own focused tests, called out separately in the PR record.
- Error codes thrown by adapters are exactly those of the frozen port contracts.

## 6. Reference / ownership boundary

- Owns: `packages/domain-harness-node` SQLite adapters + migrations + host validation tests; scoped core fixes if validation uncovers real core bugs.
- Does not own: core contract semantics, Expo host (T-023), cross-host parity verdicts (T-024), docs (T-025), release (T-026).

## 7. Scope guard

Out of scope: changing frozen product/architecture semantics; new core contracts; engine changes; Expo work; docs; versioning. PR write set is expected to be `packages/domain-harness-node/**` plus the carryover commit already landed (core) plus this task pack; any core edit beyond the carryovers is individually justified in the PR record.

## 8. Gates

Standard: `npm run build && npm run lint && npm run typecheck && npm test && npm pack -w @kaicreator/domain-harness` from repo root, plus package-level `npx tsc -p tsconfig.test.json --noEmit` where present, all on the PR HEAD. Node-package focused suites run under `node --import tsx --test`.
