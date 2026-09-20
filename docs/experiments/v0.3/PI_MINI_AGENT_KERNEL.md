# v0.3 Research — Pi Mini Agent Kernel Extraction

**Status:** RESEARCH EVIDENCE for Issue #184. This artifact does **not** freeze or modify the v0.3 PRD/L2.

## Source authority

- Source repository: `earendil-works/pi`
- Exact source commit: `d1230ea2000d876b479a69b8b061f9d670f262f5`
- Studied package: `packages/agent` (`@earendil-works/pi-agent-core` 0.86.0)
- Upstream license: MIT, Copyright (c) 2025 Mario Zechner
- Primary modules read at the pinned commit:
  - `packages/agent/src/agent-loop.ts`
  - `packages/agent/src/types.ts`
  - `packages/agent/src/stream-fn.ts`
  - `packages/agent/src/agent.ts` only to identify the higher session/product boundary
  - `packages/agent/test/agent-loop.test.ts` and relevant agent tests for behavioral evidence

The implementation in `packages/domain-harness/tests/architecture-v03/pi-mini-kernel.ts` is a clean-room reimplementation of observed behavioral principles. It does not import Pi, reuse Pi public API names, or copy Pi implementation text.

## Original architecture map

| Layer | Pi responsibility observed | Extraction decision |
| --- | --- | --- |
| Low-level loop | Repeated model turns, tool-call detection, tool execution, observations, turn/run lifecycle | KEEP the control-flow invariant |
| Loop contracts | Model/stream seam, tool contracts, transcript/context types, lifecycle events, abort signal | ADAPT to smaller DomainHarness Node contracts |
| Tool execution | Validate/prepare calls, execute tools, convert failures to model-visible results, preserve result ordering | KEEP failure-as-observation; ADAPT to deterministic sequential execution |
| Stateful `Agent` facade | Mutable transcript, queued steering/follow-ups, subscriptions, active run, reset/continue/session behavior | DROP from Node kernel |
| Provider/AI package | Provider context, streaming protocol, API keys/model details | DROP; AI Runtime owns provider/model routing |
| Coding-agent product | CLI/TUI, filesystem/bash/edit tools, coding workflows | DROP |
| Harness/session extensions | Generic longer-lived session and extension behavior | DROP unless separately justified by another v0.3 concern |

The important boundary is that Pi's small loop is separable from the larger stateful agent product. DomainHarness should take the loop invariants, not the session product identity.

## KEEP / ADAPT / DROP

| Behavior / mechanism | Decision | DomainHarness interpretation |
| --- | --- | --- |
| model → tool call → observation → next model step → final | KEEP | Core of one Workflow Node invocation |
| Ordered transcript of model decisions and tool observations | KEEP | `MiniTranscriptFact`; useful for testing/observability, not business durability authority |
| Tool failure becomes an observation rather than crashing the whole loop | KEEP | Lets the next model step recover or choose a different path |
| Model/request failure stops the run | KEEP | Terminal `model_error` for the Node invocation |
| One cancellation signal propagated through model/tool work | KEEP | Abort one Node invocation without owning workflow cancellation semantics |
| Explicit lifecycle events | ADAPT | Reduce Pi's streaming/message event surface to node/model/tool/run lifecycle facts |
| Termination hook / open-ended session continuation | ADAPT | Replace with deterministic `maxSteps` + structured final result |
| Parallel tool execution | DROP for the minimal kernel | Sequential order is smaller and deterministic; add concurrency only if later evidence requires it |
| Streaming partial assistant/tool updates | DROP for the minimal kernel | Not required for one Node execution contract; UI streaming is a higher concern |
| Steering/follow-up queues | DROP | App/session interaction concern, not iterative reasoning inside a Workflow Node |
| Dynamic provider/API-key/model state | DROP | AI Runtime owns provider/model routing |
| Tool loadout encoded into conversation/system messages | DROP | Tool availability is an explicit kernel input, not transcript authority |
| Persistent `Agent` state / reset / continue | DROP | DomainHarness durability/recovery owns cross-run state |
| Coding tools and coding-agent UI | DROP | Product-specific behavior |

## Extracted mini-kernel

The research implementation intentionally has a small shape:

```text
runMiniKernel
├── MiniModelPort
├── MiniTool[]
├── ordered MiniTranscriptFact[]
├── MiniRunEvent[]
├── AbortSignal
├── maxSteps
└── validateFinal
```

