# v0.3 integrated Domain Machine + LLM-avoidance architecture research (#197)

## Scope

This document records **architecture research evidence only**. The branch `research_v03_architecture_integration` is not production code, is not to be merged into `main`/`v0.2`, and this note does not itself freeze the v0.3 PRD/L2.

The integrated reference flow is:

```text
Domain Machine
  -> deterministic rule
  -> exact semantic result cache
  -> applicable promoted reusable subworkflow
  -> HarnessMachine / ModelPort fallback
  -> structured DomainDecision / Domain Event
  -> current schema validation
  -> current synchronous XState guards
  -> XState transition
```

The product/economic hypothesis is that **domain workflow execution rate does not have to equal LLM call rate**.

## Consumed research evidence

The integration branch was created from fixed baseline `8e09c688da2900f35d978fb513b2fe09de6dde07`. No dependency research branch was merged. Only the minimum reference semantics/contracts needed by this fixture were adapted.

| Research | Exact consumed SHA | What was consumed |
| --- | --- | --- |
| #187 HarnessMachine synthesis | `3cb9aa6f0579087a793ee8c30bedf8cdd8a36387` | one XState control runtime; reusable HarnessMachine; structured DomainDecision; parent schema/guard/transition authority; mutation excluded from HarnessMachine |
| #194 exact semantic invocation cache | `0ace38118f000c71641c3e1bf8a94276ef4cec60` | canonical content-addressed semantic identity; execution identity excluded; namespace/scope; exact cache eligibility; current validation/guard remains authoritative |
| #195 real SQLite crash recovery | `419269f788de1d46e24af8bea19b041c8e36760f` | recovery/ownership conclusion only: XState persists control; DomainHarness durable store/effect journal remains replay/mutation authority |
| #196 reusable subworkflow compilation | `7c6c7a63b643fbaa5051db8e403dd15f7721dce8` | constrained WorkflowCandidate; deterministic validation; explicit promotion; content digest; fail-closed applicability; reusable child workflow without planner reconstruction |

#195 final exact SHA has canonical Woodpecker PASS evidence. #196 was closed with focused research acceptance and an operator-directed waiver for the remaining Woodpecker-only CI condition; the controlling instruction for #197 was to continue if the remaining blocker was only CI.

## Domain Data model

The demo uses the intended high-level distinction:

```text
Domain Data
  = Domain Facts
  + Compiled Domain Intelligence
```

`Domain Facts` are current factual inputs/state such as the synthetic blocked-country set.

`Compiled Domain Intelligence` is immutable/content-addressed intelligence that can resolve or constrain a domain decision without asking an LLM to rediscover it. The reference fixture includes:

- deterministic rule identity;
- knowledge identity;
- skill identity;
- model-facing tool-contract identity;
- output-contract identity;
- Harness semantic-policy identity;
- promoted reusable-subworkflow artifact identity.

The experiment intentionally does not build a general knowledge platform.

## Resolver semantics

### 1. Deterministic rule

Rules are checked first when stable compiled domain intelligence is sufficient. A rule produces the same structured `DomainDecision` contract as every other resolver path.

A rule path never calls ModelPort/AI Runtime. It still re-enters the Domain Machine's current schema/guard/transition authority.

### 2. Exact semantic cache

The semantic cache reuses a **structured computation result**, not control state and not an execution-journal record.

The reference semantic identity is content-addressed from behaviorally relevant inputs:

- decision/domain identity;
- selected domain input;
- rule content digest;
- knowledge content digest;
- skill content digest;
- model-facing tool semantic digest;
- output-contract digest;
- relevant Harness semantic-policy digest;
- cache namespace/scope.

It deliberately excludes execution-only identity such as `workflowInstanceId`, `sourceMessageId`, and `effectId`, and excludes unrelated UI/telemetry context. Therefore an equivalent semantic problem under a different execution identity can be an exact hit.

A cache hit still returns only a structured `DomainDecision`; the current schema and current parent guard are evaluated again. A stale decision cannot force a transition that the current guard rejects.

Explicitly non-cacheable or time-sensitive invocations bypass this mechanism.

### 3. Promoted reusable subworkflow

Reusable subworkflows reuse a **solving pattern**, which is distinct from reusing an answer.

The demo carries only the minimum #196 semantics:

```text
WorkflowCandidate
  -> deterministic validation
  -> explicit promotion
  -> content-addressed promoted artifact
  -> reusable XState child workflow
```

The fixture requires:

- explicit applicability;
- allowlisted query-tool contract;
- finite Domain Event outputs;
- acyclic control flow for this research subset;
- stable semantic content digest;
- no arbitrary executable code;
- explicit validation and promotion before compilation/execution.

