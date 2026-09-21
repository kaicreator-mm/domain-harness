# T-019 — Domain Workflow central admission + durable effect handoff

**Issue:** #237  
**Branch:** `v0.3_t019`  
**L3:** REQUIRED  
**Execution-start dependency-complete baseline:** `v0.3@ea1092a1dce9f80f31e3a0183e8b1a0e958260d2`  
**Pinned development standard:** `ai-development-standard@0446f04583f6cf464c835f26e2f657c8b703cb4e`

> No standalone T-019 Task Pack existed on the exact dependency-complete baseline. Issue #237 plus the frozen v0.3 Task DAG are the task authority; this file is the required T-019 L3 implementation evidence/reference.

## 1. Frozen authority consumed

- Issue #237 latest body.
- Frozen v0.3 L2 Architecture Evidence, especially §13 (Durable Control Turns, recursive persistence, committed-work ordering), §15 (Mutation and Durable Effect Authority), §16.3 (command outcomes), §17.1–17.7 (end-to-end decision flows, incl. child completion without external message), §18 (failure/fallthrough matrix: guard rejection = no transition + no hidden resolver retry; completed durable effect found during recovery = reuse, never re-mutate), ADR-02 (Domain Machine owns final transition authority), ADR-11 (business mutation remains behind durable effect authority), ADR-12 (every state-changing macrostep is a Durable Control Turn), ADR-13 (committed external work is journal-first within one durability domain), ADR-14 (control snapshot and execution journal remain separate logical authorities).
- Frozen L2 Amendment A1 + freeze record, especially §4 (one business control runtime; no peer runtime), §8.1 (Guard/Hard Invariant purity + required path `structured result → schema → pinned Hard Invariants → guard → transition → durable effect intent`; Hard Invariants evaluated using the exact `GovernanceExecutionPin`, never a floating active baseline), §9 (Business Harness boundary: never sets state, never bypasses schema/HI/guard), and the §19 review vectors V1–V8 + V12.
- v0.3 Task DAG (`T-019 | depends_on: T-006,T-014,T-018`; T-017–T-019 are the serialized central integration spine).
- `.dev-standard/VERSION` and `.dev-standard/PROJECT_OVERRIDES.md`.
- T-006 final merged Domain Workflow / predicate authority (`src/workflow/`), including `DomainHardInvariantPredicate`, the preparation boundaries and the pure evaluators.
- T-014 final merged governance execution authority (`src/governance/`), including `GovernanceExecutionCoordinator.requirePinnedExecution` — its own contract comment names T-019 as the owner of the central Workflow wiring of this gate.
- T-018 final merged DecisionResolver authority (`src/decision-resolver/`), whose `ResolvedDecision` is the single structured-result input consumed here.
- T-018 review P3 carryovers, closed on this branch by commit `a2ca322` (journal-failure leg of `DECISION_RESOLVER_HARNESS_FAILED`; promoted `effectIntents` asserted at the resolver boundary).

## 2. Tests

Focused deterministic tests under `packages/domain-harness/tests/admission/`:

- `admission.test.ts` — central authoritative path, frozen-order and authority matrix.
- `effects.test.ts` — durable effect handoff, journal-first ordering and recovery matrix.
- `governance.test.ts` — pinned-governance authority matrix (Amendment A1 V1/V2 + per-admission pin gate).

The matrix proves:

1. the full frozen path runs in order for an admitted message turn: structured result → current schema → pinned Governance Baseline Hard Invariants → current guard → transition → durable effect intent (§15, A1 §8.1), and the admission evidence carries the exact `governanceBindingDigest` of the pin actually used;
2. **every resolver source passes the same admission** (`rule` / `exact-cache` / `promoted-subworkflow` / `harness-machine`): a Hard-Invariant-violating structured decision is denied identically for all four sources, so Business Harness, the exact cache and a promoted child can never bypass admission (A1 §9, V6);
3. **pinned governance is used for every authoritative admission** (V1): the instance pin references baseline B1 while the baseline store also holds a moved/lenient B2; admission denies exactly per B1's Hard Invariant and never consults any floating/active lookup — the admission ports expose no such lookup by construction;
4. **missing pinned baseline fails closed** (V2): the pin references B1 but the exact B1 body is unavailable/corrupt/identity-mismatched → `ADMISSION_PINNED_BASELINE_UNAVAILABLE`, no B2 substitution, no transition, no effects;
5. a missing durable `GovernanceExecutionPin` fails the admission closed before any schema/predicate work (T-014 `GOVERNANCE_EXECUTION_PIN_MISSING` propagates);
6. **guard/HI purity is preserved** (V5): guards and Hard Invariants are data-only `DomainPredicate`s evaluated by the T-006 pure evaluator; a guard or Hard Invariant carrying a function/accessor/non-JSON value is rejected at the preparation boundary (`PredicateContractViolation`) and fails the admission closed — model/tool/external I/O inside a predicate is unrepresentable;
7. **schema denial is source-agnostic**: a structured decision violating the declared current schema is denied (`schema`) before any Hard Invariant or guard evaluation, whatever the source;
8. **guard rejection is final** (S7, §18): a guard-rejecting transition yields a `denied` outcome with `reason: 'guard'` — no transition, zero effects, and no hidden resolver retry (the admission API has no resolver port; the `ResolvedDecision` arrives as data);
9. a current state with no transition for the turn trigger yields `denied` with `reason: 'no-candidate-transition'` (engine-neutral no-op semantics; no effects);
10. **mutation remains durable-effect authority** (ADR-11, §15): effect intents execute only through the journal-first durable effect protocol against the mutation-capable host tool port; promoted child `effectIntents` carried in resolver provenance are data only and are never auto-executed by admission — a transition that declares no effect intents executes zero effects even when provenance carries intents;
11. **cache hit ≠ mutation happened** (§15): an `exact-cache`-sourced decision admitted under a fresh turn executes its declared effects through the durable effect journal — authority comes from the journal protocol, not from the cache entry;
12. **journal-first ordering** (§13.4, ADR-13): every effect is durably `completed` in the journal before the admission returns its admitted plan; an effect tool failure commits the `failed` journal record and then fails the admission closed (`ADMISSION_EFFECT_FAILED`) so no admitted transition/effect plan is ever published past failed committed work;
13. **completed durable effect found during recovery is reused, never re-executed** (§18, V8, V12): after a simulated crash (fresh admission orchestrator over the same durable journal), the same turn source re-admits with `disposition: 'replayed'` and the host tool call count stays at 1 — committed work is not repeated and Runtime-Evidence-style provenance plays no role in the reuse decision (admission has no evidence port);
14. a `started` journal record for a `none`/`idempotent` effect may re-execute under the same effect identity after reclaim; a `started` `non-idempotent` record is ambiguous and fails closed (`ADMISSION_EFFECT_AMBIGUOUS`);
15. an incompatible existing journal identity for the same effect id (same turn + ordinal, different input) fails closed (`ADMISSION_EFFECT_JOURNAL_CONFLICT`);
16. a durable effect whose tool is not bound for mutation-capable execution fails closed (`ADMISSION_EFFECT_TOOL_UNBOUND`) — undeclared tools can never enter the mutation path;
17. **Durable Control Turn identity** (§13.2): message, child-terminal, timer, callback and recovery sources derive distinct deterministic `durableControlTurnId`s; replaying the same source yields the same id;
18. **child completion without external message** (§17.7): a child-terminal turn admits a transition and executes effects whose identities derive from the child-terminal turn id — there is no message-id hole in effect/journal identity;
19. **reasoning remains explicit** (V6): a `harness-machine` sourced decision flows through the identical schema → HI → guard → transition path; admission itself never mutates workflow state — its admitted output is a plan (transitionKey/targetState/committed effects) for the parent control-turn publication, and a Harness decision that fails a Hard Invariant is denied like any other source;
20. **resolver telemetry / LLM-avoidance surfaces at the turn boundary** (§21): the admission outcome echoes `source`, `llmAvoided`, `freshModelCallCount`, `cacheDisposition.read/write` and the telemetry event count from the consumed `ResolvedDecision` so the Durable Control Turn receipt can record them (Runtime Evidence persistence is T-020).

Amendment A1 V3 (governance self-approval), V4 (pre-change evaluation) and V7 (candidate revalidation after governance change) are promotion/activation authority concerns owned by the merged T-004/T-015 modules; T-019 consumes only exact pinned baselines and contains no governance-change evaluation path, so those vectors are not re-fixtured here. Real kill/reopen durability is deferred to T-022/T-023 per Issue #237; T-019 proves the portable logical contract with volatile stores.