A **step** means one model decision. A model decision may request one or more tools; tools execute sequentially in source order and their observations are appended before the next model decision. `maxSteps` therefore bounds model turns directly and deterministically.

The kernel owns only ephemeral state for a single invocation: input, ordered transcript facts, lifecycle events, tool registry and current step. It owns no durable store, workflow state machine, provider catalog, long-term memory, cache or cross-run session.

## Executable scenarios

`pi-mini-kernel.test.ts` covers the Issue #184 acceptance set directly:

1. model → tool → model → valid final result;
2. multiple tool steps with ordered observations;
3. tool failure becomes an error observation and the model can recover;
4. model failure is terminal;
5. cancellation reaches an in-flight tool and terminates the run;
6. `maxSteps` prevents an unbounded tool/model loop;
7. invalid structured final result fails closed.

The tests use deterministic scripted model doubles and local tools. No provider/network behavior is asserted because provider/model routing is explicitly outside this kernel's authority.

## Measurements

Physical LOC at the pinned Pi commit:

- `packages/agent/src/agent-loop.ts`: **857 LOC**
- `packages/agent/src/types.ts`: **463 LOC**
- `packages/agent/src/stream-fn.ts`: **20 LOC**
- studied low-level loop/contracts/default-seam set: **1,340 LOC**

The higher `agent.ts` session facade is intentionally excluded from that low-level extraction size because this task identifies it as a higher layer rather than part of the target mini kernel.

Resulting clean-room artifact:

- `pi-mini-kernel.ts`: **228 LOC**
- direct runtime dependencies added by the mini kernel: **0**
- upstream `packages/agent` direct runtime dependencies at the pinned commit: **7**

The LOC comparison is architectural evidence, not a quality score. The reduction comes primarily from removing streaming/provider/session/queue/general-extension behavior that DomainHarness should not own.

## Invariants that should enter DomainHarness v0.3 evidence

1. A Node agent loop is a bounded sequence of model decisions separated by explicit tool observations.
2. Tool failures are ordinary, typed observations when the workflow can still reason about them; they should not silently disappear or crash unrelated workflow state.
3. Model-boundary failure is terminal for the current Node invocation unless a higher DomainHarness/AI Runtime policy explicitly retries it.
4. Cancellation uses one invocation-scoped signal propagated through active model/tool work.
5. A hard model-step limit is part of the kernel contract so a malformed or adversarial loop cannot run forever.
6. Final output must be structurally validated before the Node reports success.
7. Lifecycle facts should make model/tool boundaries observable and unit-testable without becoming a second durable workflow authority.

## Behaviors that should not enter DomainHarness from Pi by default

- generic persistent Agent/AgentSession behavior;
- steering/follow-up message queues;
- provider SDK/model/API-key routing;
- coding-agent CLI/TUI and filesystem/bash/edit tools;
- long-term memory;
- dynamic workflow/state-machine responsibility;
- implicit durability or replay authority inside the loop;
- parallel tool execution as a mandatory baseline feature;
- Pi package/API/class/function naming.

## DomainHarness ownership boundary

| Responsibility | Owner |
| --- | --- |
| Domain workflow state/transitions/invocation | XState |
| Context selection, durable journal/recovery, cache policy | DomainHarness |
| Provider/model selection and routing | AI Runtime |
| Iterative model/tool reasoning inside one invoked Workflow Node | Mini Node Harness Kernel |

This preserves the #175 evidence boundary: XState remains workflow-control authority and DomainHarness durability remains replay authority. The mini kernel is an invoked computation inside that boundary, not a replacement runtime or a second state machine.

## Provenance / license note

The study is based on behavior observed in MIT-licensed `earendil-works/pi` at the exact commit above. The mini-kernel code was independently written for DomainHarness and does not materially copy upstream source text, so no copied upstream source block is embedded here. This provenance record is retained so that any future implementation that *does* materially adapt upstream code can carry the required MIT copyright and permission notice.

## Research conclusion

Pi supports the hypothesis that the useful Node-level agent primitive can remain much smaller than a general Agent product. For DomainHarness, the useful intersection is a bounded, cancellable model/tool loop with ordered observations, explicit lifecycle facts and fail-closed structured output. Session management, workflow authority, durability/recovery and provider routing should remain outside that kernel.
