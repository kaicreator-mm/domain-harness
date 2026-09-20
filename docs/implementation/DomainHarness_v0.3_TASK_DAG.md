# Task DAG — DomainHarness v0.3

**Status:** FORMAL EXECUTION PLAN  
**Created:** 2026-09-20  
**Planning baseline:** `main@be3721c80dba9b4a7396a3391615ea3bdd3f124d`  
**Version integration branch:** `v0.3`  
**Task branch convention:** `v0.3_tNNN`  
**Planning Issue:** #215

> This DAG is optimized for multi-conversation parallel execution. Shared semantic identities are frozen first; then portable contract/core concerns and retained Domain-App capabilities fan out in parallel. Central Runtime/DecisionResolver wiring is deliberately deferred. Expensive real-host validation is concentrated into dedicated Node and Expo waves so feature PRs do not repeatedly consume local Build Host environments.

## 1. Frozen Inputs

Product/architecture authority:

1. `docs/product/DomainHarness_v0.3_PRD_FROZEN.md`
2. `docs/product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A1_ROUND2_REVIEW_CANDIDATE.md`
3. `docs/product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A1_FREEZE_RECORD.md`
4. `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_EVIDENCE_FROZEN.md`
5. `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1.md`
6. `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1_FREEZE_RECORD.md`
7. `.dev-standard/PROJECT_OVERRIDES.md`
8. `.dev-standard/VERSION`

Consumed research remains frozen through L2 and is not rerun by default: #187, #194, #195, #196, #197, #201, #203, #204, #205.

Non-blocking review carry-forward: #214.

## 2. Planning Principles

### 2.1 Maximize safe parallelism

A task may start when all explicit dependencies are merged into `v0.3`. Tasks in the same parallel wave should fork from the same dependency-complete SHA.

Parallel tasks should avoid editing:

- central Runtime assembly;
- public package barrels shared by many concerns;
- root configuration unless explicitly assigned;
- the same persistent schema/migration file when avoidable.

Central exports/wiring belong to T-019/T-021 unless a task pack explicitly owns a narrow shared seam.

### 2.2 Concentrate real local-environment work

Most feature tasks use deterministic portable tests, compiler fixtures, fake/in-memory stores, and static contract tests. They MUST NOT claim real durability from mocks.

Real environments are intentionally concentrated:

- **T-022 Node Host Validation Wave** — Node SQLite + process-kill/restart + registry/cache/governance pin durability + retained-instance recovery + timers/effects.
- **T-023 Expo Host Validation Wave** — Hermes + `expo-sqlite` + force-stop/relaunch + portable boundary + host parity.
- **T-024 Cross-host / migration validation** — compares exact validated host results and migration/retention compatibility after both host waves.

This minimizes repeated Build Host setup and context switching while preserving exact-SHA evidence.

### 2.3 One concern / one PR

Each implementation task maps to one branch/PR and should have an isolated write set where practical. A task may not opportunistically absorb sibling scope.

## 3. Task Table