An applicable promoted subworkflow executes directly on a second compatible input without planner reconstruction. Inapplicable or unknown-artifact cases fail closed and fall through to HarnessMachine.

A future promoted workflow may explicitly declare a reasoned step, but only that declared step may consume model calls. The reference integrated fixture uses a fully deterministic query/rule child workflow so its model call count is zero.

### 4. HarnessMachine fallback

Only genuinely unresolved semantics reach HarnessMachine. The fixture uses an XState HarnessMachine that performs one bounded ModelPort call and returns:

- structured `DomainDecision`;
- structured `DecisionTrace` containing externally checkable facts/evidence references.

The trace is not free-form hidden chain-of-thought and is not execution authority. HarnessMachine does not return or mutate a parent XState state id.

The integrated HarnessMachine has no HarnessMachine-to-HarnessMachine actor chain. Provider/model routing remains behind the ModelPort / AI Runtime boundary rather than becoming DomainHarness business-control logic.

## Schema, guard, and transition authority

All four resolution paths converge back into the parent Domain Machine:

```text
Resolver output
  -> validate DomainDecision schema
  -> evaluate current synchronous XState guard
  -> perform XState transition
```

This means cached reasoning, compiled subworkflow output, and fresh model output have the same authority level: **none can directly select an XState state**.

The focused fixture explicitly seeds a cache with `QUOTE_REQUESTED`, then changes the current `quoteWindowOpen` guard. The cache still hits, no fresh model call occurs, and the parent transitions to `guardRejected` rather than `quoteRequested`.

## Mutation and durable-effect authority

A structured decision may contain a **proposed** business mutation, but neither semantic-cache commit/hit nor reusable-subworkflow execution means the business mutation has happened.

The experiment uses a separate `DurableEffectAuthority` fixture:

```text
DomainDecision(proposed mutation)
  -> parent/runtime effect path
  -> durable effect identity/idempotency
  -> business mutation
```

The tests prove:

- reasoning can be cached while mutation application count remains zero;
- executing a cached decision with a new execution/effect identity performs that mutation through the durable authority;
- replaying the same effect identity does not apply the mutation twice;
- another distinct effect identity may legitimately perform another mutation.

This preserves #195's recovery boundary. On a crash/restart, XState control persistence is not the replay authority for committed model/query/mutation work. DomainHarness durable journal/effect state is. #195 also identified the missing production recursive XState snapshot seam, tracked in #201.

## Deterministic batch / LLM avoidance measurement

The executable batch contains eight domain decision invocations:

| Metric | Result |
| --- | ---: |
| total domain decisions | 8 |
| deterministic rule resolved | 2 |
| semantic cache hits | 1 |
| semantic cache misses | 4 |
| semantic cache bypasses | 1 |
| reusable subworkflow resolved | 2 |
| subworkflow matches | 2 |
| subworkflow misses/fallthroughs | 3 |
| Harness/model required | 3 |
| actual model calls | 3 |
| planner/reconstruction calls for reusable subworkflow | 0 |
| decisions requiring no fresh LLM call | 5 |

Therefore:

```text
LLM Avoidance Rate
  = 5 / 8
  = 62.5%
```

This number is deterministic research evidence for the fixture, not a product SLA or target.

The important evidence is the inequality:

```text
8 domain decisions != 8 model calls
8 domain decisions -> 3 model calls
```

As deterministic rules, exact semantic results, and promoted solving patterns accumulate, the architecture can resolve more executions without fresh model work.

## Correctness evidence represented by the focused tests

The integration tests cover:

1. exact dependency SHAs are encoded in the research fixture;
2. the full resolver ordering reaches parent schema/guard/XState authority for rule, cache, subworkflow, and Harness paths;
3. rule resolution performs zero LLM calls;
4. semantically identical inputs under different workflow/message/effect identities reuse one model result;
5. unrelated UI/telemetry context does not cause a cache miss;
6. promoted reusable subworkflow executes with zero planner reconstruction and zero model calls in the deterministic template;
7. changed subworkflow artifact or failed applicability falls through rather than executing stale/inapplicable logic;
8. unknown semantics enter HarnessMachine and return a structured DecisionTrace/DomainDecision, not a state id;
9. cached decisions are revalidated against a changed current guard;
10. time-sensitive invocation bypasses semantic cache;
11. rule semantic-content change changes semantic identity;
12. workflow-artifact-only change invalidates subworkflow selection without unnecessarily changing the independent semantic-result identity;
13. raw/invalid WorkflowCandidate cannot become executable; unknown tool, illegal event, arbitrary code, and cycles fail validation;
14. cached computation does not imply mutation execution, and mutation remains behind effect idempotency;
15. deterministic batch produces the exact LLM-avoidance counters above.

## Component and authority map

