# T-017 — Promoted child compiler/runtime + DynamicChildExecutionPin

**Issue:** #235  
**Branch:** `v0.3_t017`  
**L3:** REQUIRED  
**Execution-start dependency-complete baseline:** `v0.3@8c0c3ed226630ac9521ccde2d6272172bb42551e`  
**Pinned development standard:** `ai-development-standard@0446f04583f6cf464c835f26e2f657c8b703cb4e`

> No standalone T-017 Task Pack existed on the exact dependency-complete baseline. Issue #235 plus the frozen v0.3 Task DAG are the task authority; this file is the required T-017 L3 implementation evidence/reference.

## 1. Frozen authority consumed

- Issue #235 latest body.
- Frozen v0.3 PRD + PRD Amendment A1 + freeze record.
- Frozen v0.3 L2 Architecture Evidence, especially §11 (Promoted Reusable Subworkflow Architecture), §14 (Dynamic Child Pin, Registry Retention and Exact Recovery), §15 (Mutation and Durable Effect Authority), §17.3 (Promoted subworkflow decision flow) and the S3 invariant (dynamic child selection becomes a durable execution-definition pin).
- Frozen L2 Amendment A1 + freeze record.
- v0.3 Task DAG (`T-017 | depends_on: T-012,T-014,T-016`; T-017–T-019 are the serialized central integration spine).
- `.dev-standard/VERSION` and `.dev-standard/PROJECT_OVERRIDES.md`.
- T-012 final merged Promoted Artifact Registry authority (`src/promoted-artifact/`).
- T-014 final merged activation binding / `GovernanceExecutionPin` authority (`src/governance/execution-binding.ts`).
- T-016 final merged Harness execution journal authority (`src/harness/execution-journal.ts`), including the existing `promotedChildContentDigest` operation-identity hook.

## 2. Tests

Focused deterministic tests under `packages/domain-harness/tests/promoted-child/`:

- `compiler.test.ts` — IR → executable definition compilation matrix.
- `pin.test.ts` — `DynamicChildExecutionPin` durability/insert-once/retention matrix.
- `runtime.test.ts` — fresh execution, journaled work, replay, recovery and fail-closed matrix.

The matrix proves:

1. compile is deterministic for one exact body and the definition binds the exact artifact digest;
2. the compiled definition runs through the existing selected-engine adapter (`adaptDomainWorkflowToXState`) — no peer workflow runtime;
3. all control-flow cycles fail closed (including self loops), per frozen L2 §11.2;
4. reasoned steps fail closed under the §11.6 allowance (T-017 ships deterministic/query steps only);
5. query tools outside the envelope allowlist, mutation binding while `mutation.kind === 'none'`, effects outside `mutation.effects`, and undeclared Domain Events all fail closed at compile;
6. unreachable nodes, duplicate control edges, non-terminal nodes that would dead-end before the terminal output, `maxSteps` below the declared node count, and backward `step-output` references fail closed;
7. the pin commits durably BEFORE any journaled work and registers `recoverable-execution` retention in the T-012 registry;
8. identical pin replay is idempotent — the idempotency comparison covers the full durable pin record including `pinnedAt`, so a replay must re-present the decision invocation's original pin metadata; any divergence (including a different `pinnedAt`) is treated as `DYNAMIC_CHILD_DEFINITION_CONFLICT` and never overwrites;
9. `GovernanceExecutionPin` package/governance mismatch fails closed;
10. `requirePin` on a never-pinned slot fails closed; retention release uses the exact retained reference;
11. fresh selection pins before work, executes query steps journaled with the exact `promotedChildContentDigest`, and returns terminal output + finite declared events with their evaluated payloads;
12. a replayed control turn replays committed work without re-executing the query tool;
13. committed work from digest D1 cannot be consumed by a D2 child on the same deterministic slot — conflicting semantic identity fails closed (frozen L2 §14.5);
14. `requireDynamicChildOperationGate` enforces: no journaled work for a child whose pin was never made durable;
15. a revoked artifact is blocked for fresh selection (`PROMOTED_ARTIFACT_REVOKED`) but stays exactly recoverable through the pin;
16. recovery recompiles deterministically and never re-resolves an alias/version — the recovery input structurally contains no selector;
17. missing exact body during recovery fails closed (`DYNAMIC_CHILD_BODY_MISSING`);
18. recovery against a moved package/governance authority fails closed (`DYNAMIC_CHILD_PACKAGE_MISMATCH` / `DYNAMIC_CHILD_GOVERNANCE_MISMATCH`);
19. incompatible references and applicability mismatch are typed fallthrough-eligible outcomes on FRESH selection only (`DYNAMIC_CHILD_INCOMPATIBLE` / `DYNAMIC_CHILD_NOT_APPLICABLE`); recovery of an already-started child treats the same conditions as fail-closed errors;
20. alias drift (`expectedRevision` stale) and floating selectors (`latest`, …) fail closed;
21. a failing query step fails the child closed (`DYNAMIC_CHILD_JOURNAL_FAILURE`);
22. effect intents are emitted as data only; mutation admission/execution remains the parent durable effect authority (frozen L2 §15);
23. compatibility is evaluated against the invoking instance's pinned package/governance context, never the globally active package (frozen L2 §11.4).

