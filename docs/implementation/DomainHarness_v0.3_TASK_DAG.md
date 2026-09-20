# Task DAG — DomainHarness v0.3

**Status:** FROZEN EXECUTION PLAN — READY FOR TASK PACK / ISSUE MATERIALIZATION  
**Created:** 2026-09-20  
**Version integration branch:** `v0.3`  
**Task branch convention:** `v0.3_tNNN`  
**Authority source baseline:** `v0.3_l2_synthesis@fb793191c3b8fc827af54f88b0e06c2c52fef61d`

> This DAG is the formal implementation decomposition derived from the frozen v0.3 PRD and frozen v0.3 L2 Architecture Evidence. It preserves one-concern/one-PR execution, delays central wiring until the underlying contracts are merged, and separates host-specific persistence work so Node and Expo/Hermes can progress independently after common contracts freeze.

## 1. Frozen Inputs

Authority order:

1. Product: `docs/product/DomainHarness_v0.3_PRD_FROZEN.md` (Git blob `6a6fb59b156f576d48828019faf0e6039d08d5af`).
2. Architecture: `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_EVIDENCE_FROZEN.md` (Git blob `4a4755d1bb1f05a71ad0275cf12713f254335144`).
3. Project overrides: `.dev-standard/PROJECT_OVERRIDES.md` on `v0.3`.
4. Pinned standard: `.dev-standard/VERSION` → `kaicreator-mm/ai-development-standard@0446f04583f6cf464c835f26e2f657c8b703cb4e` (`2.0.0`).

The pre-L2 `DomainHarness_v0.3_ARCHITECTURE_BASELINE_FROZEN.md` and research/L2 Issues #187/#194/#195/#196/#197/#201/#203/#204/#205 are evidence/history, not competing downstream implementation authorities.

No task may reintroduce:

- a peer Harness/agent runtime beside XState;
- LLM-owned parent state ids or transition authority;
- semantic cache as execution replay truth;
- automatic LLM promotion or implicit latest/fuzzy promoted-artifact selection;
- mutation from HarnessMachine/promoted workflow outside durable effect authority;
- recovery by active-package substitution or alias re-resolution;
- provider/model routing inside DomainHarness business control logic.

## 2. Planning Labels vs Release Gates

Task validation labels in this DAG are planning shorthand. They do **not** create new product release gates.

Mandatory release authority remains:

```text
Frozen v0.3 PRD Acceptance Criteria 1–28
→ Frozen v0.3 L2 ADR-01..ADR-20 / failure contracts
→ PROJECT_OVERRIDES
→ task-specific acceptance
→ pinned standard defaults
```

Every task validation result must bind to an exact commit SHA. `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN`, and an explicitly justified waiver are distinct states.

## 3. Task Table

