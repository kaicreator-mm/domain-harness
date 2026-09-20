# v0.3 Architecture Research — bounded mini Agent Runner from openai-agents-js

**Issue:** #186  
**Status:** RESEARCH EVIDENCE / SPIKE — not a PRD or L2 freeze.  
**DomainHarness remediation baseline:** `main` @ `8d296d359c988f2759d8a1a811714fc3c948f548`.  
**Upstream:** `openai/openai-agents-js` @ `b11eaba663b22fff2541457e1be508a0bf3eb344`.  
**Provenance:** independent clean-room reimplementation of observed control-flow ideas; no upstream source is vendored or copied. Upstream package is MIT licensed.

## Decision

**Recommendation: ADAPT.** Preserve only the bounded single-Node `generation -> tool -> observation -> generation` kernel plus explicit tool availability, approval pause, final validation, cancellation/failure propagation, and ephemeral continuation facts.

Do **not** adopt the OpenAI Agents SDK as a runtime dependency and do **not** reproduce its provider registry, sessions, tracing, sandbox, MCP, hosted tools, multi-agent handoffs, or workflow responsibility.

Boundary remains:

- XState owns Domain Workflow state/transitions and any human/business approval transition;
- DomainHarness owns context selection, durable messages/effects/recovery/cache and validates the Node result before emitting workflow events;
- AI Runtime owns provider/model selection, credentials and retry policy;
- this mini runner owns only bounded iterative model/tool execution inside one Workflow Node invocation.

## Pinned upstream evidence / footprint

The study read the pinned `agents-core` Runner, RunState, run-loop/tool-execution surfaces and relevant tests, including approval/tool-enablement scenarios (`packages/agents-core/test/agentScenarios.test.ts`, `runState.cases.ts`, runner tests).

| Upstream surface | Measured footprint / dependency observation | Research implication |
| --- | ---: | --- |
| `packages/agents-core/src/run.ts` | **3,809 source lines** | Runner combines model invocation, sessions, tracing, guardrails, retries, streaming, sandbox, handoff and persistence concerns. |
| `packages/agents-core/src/runState.ts` | **>5,000 source lines** | General resumability/state is far larger than one Node needs. |
| `packages/agents-core/src/runner/runLoop.ts` | separate helper module | Confirms useful turn-control logic exists but is coupled to the wider SDK state model. |
| `@openai/agents-core` required runtime deps | **3**: `@standard-schema/spec`, `debug`, `openai` | Direct adoption would import provider/schema/logging policy into DomainHarness. |
| optional integration | `@modelcontextprotocol/client` | MCP is outside this kernel. |
| optional peer | `zod` | The kernel does not need a schema package; DomainHarness owns contract validation. |

The two main upstream Runner/RunState files alone are therefore **>8,809 lines**, before supporting runner/model/tool/result/tracing/session/sandbox modules.

## Responsibility map

| Concern | Upstream role | Mini-kernel treatment |
| --- | --- | --- |
| Agent configuration | instructions, tools, output contract, broader agent composition | Plain input data: ordered prompts, injected tools, optional final validator. No Agent object graph. |
| Runner | drives turns, model calls, tool processing, termination | Retained only as a hard-bounded single-Node loop. |
| RunState | tracks generated items, interruptions, resumable SDK state, lifecycle metadata | Reduced to ephemeral messages + `nextStep` + append-only research journal. It is not durable authority. |
| Tool execution | tool visibility, approval checks, invocation, outputs | `isEnabled` filters model-visible tools; `requiresApproval` returns a pause before any side effect; `execute` is injected capability code. |
| Provider/model integration | model provider selection and SDK model request implementation | Replaced by one injected `generate(request)` port owned operationally by AI Runtime. |
| Output guardrail / validation | broad guardrail framework and output validation | Reduced to optional fail-closed `validateFinal` at the Node boundary. |

## KEEP / ADAPT / DROP