| Task | Concern | Depends On | Parallel | Risk | Primary output | Required validation profile |
|---|---|---|---:|---|---|---|
| T-001 | v0.3 shared contract foundation | — | NO | H | shared exact identities, canonical digest seam, error taxonomy, stable task-facing contract locations | portable unit/type fixtures |
| T-002 | Domain Data / CDI semantic identity + projections/revisions | T-001 | YES | H | `CompiledArtifactIdentity`, package/CDI descriptors, semantic projection + `SemanticRevisionPort` contracts | deterministic contract/compiler fixtures |
| T-003 | Governance Baseline identity + registry/retention core | T-001 | YES | H | canonical `GovernanceBaselineIdentity`, semantic digest, logical registry/store, retention/ref accounting contract | portable identity/retention tests |
| T-004 | Unified Candidate envelope + deterministic validator framework | T-001 | YES | H | Rule/Procedure/Skill/Workflow Candidate common envelope + baseline-bound validation identity | reject/accept fixture matrix; preserve specialized Workflow validator |
| T-005 | Runtime Evidence contract + provenance/privacy boundary | T-001 | YES | M | evidence port/record, durable-audit vs derived-ephemeral, tenant/provenance validation | deterministic provenance/tenant tests |
| T-006 | Domain Workflow public contract / XState boundary + predicate purity | T-001 | YES | H | engine-neutral Workflow API semantics, XState adapter boundary, guard/Hard-Invariant pure-predicate enforcement | contract/static/focused runtime tests |
| T-007 | Business Harness / HarnessMachine production contract | T-001 | YES | H | bounded structured decision/event/trace contract, ModelPort/tool/query authority limits | bounded-step/cancel/illegal-authority tests |
| T-008 | Host/local Domain Tool binding | T-001 | YES | M | generic project-local/native capability binding without package/project coupling | portable adapter fixtures; no real host durability claim |
| T-009 | Durable process data + first-class command outcomes/rejection | T-001 | YES | H | mutable durable process-local data and accepted/processed/rejected command outcome contract | deterministic runtime/store tests |
| T-010 | Idempotent provisioning + persistent deadlines + long-running correlation | T-001 | YES | H | provisioning identity, durable deadline/timer/callback and external-job correlation contracts | fake-clock/restart fixtures; host truth deferred |
| T-011 | Generated typed App contracts | T-001 | YES | M | generated command/outcome/view/watch/domain-event client types from compiled contracts | compiler/golden/type tests |
| T-012 | Promoted Artifact Registry lifecycle | T-002,T-004 | YES | H | immutable artifact body store, promotion records, exact selection, alias resolution-once, revocation, retention, pinned-package compatibility | lifecycle/revocation/retention fixtures |
| T-013 | Exact Semantic Cache production core | T-002 | YES | H | exact invocation key, two-phase eligibility, `ObservedDependencySet`, producer/dependency indexes, quarantine/invalidation | cache correctness fixtures; persistence host truth deferred |
| T-014 | Exact activation binding + durable GovernanceExecutionPin core | T-003,T-006 | YES | H | `DomainActivationBinding`, atomic logical binding publication/read, `GovernanceExecutionPin`, store/snapshot ordering/fail-closed validation | non-torn concurrency fixtures + store contract tests |
| T-015 | Promotion vs activation authority + baseline-bound audit | T-003,T-004,T-012 | YES | H | explicit operator promotion/activation transitions, governance compatibility/revalidation, audit identities | authority-negative tests + baseline-change matrix |
| T-016 | HarnessMachine execution journal + observed-dependency integration | T-002,T-007 | YES | H | AI/query journal integration, stable operation identity, `ObservedDependencySet`, no provider routing | crash-window simulation + no-duplicate journal tests |
| T-017 | Promoted child compiler/runtime + DynamicChildExecutionPin | T-012,T-014,T-016 | NO | H | exact artifact compile/reuse, applicability/compatibility, durable child pin before journaled work | exact child identity + recovery contract fixtures |
| T-018 | DecisionResolver integration | T-013,T-016,T-017 | NO | H | `Rule → Exact Cache → Promoted Subworkflow → HarnessMachine` with single pre-read and no hidden guard retry | integrated resolver matrix + LLM-avoidance assertions |
| T-019 | Domain Workflow central admission/wiring + durable effect handoff | T-006,T-014,T-018 | NO | H | schema → pinned Hard Invariant → guard → transition → durable effect; telemetry and control-turn wiring | Amendment V1–V8/V12 focused integration fixtures |
| T-020 | Runtime Evidence capture + shadow-L4 / exact fallback seam | T-005,T-015,T-019 | YES | M | evidence capture at decision/failure/fallback/override points; shadow-only L4; exact stable fallback | V8–V11 + tenant/provenance tests |
| T-021 | v0.3 Runtime assembly + retained Domain-App capability integration | T-008,T-009,T-010,T-011,T-019,T-020 | NO | H | portable public v0.3 runtime/API assembly; central exports; no second runtime | repository portable smoke + focused CJs |
| T-022 | **Node Build Host validation wave** | T-021 | YES | H | exact-SHA Node SQLite/kill/restart validation evidence | real Node Build Host; see §7.1 |
| T-023 | **Expo Android/Hermes validation wave** | T-021 | YES | H | exact-SHA Hermes/`expo-sqlite`/force-stop validation evidence | real Expo Android/Hermes; see §7.2 |
| T-024 | Cross-host conformance + migration/package/governance retention validation | T-022,T-023 | NO | H | parity matrix, pre-A1 fail-closed migration, package/governance/artifact retention compatibility | exact-SHA cross-host evidence |
| T-025 | SDK docs + v0.2→v0.3 migration/integration examples | T-021 | YES | M | Domain Workflow-facing docs, governance/evidence/candidate examples, host guides | docs/example review; compile examples where possible |
| T-026 | v0.3 visible closure + Hidden Validation handoff | T-024,T-025 | NO | H | frozen-authority gate matrix, review/validation reconciliation, packaging/release qualification handoff | full repo regression + all required gates/waivers |

Status values for execution issues: `TODO / DOING / BLOCKED / DONE / DEFERRED / NOT_APPLICABLE`.

## 4. Dependency Shape