| Task | Depends On | Parallel | Risk | Primary output / concern | Acceptance | Executor suitability | Required validation | Status |
|---|---|---:|---|---|---|---|---|---|
| **T-001 Shared v0.3 identity + canonical digest foundation** | — | NO | H | portable canonical JSON/digest seam; `CompiledArtifactIdentity`; exact package/artifact helpers; `DurableControlTurnId` primitives; shared error taxonomy | identical canonical vectors/digests across supported portable implementations; no mandatory Node dependency in portable core | High-capability implementation/review; Build Host for vectors | focused identity vectors + package-root portability + lint/typecheck/unit | TODO |
| **T-002 Domain Data / Compiled Domain Intelligence contracts** | T-001 | YES | H | `DomainIntelligencePackageIdentity`; package-bundled intelligence descriptors; semantic context projection descriptors/value digests | facts remain external authority; unrelated context does not change selected semantic identity; missing required projection fails closed | High-capability | identity/invalidation fixtures from #205 + contract tests | TODO |
| **T-003 Semantic invocation + semantic revision contracts** | T-001, T-002 | YES | H | exact semantic invocation material; `SemanticRevisionPort`; deterministic pre-read; cache eligibility; `ObservedDependencySet` | exact key excludes execution-only identity by default; missing required revision fails closed; dynamic unversioned dependency becomes cache-ineligible | High-capability | exact-key equivalence/invalidation/pre-read fixtures | TODO |
| **T-004 WorkflowCandidate IR + deterministic validator** | T-001, T-002 | YES | H | constrained candidate/validated IR; finite events; allowlisted capabilities; applicability; execution bounds | reject arbitrary code, unknown tool/capability, illegal event, cycles, provider secrets/state, direct mutation authority and invalid contracts | High-capability | adversarial validator suite based on #196/#204 | TODO |
| **T-005 Promoted Artifact Registry core lifecycle** | T-001, T-004 | YES | H | explicit promotion; immutable content-addressed artifact body; audit; exact digest/version/alias selection; revocation policy; retention/reference accounting APIs | candidate ≠ promoted; promotion recomputes digest; alias resolves to exact immutable digest; no implicit latest/fuzzy/LLM selection; revoked artifact body retained while pinned | High-capability | lifecycle/selection/revocation/retention contract suite | TODO |
| **T-006 Node persistent Promoted Artifact Registry adapter** | T-005 | YES | M | Node/SQLite persistent registry implementation | artifact bodies/audit/revocation survive hard process restart; digest integrity enforced | Standard implementation + Build Host | Node persistence/reopen/kill focused tests | TODO |
| **T-007 Expo/Hermes persistent Promoted Artifact Registry adapter** | T-005 | YES | H | Expo `expo-sqlite` registry implementation | same logical registry contract as Node; survives force-stop/relaunch; no Node built-ins | High-capability + real Expo validation | shared registry conformance + real Hermes force-stop/relaunch | TODO |
| **T-008 Pinned-package promoted compatibility + one-shot selection** | T-002, T-005 | YES | H | invoking-`packageId` compatibility/reference resolver; once-resolved selection object reused through identity/compatibility/pin/compiler/telemetry | fresh incompatibility falls through; recovery never uses globally active package; alias is not resolved twice in one invocation | High-capability | retained-package/alias-movement fixtures | TODO |
| **T-009 DurableExecutionStore + Durable Control Turn contract** | T-001, T-005 | NO | H | one per-instance durability domain; source receipts; instance revisions; control snapshots; dynamic-child pins; AI/query/effect journal interfaces; transaction/CAS contract | correctness-critical records share one ordering domain; no snapshot may acknowledge progress ahead of required durable facts | High-capability | contract/model tests for source-turn identities, CAS and ordering | TODO |
| **T-010 Node DurableExecutionStore adapter** | T-009 | YES | H | Node SQLite implementation for message/control-turn receipts, snapshots, pins and journals | hard-kill/reopen preserves acknowledged facts and ordering; atomic control-turn publication works | High-capability + Build Host | Node SQLite contract + process-kill fixtures | TODO |
| **T-011 Expo/Hermes DurableExecutionStore adapter** | T-009 | YES | H | Expo SQLite implementation of the same logical durability domain | force-stop/relaunch preserves acknowledged facts; same CAS/order semantics; portable core stays Node-free | High-capability + real Expo validation | shared store conformance + real Hermes force-stop/relaunch | TODO |
| **T-012 Recursive XState control snapshot + fail-closed restore** | T-009 | YES | H | parent/child recursive snapshot envelope; engine/package/machine identities; restore validation | parent/child control position and process-local data restore; corrupt/incompatible/missing snapshot or impossible fence fails closed | High-capability | recursive snapshot/restore/corruption suite based on #201/#195 | TODO |
| **T-013 DynamicChildExecutionPin + journal-first ordering integration** | T-008, T-009, T-012 | NO | H | insert-once logical invocation pin; `executionFactRevision` fence; atomic turn publication; journal-first advancement rules | promoted child cannot perform journaled work or authoritative terminal output before exact pin commit; conflicting digest in same slot fails closed; stale snapshot reuses committed work | High-capability | crash-window matrix: before pin / after pin / after journal / before checkpoint | TODO |
| **T-014 HarnessMachine production child + ModelPort seam** | T-001, T-003, T-009 | YES | H | reusable XState child; bounded model/query observation loop; max steps; cancellation; structured result validation; execution-journal replay; observed dependencies | Harness is not a peer runtime; no direct mutation; provider routing stays behind ModelPort; committed model/query facts replay without duplicate execution | High-capability | bounded-step/cancel/schema/journal replay tests | TODO |
| **T-015 Exact Semantic Result Cache core** | T-003, T-005 | YES | H | persistent logical cache port; exact key; `putIfAbsent`; producer/dependency indexes; quarantine; scoped invalidation; no journal coupling | cache hit proves computation only; current schema revalidation required; corrupt row quarantines/recomputes; revocation can invalidate by exact producer/dependency | High-capability | #194/#203 exact-reuse + corruption + scoped invalidation suite | TODO |
| **T-016 Node exact semantic cache adapter** | T-015 | YES | M | Node persistent semantic cache | survives process restart; atomic first-writer-wins; separate logical authority/keyspace from execution journals | Standard implementation + Build Host | Node cache persistence/concurrency/reopen tests | TODO |
| **T-017 Expo/Hermes exact semantic cache adapter** | T-015 | YES | H | Expo persistent semantic cache | same logical contract as Node when cache is enabled; survives force-stop/relaunch | High-capability + real Expo validation | shared cache conformance + Hermes persistence evidence | TODO |
| **T-018 Promoted subworkflow compiler** | T-004, T-005, T-008 | YES | H | exact promoted artifact → reusable XState child definition; finite allowed events/capabilities; applicability contract | compiler accepts only validated/promoted exact artifact bodies; no arbitrary code; cycles fail closed; no mutation-capable binding | High-capability | compiler fixtures + clean child execution examples | TODO |
| **T-019 DecisionResolver core** | T-003, T-008, T-014, T-015, T-018 | NO | H | `Rule → Exact Cache → Promoted Subworkflow → HarnessMachine` orchestration; shared fallthrough/fail-closed taxonomy; provenance | resolver source order preserved; required semantic input never hidden; one selected promoted object reused; no hidden retry after a resolved decision | High-capability | deterministic resolver matrix including cache-ineligible and revocation cases | TODO |
| **T-020 Domain Machine / XState integration + schema/guard handoff + telemetry** | T-010, T-011, T-012, T-013, T-019 | NO | H | central runtime wiring from reasoned decision to current schema/event/guard/transition; child terminal Durable Control Turns; resolver telemetry/LLM avoidance | LLM/result cannot set parent state id; guard rejection does not trigger hidden resolver fallback; child terminal state changes have durable source identity | High-capability | integrated Rule/Cache/Subworkflow/Harness flows + guard rejection + telemetry | TODO |
| **T-021 Host/local Domain Tool registration + durable mutation effect binding** | T-009 | YES | H | registered host tool seam without loopback HTTP; explicit query/read vs mutation capability binding | local tool obeys declared effect/journal/recovery semantics; mutation tool executes only under durable effect authority; credentials stay out of package semantics | High-capability | local query + mutation crash/idempotency scenarios | TODO |
| **T-022 Durable process-local data conformance** | T-012, T-020 | YES | M | process/context data persistence/update semantics inside control snapshot | process data survives restart while remaining distinct from authoritative Business State | Standard implementation + review | restart + business-authority boundary tests | TODO |
| **T-023 First-class command outcomes + normal rejection** | T-009, T-020 | YES | H | durable `applied / rejected / failed / abandoned` observable outcome semantics | valid normal rejection does not poison instance or force `recovery_required`; outcome publication aligns with durable message turn | High-capability | outcome/rejection/recovery regression matrix | TODO |
| **T-024 Idempotent instance provisioning/open** | T-009 | YES | M | atomic ensure/open semantics | concurrent/retried provisioning creates one logical instance and stable identity; no query-then-insert race | Standard implementation | concurrency/idempotency focused tests on Node + adapter conformance | TODO |
| **T-025 Persistent timer/deadline + durable timer turn** | T-009, T-020 | YES | H | durable timer record; deterministic timer-fire source identity; restart recovery | deadline survives restart; one logical wake-up; duplicate fire is deduped; timer becomes Durable Control Turn, not volatile-only XState timer | High-capability | restart/duplicate-fire/crash-window tests | TODO |
| **T-026 Generated typed v0.3 app contracts** | T-002, T-003 | YES | M | compiler-generated command/message/outcome/view/decision/task I/O TypeScript contracts | generated surface derives from package contracts; projects need not hand-duplicate schemas; no new authority leaks through generated types | Standard implementation + compiler review | type-level fixtures + consumer package smoke | TODO |
| **T-027 Long-running external work correlation/resume** | T-021, T-023, T-025 | YES | H | durable submit effect + correlation identity + callback/deadline resume pattern | external job platform stays outside DomainHarness; duplicate callback/deadline cannot duplicate logical resume/mutation | High-capability | callback/timer race + crash/restart Critical Journey | TODO |
| **T-028 Portable v0.3 Runtime assembly + public API** | T-006, T-007, T-010, T-011, T-013, T-016, T-017, T-020, T-021, T-022, T-023, T-024, T-025, T-026, T-027 | NO | H | central exports/factories/wiring for Domain Machine, registry, stores, cache, resolver, tools and app-facing API | runtime starts from exact compiled package + host resources; portable root cannot reach mandatory Node built-ins/SQLite driver; all authority boundaries remain explicit | High-capability | package-root import graph + build/typecheck/unit + packed clean consumer smoke | TODO |
| **T-029 Shared v0.3 deterministic conformance / validation harness** | T-028 | NO | H | product-level conformance suite for common Node/Expo observable semantics | suite avoids asserting driver row ids/timestamps/XState internal representation; covers PRD ACs that are deterministic/common | High-capability | suite self-test + host harness parity | TODO |
| **T-030 Node v0.3 Critical Journeys + hard-kill recovery** | T-029 | YES | H | real Node/SQLite integrated CJ runner | prove journal-first replay, dynamic-child exact pin recovery, cache persistence, timer/callback recovery and no duplicate committed mutation across hard kill | Build Host execution + independent review | exact-SHA real process kill/reopen matrix | TODO |
| **T-031 Expo Android/Hermes v0.3 Critical Journeys + force-stop recovery** | T-029 | YES | H | real Expo/Hermes integrated CJ app/runner | same product-level guarantees as supported Node profile under force-stop/relaunch; no Node-only runtime dependency | Real Android/Hermes Build Host + independent review | exact-SHA device/emulator force-stop/relaunch matrix | TODO |
| **T-032 Semantic reuse + promoted artifact + retained-package recovery integration matrix** | T-029 | YES | H | focused integration scenarios spanning alias movement, revocation/cache invalidation, package A/B retained pins and promoted child recovery | in-flight/recovery never re-resolves alias or substitutes active package; revoked fresh selection follows policy; cache invalidation is scoped; mutation remains effect-authoritative | High-capability + Build Host | cross-feature deterministic matrix, run on supported hosts where persistence is material | TODO |
| **T-033 v0.2→v0.3 SDK docs / migration / integration guide** | T-028 | YES | M | v0.3 architecture/use guide; Domain Machine + HarnessMachine + cache + promoted artifact lifecycle; host persistence guidance | docs reflect one XState control runtime and exact authority boundaries; no obsolete Track A/B or peer Harness Runtime wording | Documentation/review model | docs consistency review + examples compile/smoke | TODO |
| **T-034 v0.3 visible closure + candidate/Hidden Validation handoff** | T-030, T-031, T-032, T-033 | NO | H | exact candidate SHA; PRD AC1–28 matrix; L2 invariant matrix; CI/Validation/CJ evidence; known limitations; HV handoff | every mandatory visible gate has exact-SHA evidence and state; no unresolved P0/P1 runtime blocker; only then candidate may freeze for owner-held Hidden Validation | Highest-capability closeout + independent review | full repository validation + real-host matrices + candidate freeze checklist | TODO |

