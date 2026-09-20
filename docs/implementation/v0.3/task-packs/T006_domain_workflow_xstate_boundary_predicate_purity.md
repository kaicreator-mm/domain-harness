# DomainHarness v0.3 — T-006 L3 Implementation Evidence

Issue: #224  
Task: T-006 — Domain Workflow public contract / XState boundary + predicate purity  
Fixed baseline: `v0.3@be65e41e652d70c17ca10af66bc5f25abed2658a`  
Authority: Frozen v0.3 PRD + A1 amendment, Frozen L2 + A1 architecture amendment, v0.3 Task DAG

## Tests

Focused evidence is intentionally limited to T-006 seams; host parity and durable-effect truth remain T-022/T-023/T-024 and T-019 responsibilities.

### Public contract / identity

`packages/domain-harness/tests/workflow-v03/domain-workflow-contract.test.ts`

Proves:

- the public contract can express State, Event, Guard, Transition, Invocation, Wait, Timer/Deadline, Callback, Failure, Recovery, and Effect Intent;
- `./workflow` is an explicit public package subpath;
- selected-engine identities (`XState`, actor refs, state-node IDs, serialized snapshots) are absent from the public Workflow source;
- the internal XState adapter is not a public package export.

### Predicate purity

`packages/domain-harness/tests/workflow-v03/predicate-purity.test.ts`

Proves:

- Guard and Hard Invariant predicates use one synchronous deterministic evaluator;
- predicates are a closed declarative data AST, not user callbacks;
- the predicate implementation has no AI/Tool/Promise/external-I/O execution seam;
- accessor-backed input is rejected without invoking the accessor;
- capability-shaped/function-bearing predicate data fails closed without calling the function;
- malformed primitive evaluation reports a contract violation while Guard/Hard-Invariant wrappers return false.

### XState boundary

`packages/domain-harness/tests/workflow-v03/xstate-boundary.test.ts`

Proves:

- engine-neutral states/transitions map to the internal XState-compatible configuration seam;
- Guard evaluation remains on the pure predicate path;
- accessor-backed engine events fail closed before hidden work can execute;
- invalid state/guard references fail before machine execution;
- Effect Intent remains data/metadata at this layer and is not translated into an executable action.

Expected repository commands:

```bash
npm run typecheck --workspace @kaicreator/domain-harness
node --import tsx --test "packages/domain-harness/tests/workflow-v03/*.test.ts"
npm run build --workspace @kaicreator/domain-harness
```

Full repository CI remains authoritative when available.

## Contract / Interface

### Public Domain Workflow identity

New package subpath: `@kaicreator/domain-harness/workflow`.

The product-level definition is `DomainWorkflowDefinition` and contains only engine-neutral domain semantics:

- `DomainWorkflowState`
- `DomainWorkflowEvent`
- `DomainWorkflowGuard`
- `DomainWorkflowTransition`
- `DomainWorkflowInvocation`
- `DomainWorkflowWait`
- `DomainWorkflowTimer`
- `DomainWorkflowDeadline`
- `DomainWorkflowCallback`
- `DomainWorkflowFailure`
- `DomainWorkflowRecovery`
- `DomainWorkflowEffectIntent`

No public type contains XState actor IDs, state-node IDs, actor references, or serialized snapshot bytes. XState remains a selected internal v0.3 engine, not the product identity.

### Pure predicate contract

`DomainPredicate` is a closed AST supporting:

- constants;
- existence checks;
- exact/deep equality and inequality;
- ordered number/string comparison;
- `not`, `all`, and `any` composition;
- operands sourced only from declared workflow context, structured event data, or JSON literals.

There is deliberately no callback/function/Promise/effect field. Both `DomainWorkflowGuard` and `DomainHardInvariantPredicate` contain the same `DomainPredicate` data contract.

`DomainHardInvariantPredicate` defines only the predicate shape. Retrieval and exact binding of pinned Governance Baseline invariants remain T-014/T-019 scope.

## Core Implementation

### Pure evaluator

`packages/domain-harness/src/workflow/predicate.ts` implements synchronous evaluation only.

Before evaluation it defensively copies predicate/context/event as data-only values using property descriptors. It rejects:

- functions, promises, symbols, bigint, undefined, or other non-JSON capability values;
- accessor properties without invoking their getter/setter;
- non-plain object prototypes;
- non-finite numbers;
- cycles;
- excessive predicate nesting.

Evaluation therefore has no capability through which an LLM, Tool, network request, filesystem request, database call, timer, or other external I/O can be invoked.

Guard and Hard Invariant wrappers catch malformed/contract-violating inputs and return `false` (fail closed).

### Internal XState mapping

`packages/domain-harness/src/workflow/internal/xstate-adapter.ts` maps the Domain Workflow definition to an XState-compatible machine configuration.

The adapter is intentionally internal and performs only control-flow translation:

- state identity → internal machine state;
- domain/synthetic completion trigger → internal event key;
- target state → transition target;
- `guardId` → synchronous pure-predicate guard closure;
- declared workflow semantics, including Effect Intents, remain metadata for later central wiring.

It does **not**:

- execute an Invocation;
- execute an Effect Intent;
- call an LLM or Tool;
- perform external I/O;
- create a second business-control runtime;
- own Governance Baseline pin resolution;
- claim crash/restart or host durability.

The selected engine can therefore change behind this seam without changing the public product identity.

## Failure Handling

Fail-closed behavior for this task:

| Failure | Result |
|---|---|
| malformed/unknown predicate operator | primitive evaluator raises `PredicateContractViolation`; Guard/Hard-Invariant wrapper returns `false` |
| capability/function/promise/non-JSON predicate data | rejected; wrapper returns `false` |
| accessor-backed context/event/predicate input | rejected from descriptors without invoking accessor; wrapper returns `false` |
| predicate nesting beyond deterministic limit | rejected; wrapper returns `false` |
| missing initial/target state | `XStateBoundaryContractError` before machine execution |
| missing guard reference | `XStateBoundaryContractError` before machine execution |
| duplicate state/guard/transition key | `XStateBoundaryContractError` before machine execution |
| accessor-backed internal engine event | mapped guard catches the boundary violation and returns `false` |

No failure path falls back to AI, Tool, or external observation.

## Reference / Ownership Boundary

Consumed authority:

- `docs/product/DomainHarness_v0.3_PRD_FROZEN.md`
- `docs/product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A1_ROUND2_REVIEW_CANDIDATE.md`
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_EVIDENCE_FROZEN.md`
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1.md`
- `docs/implementation/DomainHarness_v0.3_TASK_DAG.md`

Ownership kept outside T-006:

- T-014 — Governance Baseline exact runtime pin storage/binding;
- T-018 — Decision Resolver and reasoning/cache/subworkflow selection;
- T-019 — centralized transition admission and durable effect wiring;
- T-022/T-023/T-024 — real host persistence/restart/offline validation.

Reasoning or external observation required by a decision must happen in an explicit Rule/Cache/Procedure/Harness/Invocation step **before** admission reaches a Guard or Hard Invariant predicate. The predicate path itself remains synchronous, deterministic, side-effect free, and capability-free.
