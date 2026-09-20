# v0.3 Research — Unified XState Domain Machine + HarnessMachine

**Issue:** #187  
**Status:** architecture research evidence only; this artifact does **not** modify or freeze v0.3 PRD/L2 and is not production implementation.  
**Fixed baseline / research branch:** `research_harness_machine` from `8e09c688da2900f35d978fb513b2fe09de6dde07`.

## Dependency evidence read before synthesis

The three prerequisite studies were read from their completed research branches before implementation:

| Issue | Research evidence | Exact research HEAD / CI | Transferable conclusion |
| --- | --- | --- | --- |
| #184 Pi | `PI_MINI_AGENT_KERNEL.md` | `cdb7ac0c6fc8aab0f129b3d90fb937386ecd792d`; Woodpecker PASS | bounded model → tool → observation → model loop, cancellation, hard max-step, structured final validation; drop generic session/product runtime |
| #185 DeepSeek Harness | `DEEPSEEK_HARNESS_MINI_CORE.md` | `ac8559f9d3e59c98e65ed0ba9cdaa166f8b66bf8`; Woodpecker PASS | deterministic request/tool surface, schema/executor separation, ordered run facts, tool failure as observation; durability remains DomainHarness-owned |
| #186 OpenAI Agents JS | `OPENAI_AGENTS_JS_MINI_RUNNER_SPIKE.md` | `93044c29f330cec510c4fb765d21797dca06f846`; Woodpecker PASS | Runner/run-state ideas reduce to bounded Node reasoning; approval pauses before mutation; provider routing and business approval remain outside the inner loop |

#186 had been reopened after its implementation/evidence landed. Its branch had complete acceptance evidence plus exact-HEAD CI; the dependency closeout was recorded and the issue restored to `completed` before #187 implementation proceeded.

## Architecture question

Can the useful invariants from #184/#185/#186 live inside the **same XState Actor System** that owns Domain Workflow control flow, without a second `NodeHarnessKernel Runtime` or an opaque promise loop?

The spike answer is **yes** for the tested research surface:

```text
DomainHarness Runtime
  └── XState Actor System
       ├── Domain Machine
       │    └── invoke: HarnessMachine
       │
       └── HarnessMachine
            prepare
              → model (promise actor via ModelPort)
              → handleModel
              → prepareTool
              → tool (query-tool promise actor)
              → prepare/model ...
              → validateFinal
              → succeeded | failed
```

`HarnessMachine` itself is the reasoning control-flow primitive. The promise actors are leaf I/O boundaries only; there is no hidden `for`/`while` reasoning loop behind them.

## Runnable research artifacts

- `packages/domain-harness/tests/architecture-v03/harness-machine-spike.ts`
- `packages/domain-harness/tests/architecture-v03/harness-machine-spike.test.ts`

The implementation is intentionally under `tests/architecture-v03/`; no production compiler/runtime/public contract is changed.

Measured spike footprint before closeout:

- Harness/domain research machine implementation: **505 physical LOC**
- focused tests: **259 physical LOC / 12 executable scenarios**
- new production runtime dependencies: **0**
- new repository dependencies: **0** (`xstate` already exists as a `@kaicreator/domain-harness` devDependency)

The LOC number is research evidence, not a target or quality score.

## Structured reasoning boundary

The model receives a deterministic `ModelRequest` containing:

- already-resolved Domain input;
- **query-only** model-facing tool schemas, sorted by name;
- ordered tool observations;
- the current bounded model step number.

The model may return only one of two reasoning outputs:

1. a tool-call proposal; or
2. a structured Domain Decision shaped as a proposed Domain Event:

```ts
{
  type: 'TECHNICAL_REVIEW_REQUIRED' | 'QUOTE_REQUESTED' |
        'MORE_INFORMATION_REQUIRED' | 'REJECTED',
  payload: { reason: string }
}
```

It never returns an XState state id. Exact-key validation rejects extra state/control-flow fields. `HarnessMachine` validates the finite outcome/payload contract, then the parent Domain Machine validates the result again and evaluates ordinary synchronous XState guards before choosing a business transition.

This keeps schema/guard/transition authority in XState and host code rather than in the LLM.

## Mutation / approval boundary

`HarnessTool` distinguishes `query` from `mutation` capability. `HarnessMachine` exposes only query schemas to the model and refuses a mutation tool call before the executor can run. This spike therefore proves the required negative boundary: protected business mutation is **not** executed inside the reasoning actor.

A later production design may let a structured Domain Event transition the parent into an approval/effect state, but that business/human approval lifecycle belongs to the Domain Machine and durable effect runtime, not to HarnessMachine.

## Failure and cancellation semantics

- model/provider failure -> Harness result fails closed; the parent reaches `failed` and no business transition occurs;
- unknown tool -> fail closed;
- mutation tool proposal -> fail closed before execution;
- ordinary query-tool exception -> ordered model-visible error observation; the model may recover on the next bounded step;
- hard `maxSteps` -> fail closed before another model turn;
- parent/child actor stop -> XState stops invoked promise actors; their `AbortSignal` reaches active model/tool work;
- invalid/unknown Domain Decision -> fail closed;
- a valid `REJECTED` proposal still cannot transition when the current parent `rejectionAllowed` guard is false.