Status values: `TODO / DOING / BLOCKED / DONE / DEFERRED / NOT_APPLICABLE`.

## 4. Dependency Shape

```text
T-001 Shared identity / digest / control-turn primitives
  │
  ├─ T-002 Domain Data contracts
  │    ├─ T-003 Semantic invocation / revision contracts
  │    │    ├─ T-014 HarnessMachine
  │    │    └─ T-015 Semantic cache core ─┬─ T-016 Node cache
  │    │                                  └─ T-017 Expo cache
  │    └─ T-004 Candidate IR / validator
  │          └─ T-005 Promoted Registry core ─┬─ T-006 Node registry
  │                                            ├─ T-007 Expo registry
  │                                            └─ T-008 pinned-package compatibility / once-resolution
  │
  └─────────────────────────────┐
                                ▼
                     T-009 DurableExecutionStore contract
                       ├─ T-010 Node store
                       ├─ T-011 Expo store
                       └─ T-012 recursive XState snapshot
                              │
                 T-008 + T-009 + T-012
                              ▼
                 T-013 DynamicChildExecutionPin / ordering

T-004 + T-005 + T-008 ─────────────→ T-018 promoted child compiler
T-003 + T-008 + T-014 + T-015 + T-018
                                           ↓
                                      T-019 DecisionResolver
                                           │
T-010 + T-011 + T-012 + T-013 + T-019 ───┤
                                           ▼
                                      T-020 Domain Machine integration

Retained Domain App capabilities:
  T-021 local Tool binding         ← T-009
  T-022 process data               ← T-012 + T-020
  T-023 command outcomes           ← T-009 + T-020
  T-024 provisioning               ← T-009
  T-025 timer/deadline             ← T-009 + T-020
  T-026 generated contracts        ← T-002 + T-003
  T-027 long-running external work ← T-021 + T-023 + T-025

Host adapters + core integration + retained capabilities
                     ↓
                 T-028 Runtime assembly
                     ↓
                 T-029 Conformance harness
                 ┌────┼──────────────┐
                 ▼    ▼              ▼
              T-030 T-031          T-032
              Node  Expo     semantic/promoted/recovery matrix
                 └────┬──────────────┘
                      │
T-033 docs ───────────┤
                      ▼
                 T-034 Visible closure / HV handoff
```

