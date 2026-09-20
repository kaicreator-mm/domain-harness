# v0.3 Research — Structured Decision Trace to Validated Reusable XState Subworkflow

Issue: #196  
Research branch: `research_subworkflow_compilation`  
Fixed baseline: `8e09c688da2900f35d978fb513b2fe09de6dde07`  
Source #187 validated HEAD: `3cb9aa6f0579087a793ee8c30bedf8cdd8a36387`

> This is reference architecture evidence only. It is not production compiler code, not an auto-learning workflow system, and does not freeze or amend v0.3 PRD/L2.

## Question

Can the XState `HarnessMachine` pattern proven in #187 return an externally auditable structured result plus a constrained workflow proposal, then let DomainHarness validate, explicitly promote, compile, and reuse that solving pattern without persisting or executing free-form chain-of-thought?

The spike answers **yes for a deliberately small IR**. It does not claim that arbitrary planner output is compilable.

## Minimal reuse from #187

This experiment does not merge `research_harness_machine`. It reuses only these research invariants from #187:

- one XState actor runtime;
- `HarnessMachine` returns structured domain data, never an XState state id;
- provider/model access remains behind a replaceable port;
- model output has no business-control authority until validated by deterministic code;
- query work may occur inside a bounded child workflow, while mutation authority remains outside the research compiler.

No #187 implementation file is copied wholesale. The spike defines a smaller fixture specialized for candidate synthesis/validation.

## Structured result and DecisionTrace

`HarnessMachine` returns:

```text
HarnessResult
  status = ok
  decision: DomainDecision
  decisionTrace: DecisionTrace
  candidate?: WorkflowCandidate
```

`DecisionTrace` contains only externally checkable facts:

- step id/type;
- input references;
- content-addressed evidence references;
- structured outcome;
- accepted/rejected status;
- final Domain Event.

The contract has no `chainOfThought`, hidden reasoning, provider instruction, executable code, secret, or actor-reference field. The parser rejects those fields if a planner attempts to include them. Replay correctness therefore depends on declared inputs/artifacts/rules/tools, not private model reasoning text.

## Constrained WorkflowCandidate

The research IR supports only:

- `query`: read/query tool invocation;
- `rule`: deterministic `eq` / numeric `gte` decision over a produced fact;
- `reasoned`: an explicit `HarnessMachine` resolver step with a finite outcome set;
- `emit`: an allowed structured Domain Event.

A candidate declares:

- input and output contracts with schema digests;
- start state and named steps;
- explicit edges;
- query-only tool allowlist and tool contract digests;
- Domain Data digests;
- applicability clauses;
- hard `maxSteps` and `maxReasonedCalls` bounds;
- semantic content digest.

There is no arbitrary transform code, script body, provider prompt, runtime actor reference, mutation tool, or unbounded loop form.

## Validation pipeline

`validateCandidate()` is intentionally deterministic and fail-closed. It checks:

1. the constrained candidate shape;
2. forbidden/private/executable fields are absent;
3. semantic digest matches normalized candidate content;
4. every tool is declared, query-only, allowed by policy, and contract-digest matched;
5. every emitted/reasoned event belongs to the allowed Domain outcome set;
6. start/targets exist and declared edges exactly match step semantics;
7. all steps are reachable and a terminal emit is reachable;
8. every control cycle is rejected in this spike (therefore no unbounded cycle can execute);
9. query inputs come from the input contract and rule facts come from prior query output;
10. rule, tool, schema, and Domain Data references are content-addressed;
11. applicability refers only to declared inputs and is evaluated before execution;
12. candidate bounds fit validator policy;
13. mutation capability cannot enter this compiler path.

The spike intentionally rejects all cycles rather than inventing loop semantics. A future production IR can add bounded loops only with a separately reviewed contract and runtime counter semantics.

## Applicability

Applicability is a deterministic, explicit precondition list. The compiled child machine begins in an `applicability` state. If any clause fails, it returns `status: not-applicable` before invoking query or reasoned work. The caller can then choose another resolver/Harness; this subworkflow does not guess outside its declared domain.

## Explicit promotion boundary

The authority path is:

```text
planner proposal
  -> WorkflowCandidate
  -> validateCandidate()
  -> ValidatedCandidate
  -> explicit promoteCandidate(selection/evidence)
  -> PromotedWorkflowArtifact
  -> compilePromotedWorkflow()
  -> reusable XState child machine
```

