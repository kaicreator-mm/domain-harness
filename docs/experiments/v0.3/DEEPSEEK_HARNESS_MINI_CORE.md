# v0.3 Research — DeepSeek Harness Mini Core

**Status:** RESEARCH EVIDENCE for #185 / parent #183. This does **not** modify or freeze the v0.3 PRD or L2 architecture.

**DomainHarness baseline:** `main` @ `fa3e7f13e67a65a9fbd714d1518db920cb717144`  
**Source repository:** `deepseek-ai/deepseek-harness`  
**Pinned source commit:** `ddefc45fbc7f8e46dd73185e68295696d1297887` (`release(dsh): 0.1.6-alpha.2`)  
**Source license:** MIT (package manifests and repository license)  
**Extraction style:** clean-room behavioral reimplementation. The mini core does not import DeepSeek Harness and does not copy its package/plugin vocabulary or source code.

## Research question

What is the smallest useful reasoning/tool loop that can live **inside one DomainHarness Workflow Node** while leaving workflow, context selection, provider/model routing, and durability to their existing owners?

The answer from this extraction is:

```text
NodeHarnessMiniCore
├── ModelPort                     # injected; AI Runtime owns provider/model
├── deterministic prompt assembly
├── ToolRegistry                  # model-facing schema + executable definition
├── bounded AgentLoop             # model → tools → observations → model
├── ordered ephemeral RunFacts    # exact node-run reconstruction/debug facts
├── AbortSignal + maxSteps
└── StructuredFinal parser
```

It is deliberately **not** a Session product, plugin platform, workflow engine, provider router, sandbox, memory/RAG layer, or durable runtime.

## Pinned source spine inspected

The package docs, implementation, and focused tests were read at the exact pinned commit. The smallest source path that explains the relevant behavior is below.

| DeepSeek component | Minimum source read | Physical LOC | What it contributes to the study |
| --- | --- | ---: | --- |
| session | `packages/core/session/src/index.ts` | 1,317 | append-only facts, derived model history, reconstructable request boundary |
| system-prompt | `packages/core/system-prompt/src/index.ts` | 638 | deterministic section ordering, strict variables, canonical tool ordering |
| tools | `packages/core/tools/src/index.ts` | 1,955 | schema/execution separation, structured failures, cooperative cancellation |
| agent | `packages/core/agent/src/runtime-types.ts` | 399 | minimal live-agent vocabulary, cancellation/step interception boundary |
| agent-loop | `packages/core/agent-loop/src/agent.ts` | 620 | turn/step/model/tool ordering and request reconstruction |
| agent-loop tool scheduler | `packages/core/agent-loop/src/tool-calls.ts` | 290 | model-order call/result facts and cancellation settlement |
| **Selected source spine** | **6 files** | **5,219** | behavior-bearing reference set, not the whole DeepSeek Harness |

Focused source tests inspected include `packages/core/system-prompt/tests/tool-order.spec.ts` and the `packages/core/agent-loop/tests/` cancellation/interception/contract suites. The source tool-order tests explicitly prove registration-order independence; the loop/tool code explicitly records synthetic aborted-before-dispatch results for model calls skipped after cancellation.

### Dependency surface measurement

Across the five source package manifests (`session`, `system-prompt`, `tools`, `agent`, `agent-loop`) the pinned source has **20 unique direct runtime-facing peer/dependency package names**. That count includes the Cordis/plugin substrate, session/persistence/projection packages, LLM packages, scope/settings, sandbox/approval/PTC support, utility packages, Schemastery, and Zod.

The extracted mini core has **0 external runtime dependencies**. It relies only on TypeScript/JavaScript platform primitives (`AbortSignal`, `Map`, JSON-compatible values). Its implementation is **390 physical LOC** plus **259 LOC / 6 tests**. Against the selected 5,219-LOC source spine, the implementation is about **92.5% smaller** by physical LOC. This is a research-size comparison, not a claim of feature equivalence.

## KEEP / ADAPT / DROP