## 3. Contract / Interface

Module:

`packages/domain-harness/src/promoted-child/`

### 3.1 Promoted subworkflow IR

The promoted artifact `semanticMaterial` is the T-004 validated `CandidateEnvelope` (`candidateKind: 'workflow'`), whose `body` is a declarative `PromotedChildWorkflowBody` (`promoted-child-workflow/v1`): per-node steps of kinds `query`, `emit-event`, `effect-intent`, `terminal-output` (and the structurally-recognized but fail-closed `reasoned`). Value bindings are declarative (`literal` / `input` path / `step-output` path). There is no arbitrary code, no eval, no callback, no provider state.

### 3.2 Resolve-once selection

`resolvePromotedChildOnce(selector, expectedAuthority, port)` resolves exact-digest / exact-version / explicit-alias selectors exactly once per decision invocation through the narrow `PromotedChildArtifactPort` seam over T-012. Floating tokens (`latest`, `current`, `active`, `head`, `default`, `*`) are rejected at the boundary. The single `ResolvedPromotedChild` object is reused by compatibility, pinning, compilation and telemetry; the runtime never resolves a selector twice.

### 3.3 Compatibility / applicability

Frozen L2 §11.4: the promotion authority tuple (package + CDI digest + Governance Baseline) and every referenced rule/knowledge/skill/tool identity are evaluated against the invoking instance's pinned context. Package mismatch, CDI mismatch and Governance mismatch are distinct fail-closed codes. Applicability references must be exact-matched by the decision invocation's facts.

### 3.4 DynamicChildExecutionPin

Normative durable identity (frozen L2 §14.2):

```text
logical invocation slot = (target, parentActorId, childActorId, invocationOrdinal)
exact durable pin       = slot + invoking packageId + invoking authority context
                        + kind + artifactId + contentDigest
```

- The slot is insert-once (`DynamicChildPinStore.insertOnce`); conflict never overwrites and never silently reallocates.
- `DynamicChildPinCoordinator.commitPin` validates the invoking context against the instance's durable `GovernanceExecutionPin` when supplied (T-014 integration), then registers a deterministic `dynamic-child-pin:<digest>` retention reference (`recoverable-execution`) in the T-012 registry, so the exact body is retained while any recoverable pin references it (§14.3). Retention flows through the registry's own validated `retain`/`release` surface — never the raw store — so release uses the exact retained reference and a stale release fails closed inside T-012.
- The pin is a first-class durable record; host persistence (SQLite) is T-022/T-023 scope behind the same store contract.

### 3.5 Pin-before-journaled-work gate

`PromotedChildExecutionSession` instances are only produced by `beginFreshExecution` (after pin commit) or `recoverExecution` (after pin reload). The T-016 operation identity context — which carries the exact `promotedChildContentDigest` — is obtainable only from a session. `requireDynamicChildOperationGate` is the standalone gate for executors that do not hold a session: no pin, no journaled work.

### 3.6 Compiler

`compilePromotedChild(body)` is pure and deterministic: same exact body → same `DomainWorkflowDefinition` + topological step plan. The definition is the public engine-neutral contract (T-006) and adapts to the selected engine through the existing `adaptDomainWorkflowToXState`; T-017 introduces no peer workflow runtime and no generated arbitrary code. All cycles are rejected (§11.2). Duplicate control edges and non-terminal sink nodes (which would dead-end the engine before the terminal output) are rejected at compile, not inside the adapter. Reasoned steps fail closed (§11.6 allowance).

### 3.7 Execution and terminal result

`session.run(...)` executes the step plan under the declared `maxSteps` bound. Query steps run at most once per deterministic slot through the T-016 journal (`executeJournaledHarnessOperation`) with operation identities that include the exact child digest. `effect-intent` steps collect data only; mutation admission/execution remains the parent durable effect authority (§15). The terminal result (output, finite declared events as `{ eventType, payload? }` records with evaluated payloads, effect intents) is data returned for parent central admission (T-019 owns schema/guard/transition).

### 3.8 Exact pinned recovery