## 3. Contract / Interface

Module: `packages/domain-harness/src/admission/`

### 3.1 Durable Control Turn identity (§13.2)

```ts
export type AdmissionTurnSource =
  | { readonly kind: 'message'; readonly sourceMessageId: string }
  | { readonly kind: 'child-terminal'; readonly parentActorId: string; readonly childActorId: string; readonly invocationOrdinal: number; readonly terminalKind: 'done' | 'error' }
  | { readonly kind: 'timer'; readonly timerId: string; readonly fireOrdinal: number }
  | { readonly kind: 'callback'; readonly externalCorrelationId: string; readonly callbackOrdinal: number }
  | { readonly kind: 'recovery'; readonly durableRecoveryActionId: string; readonly resumeOrdinal: number };

export function deriveDurableControlTurnId(target: WorkflowAddress, source: AdmissionTurnSource): string;
```

Deterministic, human-auditable ids (`turn:<workflowId>:<instanceKey>:message:<sourceMessageId>`, `…:child:<parentActorId>:<childActorId>:<invocationOrdinal>:<terminalKind>`, `…:timer:<timerId>:<fireOrdinal>`, `…:callback:<externalCorrelationId>:<callbackOrdinal>`, `…:recovery:<durableRecoveryActionId>:<resumeOrdinal>`). Empty identity components and non-positive ordinals are rejected (`ADMISSION_INVALID_TURN_SOURCE`). Synchronous XState microsteps settle inside the containing turn; every effect/query/AI operation identity derives from this turn id plus a stable operation ordinal.

### 3.2 Central admission request

```ts
export interface CentralAdmissionRequest {
  readonly target: WorkflowAddress;
  readonly turn: AdmissionTurnSource;
  /** Trigger the host turn loop matched for this turn (engine-neutral). */
  readonly trigger: DomainWorkflowTrigger;
  /** T-014 pin lookup key for this workflow instance. */
  readonly workflowInstanceId: string;
  /** Current engine-neutral Domain Workflow contract + control position. */
  readonly definition: DomainWorkflowDefinition;
  readonly currentStateKey: string;
  readonly context: JsonObject;
  /** Proposed structured Domain Event for this turn. */
  readonly event: DomainPredicateEvent;
  /** T-018 resolver output, consumed as data. */
  readonly resolved: ResolvedDecision<JsonValue>;
  /** Declared current schema authority for the structured decision. */
  readonly decisionSchema: { readonly isValid: (value: JsonValue) => boolean };
  /** Logical clock for journal records. */
  readonly now: string;
}
```

### 3.3 Ports (no peer runtime)

```ts
export interface CentralAdmissionPorts {
  /** T-014 gate: the exact durable GovernanceExecutionPin, required for EVERY admission. */
  readonly governance: GovernanceExecutionCoordinator;
  readonly baselines: GovernanceBaselineStore;
  readonly sha256: Sha256Port;
  /** Journal-first durable effect authority (ADR-13). */
  readonly effectJournal: AdmissionDurableEffectJournal;
  /** Mutation-capable host Domain Tool binding (§15, §16.1). */
  readonly effectTools: AdmissionEffectToolPort;
}
```

Admission is a pure orchestration function over these ports. It creates no actor system, owns no mailbox, evaluates no governance change and holds no resolver/evidence handle: one business control runtime (A1 §4), the Domain Machine keeps final transition authority (ADR-02).

### 3.4 Pinned Hard Invariant extraction

`semantics.hardInvariants` of the pinned baseline body is the only Hard Invariant source. The member, when present, must be an array of `{ invariantId: string, predicate: DomainPredicate }`; any malformed entry fails closed (`ADMISSION_PINNED_BASELINE_UNAVAILABLE` is reserved for body availability/integrity; malformed Hard Invariant content fails as `ADMISSION_INVALID_HARD_INVARIANTS`). Entries are prepared through `prepareDomainHardInvariantPredicate` and evaluated with `evaluateDomainHardInvariantPredicate` over admission-prepared context/event data — never over caller object identities.

### 3.5 Durable effect handoff