| Decision | Source idea | Evidence from pinned source | DomainHarness mini-core treatment |
| --- | --- | --- | --- |
| **KEEP** | model-visible request must be reconstructable from explicit facts | Session derives messages from logged facts; agent-loop builds requests from derived messages + canonical tool surface | each `model/request` fact snapshots the exact model-visible messages and tool schemas (signal excluded) |
| **KEEP** | deterministic prompt and tool surface | sections sort by order/name; tools canonicalize independently of registration order; unknown variables fail loudly | sections sort by `(order, code-unit name)`; strict `{{variable}}`; tools sort by name |
| **KEEP** | tool schema is distinct from executable authority | DeepSeek exposes schemas to the model while execution/policy stays in the tool registry | `ToolSchema` is model-facing; `ToolDefinition.execute` is host-only |
| **KEEP** | ordinary tool failure is an observation, not automatically a loop failure | tool registry returns structured error results; next model step can reason over them | tool exceptions become ordered `TOOL_ERROR` observations and the loop continues |
| **KEEP** | cancellation facts must preserve whether dispatch occurred | DeepSeek distinguishes `ABORTED` from `ABORTED_BEFORE_DISPATCH` and synthesizes pairs for skipped calls | started call settles as `ABORTED`; remaining model calls get synthetic call/result facts with `ABORTED_BEFORE_DISPATCH` |
| **ADAPT** | append-only Session log | full Session is a durable generic product with projections/forks/headers | reduce to one-node ephemeral `RunFact[]`; DomainHarness Runtime decides what becomes durable message/effect/recovery evidence |
| **ADAPT** | Agent loop turn/step machine | source loop also owns inbox, retries, provider preparation, streaming, session lifecycle | retain only bounded node steps: model → ordered tools → observations → model → structured final |
| **ADAPT** | model-request interception | source exposes extensible waterfalls for routing/retry/plugins | no generic interception bus; `ModelPort` injection + `AbortSignal` are sufficient for policy/testing at this layer |
| **ADAPT** | tool scheduler | source supports exclusive barriers + bounded parallel pools while committing results in model order | mini core executes sequentially; the transferable invariant is **model-order facts**, not the scheduler implementation |
| **DROP** | persistent generic Session product | persistence, fork, repair, surface replacement, headers, projections | DomainHarness Runtime already owns durability/recovery; Node mini core must not become a second runtime |
| **DROP** | Cordis/plugin composition, scoped registries, Agent registry/inbox | platform composition/lifecycle concerns | no plugin framework or live-agent product |
| **DROP** | provider/model routing and adapter defaults | source resolves provider/model in the loop | AI Runtime owns provider/model authority |
| **DROP** | PTC, sandbox, approval platform, subagent/scheduler platform | useful full-agent features, outside one Node reasoning loop | tool capabilities arrive already selected by Context Resolver / host adapters |
| **DROP** | workflow semantics | DeepSeek loop is an agent lifecycle, not DomainHarness workflow authority | XState remains the sole workflow-control owner |

## Mini-core contract

The standalone artifact lives in:

- `packages/domain-harness/tests/architecture-v03/deepseek-harness-mini-core.ts`
- `packages/domain-harness/tests/architecture-v03/deepseek-harness-mini-core.test.ts`

The implementation has no production import from `@kaicreator/domain-harness` and no dependency on DeepSeek Harness. Keeping it under `tests/architecture-v03/` makes the artifact executable evidence without silently changing v0.2 public/runtime semantics.

### Ownership boundary

| Concern | Owner after extraction |
| --- | --- |
| workflow states/transitions/invocation lifecycle | **XState / Workflow Core** |
| selected knowledge, skills, history, prompt sections, tool set | **Context Resolver** |
| provider/model selection and actual model transport | **AI Runtime via `ModelPort` adapter** |
| durable messages/effects/recovery/cache and crash semantics | **DomainHarness Runtime** |
| one Node's bounded reasoning/tool loop + ephemeral ordered facts | **Node Harness Mini Core** |

The mini core receives already-selected history/sections/tools. It does not query knowledge, choose providers, persist effects, or transition workflows.