| Component | Owns | Does not own |
| --- | --- | --- |
| Domain Machine / XState | business state, current schema/guards, transitions, parent/child lifecycle | provider routing, semantic cache equivalence policy as business state, direct model internals |
| Decision Resolver | preference ordering and resolver fallthrough | mutation execution, provider/model routing |
| Deterministic rules | stable compiled domain logic | state transition authority |
| Exact semantic cache | exact structured result reuse under semantic equivalence | execution replay, mutations, transition authority |
| Promoted subworkflow registry/compiler | validated solving-pattern reuse | automatic self-promotion, arbitrary code, mutation authority |
| HarnessMachine | bounded unresolved reasoning/tool observation for one invocation | parent business flow, mutation authority, provider policy |
| DomainHarness durable runtime/effect journal | durable messages/effects/replay/idempotency/recovery facts | model-provider selection |
| AI Runtime / ModelPort adapter | provider/model selection, provider execution/retry/fallback | Domain Machine transition authority |

## Architecture that can now enter v0.3 Architecture Baseline Freeze

The following architecture-level decisions are supported by combined executable evidence from #187/#194/#195/#196/#197 and can be proposed for the v0.3 Architecture Baseline:

1. **One XState control runtime.** Domain Machine remains business-control authority; reusable HarnessMachine/subworkflows are child actors/machines rather than a second workflow runtime.
2. **Structured DomainDecision/Event boundary.** LLM/Harness/cache/subworkflow/rule outputs never directly set an XState state id.
3. **Resolver preference:** deterministic compiled intelligence -> exact semantic result cache -> applicable promoted reusable subworkflow -> bounded HarnessMachine fallback.
4. **Domain Data model:** Domain Facts + Compiled Domain Intelligence.
5. **Semantic cache is not execution journal.** Semantic equivalence can cross workflow/message identity; execution journal remains execution-specific durable replay authority.
6. **Content-addressed semantic identity/invalidation.** Only behaviorally relevant selected content belongs in exact semantic equivalence; unrelated execution/UI context should not cause misses.
7. **Every result re-enters current schema/guard/transition authority.** Reuse never confers transition authority.
8. **Reusable workflow lifecycle requires deterministic validation plus explicit promotion/selection.** No autonomous LLM-to-production workflow path.
9. **Mutation remains DomainHarness durable-effect authority.** A reused decision is computation reuse, not side-effect replay.
10. **Provider/model routing remains AI Runtime authority.** DomainHarness owns business/control semantics, not vendor/model selection.
11. **Recovery split:** XState control snapshot restores control position; DomainHarness durable journal/effect state remains committed-work replay/idempotency authority.

These are architecture statements, not approval to merge this research branch as implementation.

## Implementation details that must remain unfrozen

The evidence does **not** justify freezing these product implementation choices yet:

- exact production TypeScript interface names/shapes for DecisionResolver, semantic cache, WorkflowCandidate, promoted artifact, or Domain Data packages;
- persistent semantic-cache storage engine, topology, TTL/retention/eviction and multi-tenant capacity policy;
- rule-engine representation/compiler and authoring format;
- complete reusable-workflow IR, compiler internals, registry, version selection, revocation and promotion UX/governance;
- whether promoted subworkflows may contain reasoned steps in the first product slice and exact budgets for those steps;
- telemetry backend and whether LLM Avoidance Rate becomes a product metric/SLA;
- exact recursive XState parent/child snapshot schema and transaction ordering relative to durable journal commits;
- provider/model selection/fallback policy inside AI Runtime;
- fuzzy/vector retrieval or similarity-based result reuse (not proven here and must not be treated as an exact cache hit).

## Production follow-up issues

Concrete implementation work discovered/confirmed by the research is tracked separately:

- **#201** — production durable XState parent/child control-snapshot persistence seam and ordering contract, discovered by #195.
- **#203** — production DecisionResolver + exact semantic cache seam, including persistent exact-result storage/eligibility/metrics and current-schema/guard revalidation.
- **#204** — production promoted reusable-subworkflow registry/compiler lifecycle, including explicit validation/promotion/versioning/revocation and constrained execution.
- **#205** — production Domain Data compiled-intelligence package and content-invalidation contracts.

These issues should consume the frozen architecture after an explicit v0.3 baseline decision rather than copy the research fixtures verbatim.

## Conclusion

The integrated evidence supports the intended AI-native execution model: DomainHarness can increase domain intelligence without forcing a fresh LLM call on every workflow execution. Rules generalize deterministic knowledge, the semantic cache reuses exact answers, promoted subworkflows reuse solving patterns, and HarnessMachine handles the genuinely unresolved remainder.

The core safety/authority boundaries remain intact across every path: structured outputs, current schema/guards, XState transitions, durable mutation effects, and recovery authority remain separate from model reasoning and provider routing.