```text
T-001 Shared Contract Foundation
  │
  ├────────────── Parallel Wave A: Portable contracts/capabilities ──────────────┐
  │  T-002 Domain Data/CDI identities + semantic projection/revision             │
  │  T-003 Governance Baseline identity + registry contract                       │
  │  T-004 Unified Candidate validation                                           │
  │  T-005 Runtime Evidence contract                                              │
  │  T-006 Domain Workflow/XState boundary + pure predicates                     │
  │  T-007 Business Harness contract                                              │
  │  T-008 Host/local Tool binding                                                │
  │  T-009 Process data + command outcomes                                        │
  │  T-010 Provisioning/deadline/external-work correlation                        │
  │  T-011 Generated typed contracts                                              │
  └──────────────────────────────────┬────────────────────────────────────────────┘
                                     │
                    Parallel Wave B: durable/reuse authorities
                                     │
             ┌───────────────────────┼──────────────────────────┐
             │                       │                          │
   T-002+T-004 → T-012 Registry      │              T-003+T-006 → T-014
   T-002       → T-013 Cache         │              Governance activation/pin
   T-002+T-007 → T-016 Harness journal/observed deps
             │                       │                          │
             └──────────────┐   T-003+T-004+T-012 → T-015 ────┘
                            │       Promotion/activation
                            ▼
              T-012 + T-014 + T-016
                            ↓
                         T-017
               Promoted child + dynamic pin
                            ↓
              T-013 + T-016 + T-017
                            ↓
                         T-018
                    DecisionResolver
                            ↓
              T-006 + T-014 + T-018
                            ↓
                         T-019
              Central Workflow admission/effect
                            │
              T-005+T-015+T-019 → T-020
                            │
        T-008+T-009+T-010+T-011+T-019+T-020
                            ↓
                         T-021
                    Runtime assembly
                  ┌─────────┴─────────┐
                  ▼                   ▼
        T-022 Node local wave   T-023 Expo local wave
                  └─────────┬─────────┘
                            ▼
                         T-024
               Cross-host/migration validation

T-021 ───────────────→ T-025 Docs/examples
T-024 + T-025 ───────→ T-026 Visible closure/HV handoff
```

## 5. Parallel Checkpoints

### Checkpoint C0 — v0.3 planning baseline

After this DAG/authority update is merged, create `v0.3` from the exact planning merge SHA.

Start only T-001.

### Checkpoint C1 — shared contracts merged

When T-001 is merged into `v0.3`, start **T-002 through T-011 concurrently** where agent capacity permits.

Expected parallel width: up to **10** independent task branches.

### Checkpoint C2 — Wave A dependency subsets complete

Start T-012/T-013/T-014/T-016 as soon as their narrow dependencies are individually complete; do not wait for every Wave A task.

T-015 starts when T-003/T-004/T-012 are complete.

### Checkpoint C3 — reusable solving/durability authorities complete

T-017, then T-018, then T-019 form the intentional central integration spine. They are serialized because they converge on control/durability/runtime wiring and would otherwise generate high-conflict parallel branches.

T-020 follows T-019 but is isolated enough to remain a distinct PR.

### Checkpoint C4 — runtime assembly complete

T-021 integrates retained Domain-App capabilities and central exports.

Immediately after T-021 merge:

- start T-022 Node Host wave;
- start T-023 Expo Host wave;
- start T-025 docs/examples in parallel.

### Checkpoint C5 — host validation complete

T-024 consumes both exact host validation results. T-026 consumes T-024 + T-025.

## 6. L3 / Task-Pack Rule

T-001–T-024 are `L3: REQUIRED` unless a generated Task Pack explicitly justifies otherwise. T-025 is documentation-focused but must still identify executable examples/tests. T-026 is closure/reconciliation rather than new implementation.

Required evidence order:

```text
Tests
→ Contract / Interface
→ Core Implementation
→ Failure Handling
→ Reference
```

A task implementation conversation must read:

1. its GitHub Execution Issue / Task Pack;
2. Frozen PRD + PRD Amendment A1;
3. Frozen L2 + L2 Amendment A1;
4. exact dependency-complete `v0.3` base SHA;
5. only the research evidence explicitly referenced by the task when extra detail is required.

## 7. Dedicated Local Environment Waves

### 7.1 T-022 Node Build Host validation wave

This is the primary concentration point for real Node/local durability evidence.

Validate the exact T-021 integration SHA for at least:

- Node SQLite open/migrate/reopen;
- canonical digest parity on the real host;
- Promoted Artifact Registry persistence + retention;
- exact semantic cache persistence/quarantine/invalidation;
- atomic/non-torn `DomainActivationBinding` publication/read under concurrent activation movement;
- `GovernanceExecutionPin` durability before first authoritative state-changing control publication;
- recursive snapshot + `executionFactRevision` + DynamicChildExecutionPin + AI/query/effect journal ordering;
- crash after committed AI/query/effect before newer snapshot → no duplicate committed work;
- crash before commit → documented retry/recovery semantics;
- retained instance package P1 + governance B1 while fresh activation moves to P2/B2;
- alias movement after dynamic child starts → recovered child reuses exact pinned digest;
- revoked artifact behavior for deny/fallthrough and produced-cache invalidation;
- persistent deadlines/callback source identities;
- provisioning idempotency;
- process data and command outcomes across restart;
- no duplicate durable business mutation.