## 5. Parallel Waves

### Wave A — Common contract foundation

`T-001` is intentionally first because semantic identity, promoted artifact identity, durable control-turn identity and shared failure taxonomy are cross-cutting contracts.

After T-001 merges, the following may proceed in parallel where their direct dependencies are met:

- Domain Data / semantic contracts (`T-002`, then `T-003`);
- candidate/promoted lifecycle (`T-004`, then `T-005`);
- later, host adapters split cleanly by Node/Expo.

### Wave B — Registry + durability + reasoning/cache

After shared contracts exist:

- `T-006` and `T-007` may implement registry persistence in parallel;
- `T-009` freezes the `DurableExecutionStore` transaction/ordering contract before Node/Expo store work;
- `T-010` and `T-011` may then proceed in parallel;
- `T-014` HarnessMachine and `T-015` semantic cache core may proceed in parallel once their contracts are ready;
- `T-016` and `T-017` split semantic-cache persistence by host.

### Wave C — Integration authority

`T-019` and especially `T-020` are central-wiring tasks. Earlier tasks MUST NOT opportunistically implement the final resolver/Domain Machine orchestration merely to make local tests convenient.

### Wave D — Retained Domain App capabilities

`T-021..T-027` are independent concerns wherever dependencies permit. They may run concurrently in separate conversations from the same dependency-complete `v0.3` checkpoint.