## Required executable scenarios

The focused Node tests map one-to-one to #187:

1. Domain Machine -> HarnessMachine -> model -> query tool -> observation -> model -> structured event -> parent guard -> transition;
2. two different inputs produce two different legal outcomes;
3. unknown/unallowed outcome fails closed;
4. invalid payload fails closed;
5. valid proposed event rejected by parent guard does not enter the rejected business state;
6. model failure fails reasoning without hidden business mutation;
7. stopping the parent propagates cancellation to both active model and active tool work;
8. max-step exhaustion fails closed;
9. ordinary query failure becomes a model-visible observation and can recover;
10. mutation-capable business effect is hidden from the model tool surface and never executes in HarnessMachine;
11. HarnessMachine's direct actor roles are only leaf `modelTask` and `queryToolTask`, with no HarnessMachine-to-HarnessMachine business-control path;
12. two interchangeable `ModelPort` implementations drive the same Domain/Harness machines, keeping provider/model selection replaceable behind the AI Runtime adapter boundary.

## KEEP / ADAPT / DROP synthesis

| Decision | Convergent evidence | #187 treatment |
| --- | --- | --- |
| **KEEP** | bounded model -> tool -> observation -> model -> final | represented directly as HarnessMachine states/transitions |
| **KEEP** | provider-neutral model seam | `ModelPort.generate(request, signal)`; provider/model choice remains injectable |
| **KEEP** | tool schema/executor separation | model sees query schemas; executor functions remain host-only |
| **KEEP** | cooperative cancellation | XState invoke lifecycle supplies AbortSignal to active leaf actors |
| **KEEP** | hard max-step | `prepare` guard prevents unbounded next model turn |
| **KEEP** | structured final validation | exact finite DomainDecision parser fails closed |
| **KEEP** | ordered lifecycle/run facts | Harness context appends dense facts around prepare/model/tool/final/failure boundaries |
| **KEEP** | query-tool failure as observation | ordinary query failure returns `{ ok:false, error }` and can be reasoned over |
| **ADAPT** | approval pause / protected mutation | child actor refuses mutation; parent Domain Machine owns approval/business transition before any protected effect |
| **ADAPT** | resumable/session/run state | only invocation-local observations/facts live here; durable recovery remains DomainHarness runtime authority |
| **ADAPT** | deterministic prompt/request spine | this spike proves deterministic Domain input + sorted tool schemas + ordered observations; full Context Resolver assembly stays outside |
| **DROP** | standalone NodeHarnessKernel Runtime | not implemented; one XState Actor System is the control-flow runtime |
| **DROP** | opaque async while-loop service | reasoning progression is explicit XState states/events/invokes |
| **DROP** | LLM-selected state id / transition | model produces DomainDecision only; XState remains transition authority |
| **DROP** | generic AgentSession/memory/provider SDK/multi-agent handoff/sandbox/scheduler/UI | outside one DomainHarness reasoning invocation |
| **DROP** | HarnessMachine-to-HarnessMachine hidden business flow | no actor role or tool capability exists for this; parent Domain Machine owns composition |

## Ownership after the spike

| Concern | Owner |
| --- | --- |
| business state, legal events, guards, transitions, parent/child lifecycle | **XState Domain Machine / Actor System** |
| bounded reasoning/tool loop for one invocation | **HarnessMachine (XState child machine)** |
| selected/canonicalized Domain Data | **Context Resolver** |
| durable message/effect/AI facts, recovery, cache authority | **DomainHarness durable runtime** |
| provider/model routing, retry/fallback/provider execution | **AI Runtime behind ModelPort** |

## Findings

1. A reusable XState child machine can express the extracted agent-loop invariants without adding a second runtime.
2. The important architectural seam is **reasoning result as data**, not state-machine control. A DomainDecision/Domain Event proposal is sufficient; state ids remain internal to the parent.
3. XState's invoke lifecycle naturally gives the reasoning actor cancellation ownership without letting it own workflow cancellation policy.
4. Query errors and provider failures should remain distinct: query errors can be observations; provider/model failure fails the invocation unless a higher AI Runtime policy handles retry/fallback.
5. Mutation/approval remains a parent/durable-effect concern. Giving the reasoning child direct mutation authority would collapse the business-control boundary and is intentionally rejected.
6. Ordered invocation-local facts are useful evidence, but they are not a replacement for DomainHarness durability/recovery authority.
7. No production seam change was required for this architecture demo. Therefore no follow-up production-runtime Issue is created from #187.

## Scope statement

These artifacts are **reference architecture evidence only**. They are not merged product implementation, do not freeze v0.3 PRD/L2, and must remain on `research_harness_machine` unless a later architecture decision explicitly adopts and re-implements the findings through the normal product evidence/architecture/task process.