| Classification | Upstream principle | DomainHarness treatment |
| --- | --- | --- |
| KEEP | bounded turn loop | Explicit `maxSteps`; bound exhaustion returns continuation. |
| KEEP | model -> tool -> observation -> model progression | Core iterative loop, including multiple tool steps. |
| KEEP | conditional tool availability | Tool predicate is evaluated per turn; disabled tools are not exposed and cannot execute. |
| KEEP | approval before protected tool side effect | Approval-required calls return `approval_required` before **any** tool execution; outer XState/business flow owns the decision. |
| KEEP | cancellation propagation | `AbortSignal` checked before model/tool side effects and passed to injected ports. |
| KEEP | failures remain observable | Model/provider and tool failures propagate unchanged. |
| KEEP | final-output validation | Invalid structured final results fail closed with `InvalidFinalOutputError`. |
| ADAPT | resumable RunState | Only Node-local transcript/step/journal continuation is retained; durable recovery remains DomainHarness-owned. |
| ADAPT | tool schema/definitions | Reduced to name/description plus injected capability functions. |
| ADAPT | model call | One provider-neutral injected generation port. |
| DROP | handoffs / agent switching | Removed from the mini kernel; multi-agent/workflow routing belongs outside it. |
| DROP | SDK session/memory persistence | DomainHarness durable runtime owns persistence. |
| DROP | tracing/span lifecycle and usage accounting | Orthogonal telemetry concern. |
| DROP | default provider registry, credentials and retry policy | AI Runtime owns them. |
| DROP | streaming API | Not required to establish the minimal kernel. |
| DROP | generic input/tool/output guardrail framework | Only minimal tool enablement, approval pause and final validation are retained. |
| DROP | sandbox, hosted tools, MCP, computer/shell/apply-patch specializations | Capabilities are injected; kernel gains no external authority. |

## Runnable spike

Files:

- `packages/domain-harness/tests/architecture-v03/agents-js-mini-runner/mini-agent-runner.ts`
- `packages/domain-harness/tests/architecture-v03/agents-js-mini-runner/mini-agent-runner.test.ts`

Measured runtime footprint after full #186 acceptance coverage:

- **300 LOC runtime code**
- **0 third-party runtime dependencies**
- target thresholds: `<= 400 LOC` and `<= 8 direct runtime dependencies` -> **PASS**

No production source, PRD, L2, public contract, provider, RuntimeStore, compiler or XState workflow semantics are changed.

## Executed evidence

Local executable environment: Node **22.16.0**.

- strict TypeScript compile of the runner using the repository-equivalent `NodeNext`, `strict`, `noUnused*`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` options: **PASS**;
- focused runtime scenarios using Node 22 TypeScript type stripping: **12/12 PASS**.

Scenarios:

1. prompt accumulation;
2. model -> tool -> model -> final;
3. multi-step tool loop;
4. conditionally disabled tool hidden + fail-closed if requested;
5. approval-required tool pauses before execution;
6. structured result + continuation propagation;
7. invalid structured final fail-closed;
8. cancellation before provider execution;
9. provider/model failure propagation;
10. tool failure propagation;
11. deterministic journal replay with zero repeated provider/tool side effects;
12. hard max-step termination with continuation.

Replay proof is intentionally narrow: given the same initial messages and recorded model/tool journal, replay returns the same structured result without provider/tool side effects. It is not a claim that model generation is deterministic and is not a replacement for DomainHarness durable effect authority.

## Complexity-leak check

Reject this extraction if it must own any of the following:

- XState workflow transitions or workflow persistence;
- durable effect/message authority or recovery policy;
- provider/model selection, credentials or retry policy;
- cross-node or multi-agent orchestration;
- SDK session/tracing/sandbox/MCP infrastructure.

The final spike owns none of them. Approval is deliberately a returned pause/decision boundary rather than hidden execution, and handoff support is deliberately absent.

## Architecture implication for later synthesis

This evidence supports a v0.3 option where an XState AI Node invokes a small bounded Agent Runner, the runner delegates generation to AI Runtime, and DomainHarness wraps the invocation with durable context/effect/recovery authority. It does **not** freeze that option. Parent #183 should compare this evidence with the other mini-kernel research artifacts before any PRD/L2 decision.