```ts
export interface AdmissionEffectToolPort {
  /** Resolve the declared mutation-capable tool for an effect type; undefined = unbound. */
  readonly resolve: (effectType: string) => AdmissionEffectToolBinding | undefined;
  readonly execute: (request: AdmissionEffectToolRequest) => Promise<JsonValue>;
}

export interface AdmissionEffectToolBinding {
  readonly effectType: string;
  readonly effectSemantics: ToolEffectSemantics; // 'none' | 'idempotent' | 'non-idempotent'
  readonly toolArtifact?: CompiledArtifactIdentity;
}
```

Effect identity: `effectId = <durableControlTurnId>/effect/<ordinal>` with the journal record carrying the compatibility material (`target`, `effectType`, canonical `input`, optional declared `idempotencyKey`). Re-begin semantics mirror the frozen store contract: identity excludes `attempt`/`startedAt`; a compatible existing record is returned unchanged, an incompatible one fails closed. A `completed` record is reused without re-execution (`replayed`); a `failed` record fails the admission closed; a `started` record re-executes only for `none`/`idempotent` semantics and is ambiguous (`ADMISSION_EFFECT_AMBIGUOUS`) for `non-idempotent`. Effects execute in declared order; every journal commit precedes the admission return (journal-first, §13.4).

### 3.6 Outcome

```ts
export type CentralAdmissionOutcome =
  | { readonly status: 'admitted'; readonly admitted: AdmittedAdmission }
  | { readonly status: 'denied'; readonly denial: AdmissionDenial };

export interface AdmittedAdmission {
  readonly durableControlTurnId: string;
  readonly governanceBindingDigest: string;
  readonly transitionKey: string;
  readonly targetState: string;
  readonly effects: readonly AdmittedEffectOutcome[]; // disposition 'executed' | 'replayed'
  readonly resolver: AdmissionResolverEvidence;     // source, llmAvoided, freshModelCallCount, cache read/write, telemetry count
}

export interface AdmissionDenial {
  readonly reason: 'schema' | 'hard-invariant' | 'guard' | 'no-candidate-transition';
  readonly durableControlTurnId: string;
  readonly governanceBindingDigest: string;
  readonly invariantId?: string;
  readonly transitionKey?: string;
  readonly guardId?: string;
  readonly resolver: AdmissionResolverEvidence;
}
```

Denials are terminal data: no transition, no effects, no retry channel. Integrity failures throw `CentralAdmissionError` (`ADMISSION_INVALID_TURN_SOURCE` / `ADMISSION_UNKNOWN_STATE` / `ADMISSION_UNKNOWN_GUARD` / `ADMISSION_PINNED_BASELINE_UNAVAILABLE` / `ADMISSION_INVALID_HARD_INVARIANTS` / `ADMISSION_EFFECT_TOOL_UNBOUND` / `ADMISSION_EFFECT_JOURNAL_CONFLICT` / `ADMISSION_EFFECT_AMBIGUOUS` / `ADMISSION_EFFECT_FAILED`); T-014 `GovernanceExecutionBindingError` propagates unchanged for pin absence/invalidity.

### 3.7 Additive seams

- `VolatileAdmissionEffectJournal` — portable deterministic logical-reference journal (no host durability claim), mirroring the frozen re-begin/complete semantics for fixtures and host adapter parity tests.
- `admissionResolverEvidence(resolved)` — small pure projector for the §21 telemetry handoff.
- The admitted plan deliberately excludes any engine state/snapshot reference so the host control-turn publication (T-021 wiring over the existing v0.2 engine + T-014 snapshot gate) remains the only mutation path.

## 4. Implementation flow

