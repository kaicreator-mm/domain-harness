# v0.3 Architecture Research — bounded mini Agent Runner from openai-agents-js

**Issue:** #186  
**Status:** RESEARCH EVIDENCE / SPIKE — not a PRD or L2 freeze.  
**DomainHarness baseline:** `main` @ `fa3e7f13e67a65a9fbd714d1518db920cb717144`.  
**Upstream:** `openai/openai-agents-js` @ `b11eaba663b22fff2541457e1be508a0bf3eb344`.  
**Provenance:** independent reimplementation of observed control-flow ideas; no upstream source is vendored or copied. Upstream package is MIT licensed.

## Decision

**Recommendation: ADAPT.** The useful design essence is a bounded `generation -> tool execution -> generation` loop with explicit continuation and failure/cancellation propagation. That essence fits in a node-local runner without importing the upstream SDK's orchestration, provider, tracing, session, sandbox, or policy surface.

The spike is deliberately **not** a replacement for workflow orchestration. XState remains workflow owner; DomainHarness remains durable shell/context owner; AI Runtime remains provider routing/adapter owner. A handoff emitted by the runner is data returned to the caller, not an in-runner workflow transition.

## Upstream source inventory / footprint

Pinned-source measurements were taken from the exact commit above, not from upstream HEAD.

| Upstream surface | Measured footprint / dependency observation | Why it matters |
| --- | ---: | --- |
| `packages/agents-core/src/run.ts` | **3,809 source lines** | Primary Runner surface already combines model invocation, sessions, tracing, guardrails, retries, streaming, sandbox, handoff and persistence concerns. |
| `packages/agents-core/src/runState.ts` | **>5,000 source lines** (line 5,000 is populated at the pinned commit) | General resumability/state machinery is far larger than the node-local state required here. |
| `packages/agents-core/src/runner/runLoop.ts` | separate helper module | Confirms turn-resolution/interruption logic has already been split from the main Runner, but remains coupled to RunState and SDK semantics. |
| `@openai/agents-core` required runtime deps | **3**: `@standard-schema/spec`, `debug`, `openai` | Direct adoption would pull provider/schema/logging policy into the node runner. |
| optional runtime integration | `@modelcontextprotocol/client` | MCP is not a node-runner primitive for DomainHarness. |
| optional peer | `zod` | DomainHarness already owns schema/contract boundaries; the spike does not need a schema library. |

The two main upstream state/orchestration files alone are therefore **>8,809 lines**, before the supporting `runner/*`, model, tool, result, handoff, tracing, memory and sandbox modules are counted. This is evidence against direct adoption, not a criticism of the upstream SDK: it solves a substantially broader problem.

## KEEP / ADAPT / DROP

| Classification | Upstream idea | Spike treatment / DomainHarness boundary |
| --- | --- | --- |
| KEEP | bounded turn loop | Explicit `maxSteps` hard bound; reaching it returns continuation rather than silently escaping the bound. |
| KEEP | model -> tool call(s) -> model progression | Preserved as the core loop, including multiple tool turns. |
| KEEP | cancellation signal propagation | `AbortSignal` checked before each model/tool side effect and passed to both ports. |
| KEEP | failures remain observable | Provider/auth errors are not swallowed or translated into success. |
| KEEP | resumable structured run state | Result carries ordered messages, next step and journal as continuation state. |
| ADAPT | Agent/Runner prompt state | Reduced to ordered system + reusable developer + user messages; no Agent object graph. |
| ADAPT | tool definitions / tool outputs | Reduced to named async tools plus structured input/output. No hosted/computer/shell/MCP specialization. |
| ADAPT | handoff | Becomes terminal node-local data `{ target, payload }`; XState/caller decides any workflow transition. |
| ADAPT | RunState replay/resume | Reduced to an append-only model/tool journal. Replay consumes recorded events without provider/tool side effects and validates tool identity/input. Durable storage remains outside the runner. |
| ADAPT | provider model call | A single injected `generate(request)` port. Provider selection, model policy, credentials and retries belong to AI Runtime. |
| DROP | multi-agent orchestration / agent switching | Workflow orchestration is explicitly out of scope and remains with XState. |
| DROP | SDK session/memory persistence | DomainHarness durable shell/context owns persistence. |
| DROP | tracing/span lifecycle and usage accounting | Orthogonal telemetry concern; not required for correct node execution. |
| DROP | provider registry/default-provider logic/retry policy | AI Runtime owns provider routing and adapter behavior. |
| DROP | streaming API | Not needed to prove the bounded node kernel. Can be evaluated separately if product evidence later requires it. |
| DROP | generic input/output/tool guardrail framework | DomainHarness contract validation and workflow policy stay outside this mini runner. |
| DROP | sandbox, MCP, computer/shell/apply-patch specializations | Tool implementations are injected capabilities; the kernel does not acquire new authority. |

## Runnable spike

Files:

- `packages/domain-harness/tests/architecture-v03/agents-js-mini-runner/mini-agent-runner.ts`
- `packages/domain-harness/tests/architecture-v03/agents-js-mini-runner/mini-agent-runner.test.ts`

Measured spike runtime footprint:

- **230 LOC runtime code** (`wc -l mini-agent-runner.ts`)
- **0 third-party runtime dependencies**
- target thresholds: `<= 400 LOC` and `<= 8 direct runtime dependencies` -> **PASS**

The runtime exposes only:

1. ordered prompt/messages;
2. injected generation port;
3. injected named tools;
4. bounded loop;
5. structured result / continuation;
6. cancellation/failure propagation;
7. deterministic replay journal;
8. data-only handoff.

No production source, PRD, L2, public contract, live-event, provider or RuntimeStore semantics are changed by this spike.

## Executed tests

Standalone strict TypeScript compile of the runtime: **PASS**.

Executable spike tests: **9/9 PASS**:

1. prompt accumulation;
2. one tool call;
3. multi-step tool loop;
4. structured result + continuation propagation;
5. cancellation before provider execution;
6. provider/auth failure propagated unchanged;
7. deterministic replay with zero repeated provider/tool side effects;
8. handoff returned as node-local data only;
9. hard max-step bound returns continuation.

Replay proof is intentionally narrow: given the same initial messages and recorded model/tool journal, replay returns the same structured result and does not invoke provider or tool code. This is a deterministic execution characteristic, **not** a claim that model generation itself is deterministic and **not** a replacement for DomainHarness durable effect authority.

## Complexity-leak check

Reject the extraction if the mini runner must own any of the following to be useful:

- XState workflow transitions or workflow persistence;
- DomainHarness durable context/effect authority;
- provider/model selection, credentials, retry policy or auth recovery;
- cross-node or multi-agent orchestration;
- SDK session/tracing/sandbox/MCP infrastructure.

The current spike owns none of them. Its only state is the current node-local transcript/continuation and replay journal supplied to or returned by its caller. Therefore the bounded extraction passes the issue's complexity-leak criterion.

## Architecture implication for later synthesis

This evidence supports a v0.3 architecture option where one XState AI node invokes a small Agent Runner, the runner delegates every generation to AI Runtime, and DomainHarness wraps the invocation with its durable/replay authority. It does **not** freeze that option. Parent #183 / synthesis work should compare this evidence with the Vercel AI and Goose reductions before any PRD-L2 architecture decision.