### Wave E — Assembly and validation

`T-028` owns public assembly/shared exports. `T-029` owns common v0.3 conformance. Real Node (`T-030`) and Expo (`T-031`) validation then run in parallel. `T-032` specifically validates cross-feature identity/recovery interactions rather than duplicating generic host conformance.

## 6. Write-set / Conflict Rules

Formal task packs SHALL declare exact write sets, but this DAG fixes the ownership intent:

- portable contracts/runtime: `packages/domain-harness/**`;
- compiler/candidate/generated contracts: `packages/domain-harness-compiler/**`;
- Node persistence/bindings: `packages/domain-harness-node/**`;
- Expo/Hermes persistence/bindings: `packages/domain-harness-expo/**`;
- shared conformance/CJ fixtures: `tests/**` according to task concern;
- central package exports/runtime assembly: deferred to `T-028` where practical;
- version closure/evidence docs: deferred to `T-034`.

A task requiring a shared-file edit outside its concern should either defer the wiring to the owning integration task or document why the edit is unavoidable. Opportunistic sibling-scope implementation is prohibited.

## 7. Branch / Review Protocol

```text
version branch: v0.3
Task T-NNN branch: v0.3_tNNN
PR base: v0.3
one concern → one task branch → one PR
```

Before implementation, every execution conversation must:

