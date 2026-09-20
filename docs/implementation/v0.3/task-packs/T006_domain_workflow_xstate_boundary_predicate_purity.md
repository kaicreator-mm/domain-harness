# DomainHarness v0.3 — T-006 L3 Implementation Evidence

Issue: #224  
Task: T-006 — Domain Workflow public contract / XState boundary + predicate purity  
Original fixed baseline: `v0.3@be65e41e652d70c17ca10af66bc5f25abed2658a`  
Independent-review remediation baseline: `v0.3@74514b07048ee62ce04d742a9685ae4804619d89`  
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
- predicate/context/event values are prepared and frozen before authoritative predicate evaluation;
- authoritative evaluation accepts only prepared identities registered by private `WeakSet`s;
- unprepared accessor/capability-shaped values fail closed without invoking the accessor/function;
- Proxy-backed Guard/input references are rejected through trap-free `WeakSet.has()` checks and execute zero Proxy traps;
- malformed prepared primitive evaluation reports a contract violation while Guard/Hard-Invariant wrappers return false.

### XState boundary

`packages/domain-harness/tests/workflow-v03/xstate-boundary.test.ts`

Proves:

- engine-neutral states/transitions map to the internal XState-compatible configuration seam;
- Guard evaluation remains on the prepared pure-predicate path;
- ordinary Domain Events and internal lifecycle events have distinct unforgeable runtime provenance;
- raw events cannot spoof `invocation_done`, `invocation_failed`, `wait`, `timer`, `deadline`, `callback`, or `recovery` transitions even when the event-type string is identical;
- the `@@domain-harness/` namespace is reserved from ordinary Domain Events;
- unsafe record keys (`__proto__`, `prototype`, `constructor`) are rejected before insertion into internal state/event records;
- accessor-backed untrusted engine events fail closed before hidden work can execute;
- invalid state/guard references fail before machine execution;
- Effect Intent remains data/metadata at this layer and is not translated into an executable action.

Required remediation validation commands on the corrected exact HEAD:

```bash
npm ci
npm run build
npm run lint
npm run typecheck
npm test
node --import tsx --test "packages/domain-harness/tests/workflow-v03/*.test.ts"
npm pack -w @kaicreator/domain-harness
```

Repository CI is required unless a newly authorized unavailable-service waiver is recorded; an unavailable or failed CI result is never represented as PASS.

## Contract / Interface

### Public Domain Workflow identity

Package subpath: `@kaicreator/domain-harness/workflow`.

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

The authoritative predicate boundary is now explicitly two-phase:

```text
configuration / pre-admission preparation
→ copy JSON-only data
→ recursively freeze
→ register trusted object identity

admission predicate evaluation
→ trap-free trusted-identity check
→ synchronous closed-AST evaluation only
```

The preparation phase is deliberately outside the authoritative Guard/Hard-Invariant decision. Evaluation never attempts to prove safety by reflecting over an arbitrary live object.

### Internal event provenance contract

String event type alone is not sufficient authority for internal lifecycle transitions.

The internal adapter distinguishes:

```text
ordinary Domain Event provenance
!=
internal lifecycle/control provenance
```

Both event classes are prepared data, but they are registered in separate private `WeakSet`s. Every mapped transition receives an admission guard that first requires provenance matching the trigger kind. A caller that sends a raw object with an internal event-type string therefore cannot activate an internal lifecycle transition.

`@@domain-harness/` is reserved for internal event identities and is rejected from ordinary Domain Event definitions/factories.

## Core Implementation

### Prepared pure evaluator

`packages/domain-harness/src/workflow/predicate.ts` implements synchronous authoritative evaluation over prepared data only.

Preparation rejects:

- functions, promises, symbols, bigint, undefined, or other non-JSON capability values;
- accessor properties without invoking their getter/setter;
- non-plain object prototypes;
- non-finite numbers;
- cycles.

Prepared values are detached copies, recursively frozen, and registered in private `WeakSet`s. At authoritative evaluation time, `WeakSet.has()` is performed before any property read on a candidate Guard/input reference. A Proxy or other unprepared object therefore fails closed without executing Proxy traps.

The evaluator itself remains a bounded closed-AST interpreter with no LLM, Tool, network, filesystem, database, timer, or other external-I/O capability.

### Internal XState mapping

`packages/domain-harness/src/workflow/internal/xstate-adapter.ts` maps the Domain Workflow definition to an XState-compatible machine configuration.

The adapter is intentionally internal and performs only control-flow translation:

- state identity → internal machine state;
- domain/internal completion trigger → event key plus provenance class;
- target state → transition target;
- `guardId` → prepared synchronous pure-predicate guard closure;
- declared workflow semantics, including Effect Intents, remain metadata for later central wiring.

All internal control events are created through an internal factory and registered with internal provenance. Ordinary Domain Events are created through a separate factory that rejects the internal namespace. Control keys are encoded before being embedded in internal event identities.

All state, guard, transition and ordinary Domain Event keys are validated before insertion into internal records; unsafe object keys are rejected before machine execution.

The adapter does **not**:

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
| unprepared Guard / Hard Invariant / evaluation input | authoritative wrapper returns `false` before property access |
| Proxy-backed Guard/input wrapper | private `WeakSet.has()` rejects it; no Proxy trap executes |
| malformed/unknown prepared predicate operator | primitive evaluator raises `PredicateContractViolation`; Guard/Hard-Invariant wrapper returns `false` |
| capability/function/promise/non-JSON preparation data | preparation rejects; no function is called |
| accessor-backed preparation data | preparation rejects from descriptors without invoking accessor |
| predicate nesting beyond deterministic limit | rejected; wrapper returns `false` |
| ordinary Domain Event uses `@@domain-harness/` internal namespace | `XStateBoundaryContractError` / fail closed before machine execution |
| raw event string impersonates internal invocation/wait/timer/deadline/callback/recovery type | provenance check returns `false`; transition cannot fire |
| unsafe record key (`__proto__`, `prototype`, `constructor`) | `XStateBoundaryContractError` before machine execution |
| missing initial/target state | `XStateBoundaryContractError` before machine execution |
| missing guard reference | `XStateBoundaryContractError` before machine execution |
| duplicate state/guard/transition key | `XStateBoundaryContractError` before machine execution |
| accessor-backed untrusted engine event | provenance check returns `false` before accessor/property inspection |

No failure path falls back to AI, Tool, or external observation.

## Independent Review Remediation

The first independent review of exact HEAD `b428604b18952243e8a15fbbc71c0b7add0990a3` returned `CHANGES_REQUIRED` with `P0=0 / P1=2`:

1. internal lifecycle event strings could be spoofed by ordinary Domain Events;
2. runtime-supplied Proxy objects could execute traps while the old evaluator attempted to inspect/copy arbitrary live predicate inputs.

This remediation closes both findings at their authority boundaries rather than adding test-only filtering:

- event type is no longer provenance authority;
- authoritative predicate evaluation no longer reflects over arbitrary live objects.

Because remediation changes the exact HEAD, all validation/review evidence from `b428604b...` is historical only and cannot qualify the corrected candidate.

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