`recoverExecution({ slot, invoking, governancePin? })` deliberately has NO selector input: load pin → verify invoking authority equality (never switch to the active package) → load exact body by content digest through the revocation-tolerant recovery seam → recompile deterministically → re-check compatibility AND applicability against the invoking context (fail-closed on recovery, never fallthrough) → fail closed on missing body (`DYNAMIC_CHILD_BODY_MISSING`), corrupt digest (`DYNAMIC_CHILD_DIGEST_MISMATCH`) or authority drift. Revocation policy does not redefine exact recovery (§14.4).

### 3.9 T-012 narrow seam additions

Two additive seams on `PromotedArtifactRegistry`, both delegating to the existing private `load(...)`:

- `recoverExact(identity, expectedAuthority)` — `load(..., { allowRevoked: true })` for the revocation-tolerant recovery path;
- `resolveExactDetailed(identity, expectedAuthority)` — `load(..., { allowRevoked: false })` returning the loaded artifact, so the fresh exact path stays revocation-blocked and loads exactly once.

Fresh selection methods remain revocation-blocked. No other T-012 behavior is changed or re-implemented.

## 4. Implementation

Fresh path:

```text
configured selector
→ resolve once (T-012, revocation-blocked)
→ parse/compile (pure)
→ compatibility + applicability against invoking pinned context
→ validate invoking context vs GovernanceExecutionPin (when supplied)
→ commit DynamicChildExecutionPin (insert-once) + registry retention
→ session → journaled query steps (T-016 identity incl. child digest)
→ terminal result data → parent central admission (T-019)
```

Recovery path:

```text
load exact pin (fail closed if missing)
→ assert invoking authority == pinned authority
→ load exact promoted body by content digest (revocation-tolerant)
→ verify digest (registry) → recompile (deterministic)
→ compatibility + applicability re-check (fail closed, never fallthrough)
→ session → replay/continue journaled work
```

## 5. Failure Handling

The module raises typed conditions; the frozen fresh/recovery taxonomy (L2 §18, S6) decides which of them continue resolution and which fail closed. T-018 consumes this mapping.

Fallthrough-eligible on FRESH selection only (`FALLTHROUGH_ELIGIBLE_CODES`): incompatible artifact (`DYNAMIC_CHILD_INCOMPATIBLE`); applicability mismatch (`DYNAMIC_CHILD_NOT_APPLICABLE`). Registry `PROMOTED_ARTIFACT_NOT_FOUND` on fresh selection is likewise a continue outcome, and `PROMOTED_ARTIFACT_REVOKED` on fresh selection is resolved by the revocation record's `revocationPolicy` (`fallthrough` → continue with telemetry; `deny` → fail closed).

Fail closed in every context: applicability mismatch or incompatibility observed during RECOVERY of an already-started child; alias drift (stale revision); floating selector; package mismatch; governance mismatch; corrupt digest; missing retained body; conflicting `DynamicChildExecutionPin`; missing pin before journaled work; cycles; duplicate control edges; non-terminal dead-end control; unbounded/over-bound control; non-allowlisted tool/event/effect; reasoned step; query failure; journal semantic-identity conflict.

No failure path falls back to another artifact version, another package/CDI tuple, another Governance Baseline, an alias re-resolution, or silent journal re-execution.

## 6. Reference

Frozen L2 §17.3 decision flow is preserved for T-018/T-019 wiring: T-017 delivers the `resolve once → validate → pin → compile/reuse → journaled child work → structured terminal result` capability consumed by the DecisionResolver and central admission; it does not implement the resolver chain, cache integration, central admission, or durable effect execution.

## 7. Scope boundary

Not implemented in T-017:

- T-018 DecisionResolver chain (Rule → Exact Cache → Promoted Subworkflow → HarnessMachine) and revocation-fallthrough policy;
- T-019 central Workflow admission, schema/guard/transition wiring, durable effect execution;
- T-020 Runtime Evidence capture;
- T-021 runtime assembly;
- provider/model routing; planner LLM of any kind (the reusable child is deterministic);
- real Node/Expo crash/reopen durability (T-022/T-023);
- reasoned-step HarnessMachine invocation (fail-closed allowance per frozen L2 §11.6);
- loop semantics (all cycles rejected per frozen L2 §11.2).

## 8. Exact-head closeout

A validation/review result is valid only for the exact PR HEAD it names. Any code or L3 change invalidates earlier evidence.

Required before merge to `v0.3`:

- repository build, lint, typecheck, tests;
- focused T-017 matrix;
- exact-head Woodpecker terminal success;
- Fresh Independent Review bound to the final exact HEAD;
- P0/P1 = 0.

This task never merges `main`.