## Executable behavior

The focused test file covers all #185 required scenarios:

1. **Deterministic prompt/context assembly** — registration order cannot change section/tool ordering; variables resolve strictly; literal sections remain literal.
2. **Model → tool → observation → model → final** — second model request contains the ordered tool observation and a parsed structured final completes the run.
3. **Tool failure** — a throwing tool becomes a `TOOL_ERROR` observation and the model can recover on the next step.
4. **Cancellation ordering** — a started call settles `ABORTED`; a later undispatched call receives synthetic `ABORTED_BEFORE_DISPATCH`; `step/end` precedes terminal `run/end`.
5. **Max-step termination** — `maxSteps` is a hard model-call bound and terminates with an explicit `run/end { status: "max-steps" }` fact.
6. **Invalid structured final** — parser failure terminates as `invalid-final`, never as success.

A success-path assertion also pins the transcript sequence:

```text
run/start
step/start
model/request
model/response
tool/call
tool/result
step/end
step/start
model/request
model/response
step/end
run/end
```

Every fact has a dense `seq`, and each model request fact snapshots the messages + model-facing tool schemas necessary to explain what that node step saw.

## Validation evidence

Before remote publication, the clean-room artifact was checked locally without repository dependencies:

- mini-core TypeScript strict check: **PASS** (`strict`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`)
- transpiled focused runtime tests under Node 22.16.0: **6/6 PASS**

Repository canonical CI remains authoritative after the branch is published; local ad-hoc execution is not used as a substitute for Woodpecker/root regression evidence.

## Decomposition principles for DomainHarness v0.3

1. **Persist facts at the layer that owns durability, not inside the reasoning loop.** DeepSeek's event-sourced Session is valuable evidence for reconstructability, but DomainHarness already has durable message/effect/recovery authority. Carry the invariant, not the Session product.
2. **One model request should be derivable from declared inputs.** Context Resolver outputs + deterministic prompt/tool canonicalization should be sufficient; registration or plugin-load order must not affect the request.
3. **Expose capabilities, not implementations.** The model gets tool schemas; the host retains executable functions and policy authority.
4. **Tool errors are reasoning inputs.** Ordinary tool failure should become a structured observation unless policy says the entire Node failed.
5. **Cancellation is a fact-ordering problem, not just an AbortSignal.** The transcript must distinguish started work from work that was never dispatched.
6. **Bound the loop explicitly.** A Node reasoning loop needs a hard step budget independent of workflow transitions or provider retry policy.
7. **Structured final validation belongs at the Node boundary.** Invalid final output is not a successful Node result and must fail closed before workflow consumption.
8. **Do not import a full agent platform to obtain an inner loop.** DeepSeek Harness demonstrates strong decomposition, but its plugin/session/provider/sandbox ecosystem would duplicate owners already present in DomainHarness.
9. **Sequential is the correct extraction baseline.** Parallel tool scheduling is an optimization/policy extension; deterministic model-order observations are the transferable semantic requirement.
10. **The Node kernel should stay replaceable.** Its contract should be small enough that Pi/openai-agents-js evidence can be compared against the same shape in parent #183 without selecting a framework winner prematurely.

## Result for parent #183

DeepSeek Harness supports the parent hypothesis, but with one refinement:

```text
NodeHarnessKernel
├── ModelPort
├── deterministic Request Assembly
├── ToolRegistry
├── bounded AgentLoop
├── NodeRunTranscript / ordered run facts
├── Cancellation + limits
└── StructuredFinalResult
```

The useful intersection is **a reconstructable, deterministic, bounded inner loop**. Persistent Session, plugin composition, provider routing, sandboxing, and workflow semantics are not part of that kernel.

## Provenance

This artifact is an independent research implementation informed by public MIT-licensed DeepSeek Harness behavior at the pinned commit. No DeepSeek Harness dependency is added, no upstream source file is vendored, and no DeepSeek package or plugin API is reproduced as a compatibility surface. The upstream source/commit/license are recorded here so later synthesis can reproduce the comparison.