1. read current Issue/task pack (when materialized), frozen v0.3 PRD, frozen v0.3 L2, this DAG and current `PROJECT_OVERRIDES`;
2. verify every `Depends On` task is merged into `v0.3`;
3. record the exact dependency-complete `v0.3` base SHA;
4. create/reuse only the named task branch;
5. keep the write set bounded;
6. run all validation possible in the current environment and request exact-SHA Build Host evidence for unavailable real-host requirements;
7. never infer PASS from research evidence or validation performed against a different SHA.

Task PRs target `v0.3`; they do not merge directly to `main`.

## 8. L3 Rule

High-risk tasks default to `L3: REQUIRED`. The task pack must provide implementation evidence in this order:

```text
Tests
→ Contract / Interface
→ Core Implementation
→ Failure Handling
→ Reference / Examples
```

At minimum, L3 is REQUIRED for:

```text
T-001, T-002, T-003, T-004, T-005, T-008,
T-009, T-010, T-011, T-012, T-013, T-014, T-015,
T-018, T-019, T-020, T-021, T-023, T-025, T-027,
T-028, T-029, T-030, T-031, T-032, T-034
```

A lower-risk adapter/docs task may use a shorter task-specific implementation note if its parent contract is already frozen and no architecture choice is being reopened.

## 9. Required Cross-task Invariants

These invariants are checked continuously and again at closure:

1. **One control authority:** XState Domain Machine remains final business transition authority.
2. **Resolver order:** Rule → Exact Cache → Promoted Subworkflow → HarnessMachine.
3. **No hidden fallback after guard rejection:** current guard rejection ends that transition attempt.
4. **Exact execution vs semantic reuse:** `packageId`/execution-operation identity never collapses into semantic cache identity.
5. **Exact promoted recovery:** an in-flight promoted child is recovered from its durable exact pin/body, never by alias/current-package substitution.
6. **Journal-first:** committed AI/query/effect facts precede control advancement past that work.
7. **Mutation authority:** proposed action becomes mutation only through durable effect identity/idempotency.
8. **Fail-closed semantic inputs:** missing required projection/revision is not converted into cache bypass/LLM fallback.
9. **Promotion governance:** proposal → validation → explicit promotion → exact selection → execution.
10. **Provider boundary:** ModelPort/AI Runtime owns provider/model strategy.
11. **Portable core:** no mandatory Node built-in/driver dependency from the root portable package.
12. **Cross-host logical parity:** Node and Expo adapters may differ physically but not in frozen logical guarantees.

## 10. Version Closure Boundary

Completion of `T-001..T-033` is not Release PASS.

`T-034` must identify one exact candidate SHA and reconcile:

- PRD Acceptance Criteria 1–28;
- L2 ADR-01..ADR-20 and failure/fallthrough matrix;
- root package portability;
- real Node hard-kill/reopen evidence;
- real Expo/Hermes force-stop/relaunch evidence;
- promoted Registry persistence and exact retained-child recovery;
- semantic-cache persistence/exactness/invalidation;
- no duplicate committed AI/query/effect/mutation under supported recovery windows;
- timer/callback/long-running external-work journeys;
- full repository validation and configured Minimal CI state;
- unresolved P0/P1 findings;
- Hidden Validation preparation/handoff.

Only after mandatory visible gates pass on that same exact SHA may a `CANDIDATE_FROZEN_SHA` be recorded and owner-held Hidden Validation executed. Only release authority may then declare v0.3 READY/taggable.
