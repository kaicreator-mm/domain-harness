# T-007 Task Pack — Business Harness / HarnessMachine Production Contract

**Version:** v0.3  
**Wave:** A / portable contracts and capabilities  
**Execution Issue:** #225  
**Original Branch:** `v0.3_t007`  
**Repair Branch:** `v0.3_t007_repair`  
**PR Base:** `v0.3`  
**Original Exact Base:** `be65e41e652d70c17ca10af66bc5f25abed2658a`  
**Repair Exact Base:** `74514b07048ee62ce04d742a9685ae4804619d89`  
**Depends On:** T-001  
**Parallel:** YES  
**Risk:** H  
**L3:** REQUIRED  
**Status:** DOING — independent-review repair / exact-SHA validation pending

## 1. Frozen Inputs

- `docs/product/DomainHarness_v0.3_PRD_FROZEN.md`
- `docs/product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A1_ROUND2_REVIEW_CANDIDATE.md`
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_EVIDENCE_FROZEN.md`
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1.md`
- `docs/implementation/DomainHarness_v0.3_TASK_DAG.md`
- `.dev-standard/PROJECT_OVERRIDES.md`
- pinned ai-development-standard revision in `.dev-standard/VERSION`
- GitHub Issue #225
- consumed architecture evidence #187 at exact HEAD `3cb9aa6f0579087a793ee8c30bedf8cdd8a36387`

Do not reinterpret frozen product/architecture decisions in this task.

## 2. Objective

Productionize the frozen Business Harness role as the existing bounded `HarnessMachine` child capability. The child may reason over selected Domain Facts / Compiled Domain Intelligence / current Workflow context and allowed read/query observations, then return structured proposal data.

It SHALL NOT become a peer runtime or acquire parent Workflow, mutation, provider-routing, governance, promotion or activation authority.

## 3. Allowed / Expected Write Set

- `packages/domain-harness/src/harness/contract.ts`
- `packages/domain-harness/src/harness/harness-machine.ts`
- `packages/domain-harness/src/harness/index.ts`
- `packages/domain-harness/tests/harness/business-harness-machine.test.ts`
- this task pack / task evidence

This task does not modify central Runtime assembly, package activation, Governance registry, Candidate promotion/activation, persistent journals, semantic cache, durable effect execution, provider routing or public v0.3 assembly barrels.

The independent-review repair is intentionally narrower: it changes the harness contract type surface, focused tests, and this task evidence only.

## 4. Deliverables

1. provider-neutral `ModelPort` request/response seam with no provider/model-selection fields;
2. selected Domain Facts / Compiled Domain Intelligence / Workflow-context request surface;
3. read/query-only model-visible capability schemas and host executors;
4. exact structured `DomainDecision + DomainEvent` final-result contract;
5. structured `DecisionTrace` without private/free-form chain-of-thought authority;
6. invocation-local `ObservedDependencySet` output for later T-016 durable integration;
7. hard `maxSteps` bound and cooperative cancellation;
8. explicit fail-closed taxonomy for malformed output and illegal capability/authority attempts;
9. one XState child machine with only model/query leaf actors, not an independent Harness Runtime.

## 5. L3 — Tests

Focused failure-path test file:

```text
packages/domain-harness/tests/harness/business-harness-machine.test.ts
```

Required scenarios:

- query observation → bounded second model turn → exact structured decision/event success;
- selected Facts/CDI dependencies plus successful query dependency returned as `ObservedDependencySet`;
- selected invocation dependencies cannot pre-claim `kind: query` provenance at the public TypeScript contract;
- mutation capability hidden from model-visible schemas;
- direct mutation request rejected before executor invocation;
- unknown capability rejected before executor invocation;
- hard `maxSteps` prevents an additional model turn;
- explicit cancellation aborts an active model leaf;
- explicit cancellation aborts an active query leaf;
- ordinary query exception becomes a structured observation and may recover on a later bounded turn;
- malformed query output fails closed;
- unallowed decision/event fails closed;
- invalid configuration fails before any model call;
- extra `nextState`, `transition`, `mutation`, `promotion`, `activation` or governance-authority fields in model final output fail closed;
- free-form/private-reasoning fields are not an executable model response surface;
- direct actor roles are only `modelTask` and `queryTask`.

Expected repository validation when executable CI/Build Host is available:

```text
npm run typecheck -w @kaicreator/domain-harness
node --import tsx --test packages/domain-harness/tests/harness/business-harness-machine.test.ts
npm test -w @kaicreator/domain-harness
```

No command is recorded as PASS without exact-SHA execution evidence. Real provider routing and host durability are explicitly outside T-007 validation.

## 6. L3 — Contract / Interface

### Business Harness input

One invocation receives only selected execution inputs:

```text
Domain Facts
+ Compiled Domain Intelligence
+ current Workflow context
+ exact selected Fact/CDI dependency identities
+ allowed decision outcomes / Domain Event types
+ capability registry
+ provider-neutral ModelPort
+ maxSteps
```

`selectedDependencies` is restricted to preselected `domain-fact` / `compiled-intelligence` provenance. `kind: query` provenance is an output-only observation for this input surface and may appear in `ObservedDependencySet` only after a successful allowed query binding reports it.

The model request exposes read/query schemas only. Mutation bindings may be present in the host registry solely so a malicious/invalid model request can be rejected explicitly; their schemas are never exposed to the model and their executors are never invoked by `HarnessMachine`.

### Structured output

A valid model final response has one exact shape:

```text
{
  decision: { outcome, data },
  event: { type, payload }
}
```

No state id, transition, effect/mutation command, governance update, promotion or activation instruction is part of the output contract.

The parent Domain Workflow remains responsible for:

```text
structured result
→ schema validation
→ pinned Hard Invariant evaluation
→ current guard evaluation
→ transition
→ durable effect intent
```

### DecisionTrace

`DecisionTrace` contains ordered, externally checkable contract facts such as model step number, query capability id, observation success/failure and final outcome/event type. It does not model, require, persist or execute free-form private chain-of-thought.

### ObservedDependencySet

T-007 returns selected Fact/CDI dependency identities plus semantic query dependencies produced by successful query bindings. It is invocation-local output only. T-016 owns execution-journal integration, stable operation identity and durable observed-dependency recording.

## 7. L3 — Core Implementation

`HarnessMachine` is one XState child state machine with explicit bounded reasoning progression:

```text
prepare
→ model
→ handleModel
→ prepareQuery / authorizeQuery
→ query
→ prepare / model
→ validateFinal
→ succeeded | failed | cancelled
```

Only two direct leaf actor roles exist:

```text
modelTask
queryTask
```

The child has no sibling Harness-to-Harness orchestration path and no runtime facade. Provider/model routing remains behind the injected `ModelPort`.

Every model/query request receives an `AbortSignal`. Root-level `CANCEL` transitions the child to a terminal cancellation result and XState invocation lifecycle aborts active model/query leaf work.

## 8. L3 — Failure Handling

Fail closed:

```text
invalid configuration
invalid model envelope
invalid/unallowed structured final result
unknown capability
mutation capability request
invalid query output/dependency
maxSteps exhaustion
model failure
explicit cancellation
```

Ordinary read/query executor exceptions are the one intentional recoverable inner-loop case: they become structured `{ ok:false, error }` observations and consume no mutation authority. The next model turn is still constrained by `maxSteps`.

No T-007 result means that a parent transition, durable effect, promotion or activation happened. No T-007 trace/dependency record is durable replay authority.

## 9. L3 — Reference

Frozen authority requires:

- Business Harness is the product role implemented by the existing bounded `HarnessMachine` child capability;
- Domain Workflow / Domain Machine remains the single product-level business control-flow authority;
- XState remains the selected v0.3 engine, not public product identity;
- LLM output is structured proposal data and never a Workflow state id or transition authority;
- query/read observation is allowed under an explicit envelope;
- business mutation remains behind durable effect authority;
- provider/model selection stays behind AI Runtime / ModelPort;
- Candidate promotion/activation and Governance Baseline change remain explicit human/operator authorities;
- no independent Harness Runtime is introduced.

Research #187 is used only as implementation evidence for the already-frozen bounded XState child pattern. Production authority comes from the Frozen PRD/A1 and Frozen L2/A1.

## 10. Scope Guard

This task SHALL NOT implement:

- durable AI/query execution journal or stable operation identity (T-016);
- exact semantic cache or resolver integration (T-013/T-018);
- Candidate deterministic validation (T-004);
- promotion/activation authority (T-015);
- Governance Baseline lifecycle/pinning (T-003/T-014);
- durable effect handoff / central Workflow admission (T-019);
- provider/model routing, retry or fallback policy;
- host durability claims;
- autonomous Meta Harness or self-modifying production intelligence;
- a second/peer Harness Runtime.

## 11. Independent Review Repair Record

Independent review of original exact HEAD `7520ca029a065471313044ce923c42b003fb2850` issued `VALIDATION_REQUEST` with `P0=0 / P1=0 / P2=2 / P3=0`.

Repair actions on `v0.3_t007_repair`:

1. split preselected Fact/CDI provenance from query provenance in the public contract so `BusinessHarnessInput.selectedDependencies` cannot claim `kind: query`;
2. add a compile-time negative contract test using `@ts-expect-error` so typecheck fails if query provenance becomes pre-claimable again;
3. fix the private-reasoning negative test's repeated `finalResponse()` union narrowing, which could fail TypeScript typecheck before runtime validation executed;
4. reconcile this Task Pack with the reopened Issue #225 and repair branch.

The repair starts from current integration baseline `v0.3@74514b07048ee62ce04d742a9685ae4804619d89`, because the original PR had already merged before independent review. The original implementation HEAD remains historical evidence only; all repair validation/review must bind to the new repair PR exact HEAD.

### Refresh to current v0.3

Before closeout, `v0.3` advanced to `09b9ce20c817cd3ad1721b7af6d39d3bd9b7eb73` (T-004 unified candidate validation, T-002/T-003 task packs, and CI gate repairs merged). The repair branch was refreshed by merging `v0.3@09b9ce2` into `v0.3_t007_repair`; the resulting tree differs from `v0.3` only by the three T-007 repair files (task pack, `src/harness/contract.ts`, focused harness test).

The refresh produced one content conflict in `tests/harness/business-harness-machine.test.ts`: `v0.3@c28cba6` had independently fixed the same `finalResponse()` union-narrowing issue with an inline ternary. The merge keeps the T-007 repair resolution (explicit `kind` assertion plus early return), which subsumes the CI-fix variant for the identical underlying typecheck concern.

Build Host old-HEAD evidence at `cda631c19a97bdbbc76cf17e581f6424d61306be`: repository `npm test` 425/425 PASS, focused BusinessHarness tests 21/21 PASS, build/typecheck/pack PASS, lint failures confirmed as stale-base inheritance with no lint error in T-007 touched files. This evidence is historical; all closeout gates re-run and re-bind to the refreshed repair PR exact HEAD.

Closure rule:

```text
repair exact HEAD
→ required typecheck/focused/package tests PASS
→ configured CI PASS, or post-failure exact-gate waiver with evidence
→ independent exact-HEAD re-review
→ Status: DONE
```

Until those gates are satisfied, this Task Pack remains `DOING` and Issue #225 remains open.