Prefer one prepared Build Host checkout/session and one deterministic crash-window batch over per-feature ad-hoc local validation.

### 7.2 T-023 Expo Android/Hermes validation wave

Validate the exact T-021 integration SHA on real Expo Android/Hermes + `expo-sqlite`:

- portable core loads with no mandatory Node built-ins;
- logical store schema/transactions satisfy shared contracts;
- Promoted Registry, semantic cache and GovernanceExecutionPin persist/reopen;
- force-stop/relaunch preserves exact package + governance + child pins;
- committed AI/query/effect work is not duplicated after restart;
- process data, deadlines/callbacks and command outcomes survive according to frozen product semantics;
- host/local capability binding works without leaking app-specific concepts into core;
- generated App contracts remain portable;
- fail-closed behavior matches Node for incompatible/corrupt/missing exact authority.

Again, batch device/emulator setup and validation in one task rather than repeating it across feature PRs.

### 7.3 T-024 cross-host/migration validation

Consume T-022/T-023 exact-SHA evidence and verify:

- Node/Expo logical conformance;
- pre-A1 snapshot/instance without provable GovernanceExecutionPin does not bind `current` silently;
- deterministic migration succeeds only when exact historical authority can be proven;
- otherwise migration/recovery fails closed;
- package, governance, promoted-artifact and cache retention/GC cannot delete recoverable authority;
- v0.2 persisted behavior remains historical and v0.3 migration is explicit;
- Amendment review vectors V1–V12 pass at the applicable integration/host level.

## 8. Write-Set / Conflict Strategy

To preserve parallelism:

- T-002–T-007 should prefer new/narrow contract modules and focused tests.
- T-008–T-011 own retained capability modules, not central runtime assembly.
- T-012 owns promoted-registry lifecycle modules.
- T-013 owns semantic-cache modules.
- T-014 owns governance activation/pin persistence modules.
- T-015 owns operator authority/audit transition modules.
- T-016 owns Harness journal/observed-dependency integration.
- T-017–T-019 are allowed central runtime/compiler edits because they are serialized integration-spine tasks.
- T-021 owns final public exports/runtime assembly and should absorb harmless barrel conflicts rather than forcing earlier parallel tasks to coordinate.

If a leaf task discovers it must edit a central integration file owned by T-017/T-018/T-019/T-021, prefer a narrow seam/fixture and leave central wiring to the owner task unless the dependency contract cannot otherwise be implemented.

## 9. Review / Validation Rules

For every implementation PR:

- PR current HEAD must equal the reviewed/validated SHA for any PASS evidence;
- HEAD movement invalidates prior exact-SHA validation unless the standard explicitly permits inheritance and the change is proven non-behavioral;
- changed paths must remain within the Task write set;
- P0/P1 block merge;
- execution-dependent uncertainty requires `VALIDATION_REQUEST`, not guessed PASS;
- one concern PR merges into `v0.3` as soon as its local gates/review are satisfied; do not wait for the whole version;
- host durability remains unproven until T-022/T-023 exact-SHA evidence exists.

## 10. Amendment Review Carry-forward Acceptance

The following SHALL appear in the relevant task acceptance/tests:

- governance-critical classification defaults to critical;
- no generic non-LLM activation loophole;
- exact Governance Baseline ↔ package/CDI binding and retained-instance recovery;
- narrow supersession only; Non-Goals/deferred scope remains closed;
- ADR-08 human/operator promotion is not weakened;
- Experimental/L4 requirements are conditional and fallback exact;
- `DomainActivationBinding` publication/read is non-torn as one logical tuple;
- running instances never re-resolve floating package/governance/child authority during recovery.

## 11. Release Boundary

T-001–T-025 completion does not equal release PASS.

T-026 must reconcile the exact v0.3 candidate against:

- Frozen PRD + Amendment A1;
- Frozen L2 + L2 Amendment A1;
- all Task acceptance evidence;
- V1–V12;
- existing durability/cache/effect/recovery gates;
- Node/Expo exact-SHA evidence;
- migration/retention evidence;
- repository CI/full regression when available;
- package artifacts;
- owner-held Hidden Validation / Critical Journeys;
- unresolved P0/P1 findings.

Only after release qualification may `v0.3` merge to `main` and be tagged/baselined.