The compiler checks the promoted artifact kind and rechecks the content digest. A raw or merely validated candidate is rejected at runtime. No repeated-success heuristic or LLM response can auto-promote itself.

Promotion metadata (`selectedBy`, `evidenceRef`) is audit metadata. It does not change the semantic workflow content digest.

## Content identity

The semantic digest is SHA-256 over a canonical semantic view:

- object keys are sorted;
- step-map key insertion order is irrelevant;
- edge order is normalized;
- allowed tool order, referenced Domain Data order, output event order, and applicability-clause order are normalized;
- `sourceLocation` is excluded as non-semantic relocation metadata;
- `semanticDigest` itself is excluded from its own digest input.

Therefore a content-identical candidate moved to another path or reordered in serialization keeps the same digest. Changes to a rule threshold, tool contract digest, event, contract, graph, applicability, or other behaviorally relevant content change the digest.

## Compilation and reuse

`compilePromotedWorkflow()` builds a reusable XState child machine from the promoted artifact. Each candidate step becomes an explicit XState state:

- query state -> invoked query actor -> next state;
- rule state -> pure guarded transition;
- explicit reasoned state -> invoked reasoned port -> finite declared outcome mapping;
- emit state -> structured DomainDecision -> final state.

The first `HarnessMachine` planner call can propose the pattern. After validation/promotion/compilation, a second compatible input starts the child workflow directly. The planner is not called again to recreate the process. A reasoned model call can still occur only if a `reasoned` step was explicitly present in the validated artifact.

## Durable mutation boundary

This research compiler accepts only `capability: query` tools. A mutation capability is rejected. Business mutations therefore remain the responsibility of the existing DomainHarness durable effect boundary; the reusable child workflow cannot embed arbitrary inline side effects.

## Executable evidence

Focused tests cover all #196 required scenarios plus two boundary tests:

1. structured Harness result + DecisionTrace + optional candidate;
2. valid candidate validation and XState compilation;
3. second compatible input executes without planner re-invocation;
4. explicit reasoned step is allowed only when declared;
5. unknown tool rejected;
6. arbitrary code/provider instruction rejected;
7. illegal Domain Event rejected;
8. cycle rejected;
9. applicability false fails closed before work;
10. stable digest across path/order relocation;
11. behaviorally relevant rule/tool contract changes alter digest;
12. explicit validation/promotion required before compilation;
13. mutation capability rejected;
14. free-form private reasoning field rejected by Harness structured-result parsing.

Final exact branch HEAD and canonical repository CI result are recorded in the Issue #196 closeout comment. Embedding the final commit SHA inside the commit itself would be self-referential, so the SHA is intentionally recorded in the immutable GitHub closeout evidence instead.

## Dependency / package impact

- production runtime/compiler/public contracts changed: **0**;
- production dependencies added: **0**;
- repository dependencies added: **0**;
- research-only runtime dependency used: existing `xstate` devDependency from `@kaicreator/domain-harness`;
- Node `crypto` is used only by the research fixture to demonstrate stable content hashing;
- write set is limited to `packages/domain-harness/tests/architecture-v03/**` and `docs/experiments/v0.3/**`.

## KEEP / ADAPT / DROP

**KEEP**

- #187 structured-result/XState child actor boundary;
- deterministic validation before control authority;
- content-addressed contracts/artifacts;
- fail-closed applicability;
- explicit promotion.

**ADAPT before production**

- define a production-owned versioned Workflow IR schema;
- decide whether bounded loops are needed and specify runtime counters/recovery;
- connect compiled query/reasoned steps to durable execution facts and production observability;
- define artifact storage, revocation, migration, and selection policy;
- connect mutation steps only through the existing durable effect protocol if production scope later requires them.

**DROP**

- free-form chain-of-thought persistence/replay;
- arbitrary code generation/execution;
- provider-specific instructions/secrets in workflow artifacts;
- implicit LLM-selected XState state ids;
- autonomous self-promotion/self-modification.

## Finding

A narrow, content-addressed, validated workflow IR can reuse a solving pattern produced by a structured Harness interaction while keeping XState/DomainHarness in control. The evidence supports further v0.3 architecture work, but this spike itself must remain a research/reference artifact and must not be merged into `main` or `v0.2` as production implementation.