1. Validate the turn source and derive the `durableControlTurnId`.
2. `governance.requirePinnedExecution(workflowInstanceId)` — pinned governance for every authoritative admission; then load + `verifyGovernanceBaselineBody` + exact identity match against the pin; extract and validate the Hard Invariant list.
3. Prepare context/event/predicate data at the admission boundary (T-006 preparation functions only).
4. Schema gate: `decisionSchema.isValid(resolved.structuredDecision)` → deny `schema`.
5. Hard Invariant gate, in pinned declaration order → deny `hard-invariant` with the first failing `invariantId`.
6. Candidate selection: transitions of `currentStateKey` whose trigger equals the request trigger, in declaration order; first whose prepared guard passes is admitted; guard rejection on all candidates → deny `guard` (with the last evaluated `transitionKey`/`guardId`); no candidates → deny `no-candidate-transition`. Unknown current state / unknown guard reference → fail closed (definition integrity).
7. Durable effect handoff for the admitted transition's `effectIntents` in declaration order: resolve tool binding (fail closed when unbound) → journal begin/reuse → execute through the mutation-capable tool port when no completed record exists → journal commit.
8. Return the admitted plan + committed effect outcomes + resolver evidence. Admission never touches instance state, message dispositions or control snapshots — the parent Durable Control Turn publishes `source receipt + next instance revision + control snapshot` afterwards, inside the same durability domain (§13.3/§13.4).

## 5. Failure handling

| Condition | Behavior |
| --- | --- |
| malformed turn source | throw `ADMISSION_INVALID_TURN_SOURCE` |
| missing/invalid durable GovernanceExecutionPin | T-014 `GOVERNANCE_EXECUTION_PIN_MISSING` / `INVALID_GOVERNANCE_EXECUTION_PIN` propagate (fail closed) |
| pinned baseline body missing/corrupt/identity-mismatched | throw `ADMISSION_PINNED_BASELINE_UNAVAILABLE`; no substitution (V2) |
| malformed Hard Invariant content in the pinned body | throw `ADMISSION_INVALID_HARD_INVARIANTS` |
| structured decision violates current schema | deny `schema`; no HI/guard evaluation, no effects |
| Hard Invariant fails | deny `hard-invariant`; no transition, no effects |
| guard rejects all candidates | deny `guard`; no hidden resolver retry (S7) |
| no candidate transition for trigger | deny `no-candidate-transition` |
| unknown current state / unknown guard id | throw definition-integrity error (fail closed) |
| predicate data violates the JSON-only preparation boundary | `PredicateContractViolation` propagates (V5; fail closed) |
| effect tool unbound | throw `ADMISSION_EFFECT_TOOL_UNBOUND` |
| completed effect journal record exists | reuse output; `replayed`; never re-mutate (§18, V8, V12) |
| failed effect journal record exists | throw `ADMISSION_EFFECT_FAILED` (durable terminal truth; operator recovery owns retry) |
| started record, semantics `none`/`idempotent` | re-execute under the same identity, then commit |
| started record, semantics `non-idempotent` | throw `ADMISSION_EFFECT_AMBIGUOUS` |
| incompatible journal identity for same effect id | throw `ADMISSION_EFFECT_JOURNAL_CONFLICT` |
| effect tool execution throws/rejects | commit `failed` journal record, then throw `ADMISSION_EFFECT_FAILED` — no admitted plan is returned past failed committed work (§13.4) |
| effect journal store errors | throw `ADMISSION_EFFECT_JOURNAL_CONFLICT` (fail closed; mutation path never proceeds on an unreadable journal) |

## 6. Reference / Ownership boundary

- Consumes: T-006 (`DomainWorkflowDefinition`, guards, Hard Invariant predicate shape, pure evaluators), T-014 (`GovernanceExecutionCoordinator`, `GovernanceBaselineStore`, pin/baseline verification), T-018 (`ResolvedDecision`), v0.2 `WorkflowAddress`/`ToolEffectSemantics` contracts.
- Owns: the single central authoritative admission path, Durable Control Turn identity derivation, and the durable effect intent handoff protocol (journal-first).
- Does not own: resolver internals (T-018), XState actor execution (T-006 adapter + host wiring), control snapshot/message publication (existing v0.2 engine + T-014 snapshot gate; T-021 assembles the public runtime), Runtime Evidence persistence (T-020), host durability proof (T-022/T-023).

## 7. Scope boundary

Out of scope for T-019: public SDK surface/export wiring (T-021); Runtime Evidence module (T-020, consumes the admission evidence seam); real kill/reopen and host adapter durability (T-022/T-023); timer/callback/recovery *execution* loops (turn identity for all five sources is contracted and fixtured; only message + child-terminal paths are exercised end-to-end); governance change evaluation (T-004/T-015); XState microstep settling inside a turn (engine behavior; operation identities derive from the containing turn id by contract).
