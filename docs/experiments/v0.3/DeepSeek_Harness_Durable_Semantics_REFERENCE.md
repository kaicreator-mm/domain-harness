# DomainHarness v0.3 Reference — DeepSeek Harness Durable Agent Semantics

Status: **Architecture Evidence / Research Reference**  
Upstream source: `deepseek-ai/deepseek-harness`  
Pinned upstream commit: `ddefc45fbc7f8e46dd73185e68295696d1297887`  
Prior extraction: `research_dsh_mini_kernel@ac8559f9d3e59c98e65ed0ba9cdaa166f8b66bf8` / Issue #185  
This follow-up: Issue #209  

> This document is a fixed v0.3 research reference. It does **not** modify or reopen the Frozen PRD or Frozen Architecture Baseline. L2 work may cite these findings without inheriting DeepSeek Harness product scope.

## 1. Question

DomainHarness v0.3 needs AI-capable Workflow Nodes without turning the SDK into a generic Agent platform. The remaining architecture risk is not the basic model→tool→observation loop; #185 already extracted that successfully. The open question is what durability semantics are required when a Node run can be interrupted between model requests, tool dispatch, tool results, and the next reasoning step.

The research therefore asks:

1. which facts must be durable before external work is dispatched;
2. which facts are merely ephemeral execution detail;
3. how crash recovery distinguishes safe retry from ambiguous mutation;
4. how deterministic context/tool assembly supports stable replay/cache identity;
5. how these ideas map onto existing DomainHarness / XState / AI Runtime ownership.

## 2. Upstream observations

### 2.1 Event-sourced session facts

DeepSeek Harness models a Session as an append-only typed `SessionEvent` log and treats it as the interaction source of truth. Model-visible message history is derived from the log rather than stored as a second authority.

Relevant upstream reference:

- `docs/subsystems/session.md`
- `packages/core/session/**`

Useful design essence:

- durable facts are explicit and ordered;
- projections/history are derived views;
- request/tool identities are recorded as facts;
- replay reconstructs from durable facts rather than hidden in-memory state.

DomainHarness adaptation:

- **do not** introduce a generic Agent Session as application authority;
- keep XState Workflow state plus DomainHarness durable journals as application authority;
- one Node Harness run may emit ordered run facts/transcript for debugging/recovery, but these facts do not own Domain Workflow transitions.

### 2.2 Checkpoint policy

At the pinned commit, `dsh-session-checkpoint-policy` defines three durability barriers:

1. flush the model request before constructing/dispatching the model stream;
2. flush a top-level tool call before entering a tool body that may cause an external effect;
3. flush the preceding step's committed response/results before deriving the next request.

Checkpoint failure is fail-closed: downstream model/tool work does not start.

Relevant upstream reference:

- `packages/session/session-checkpoint-policy/README.md`

This is the strongest reusable durability principle found in the DeepSeek Harness study.

### 2.3 Unknown outcome instead of blind mutation retry

The checkpoint policy explicitly states that a durable tool call with no durable result after a crash cannot prove whether the external effect completed. Recovery therefore produces an **unknown outcome** instead of automatically retrying the call.

It also states that durable intent is not equivalent to exactly-once external effects. Provider-side idempotency should be used where available.

DomainHarness adaptation:

- preserve the existing v0.2 principle that ambiguous non-idempotent effects must not be silently retried;
- AI/Node recovery must distinguish:
  - read-only / explicitly idempotent operations: retry may be permitted by policy;
  - mutation with unknown result: surface `unknown/ambiguous` recovery state;
- XState must not infer success from the absence of a result.

### 2.4 Deterministic prompt and tool assembly

DeepSeek Harness canonicalizes prompt sections and tool schemas instead of inheriting plugin registration order. Prompt sections are ordered by numeric order and then name; tool order is explicitly canonicalized. Invalid prompt combinations and unresolved variables fail assembly rather than producing a malformed request.

Relevant upstream reference:

- `packages/core/system-prompt/README.md`

DomainHarness adaptation:

- Node Context Resolver must produce a canonical model-facing request surface;
- stable ordering is required before computing Node Invocation / semantic-cache identity;
- registration/load order must not change cache identity or request meaning.

### 2.5 Ephemeral streaming frames are not durable authority

DeepSeek Harness distinguishes live streaming publication from durable settled session facts. The checkpoint package also notes that unfinished Assistant streams remain transient.

DomainHarness adaptation:

- token/delta streaming may be surfaced to UI/telemetry;
- partial stream frames must not become Workflow or recovery authority;
- a durable settled AI result / attempt fact is what recovery may rely upon.

## 3. Executable spike

Research test:

`packages/domain-harness/tests/research/deepseek-harness-durable-semantics.test.ts`

The spike is deliberately independent from DeepSeek Harness packages and production DomainHarness Runtime code. It implements only the minimum semantics required to test the architecture claims.

### Scenarios

| ID | Scenario | Required evidence |
|---|---|---|
| D1 | Canonical assembly | same sections/tools in different registration order produce identical prompt/tool surface |
| D2 | Model checkpoint fail-closed | failed request checkpoint => model adapter call count remains 0 |
| D3 | Tool pre-dispatch checkpoint | side-effecting tool body observes its `tool.call` already durable |
| D4 | Tool checkpoint fail-closed | failed checkpoint => tool body call count remains 0 |
| D5 | Crash after mutation dispatch | durable call + missing result => `unknown-outcome`; mutation is not rerun |
| D6 | Read-only interrupted call | recovery may explicitly classify retry as permitted |
| D7 | Step-boundary checkpoint | prior tool result/final fact is durable before next request derivation |
| D8 | Cancellation during checkpoint | abort while flush pending => tool body never runs; aborted result is recorded |
| D9 | Streaming frames | live deltas remain outside durable fact authority |

The spike intentionally does **not** claim exactly-once external effects. It verifies the more realistic boundary: durable dispatch intent + explicit result + fail-closed ambiguity handling.

## 4. ADOPT / ADAPT / DO NOT COPY

### ADOPT

1. **Durability barriers before irreversible boundaries**
   - before model dispatch;
   - before side-effecting tool dispatch;
   - before deriving a subsequent reasoning step from prior results.

2. **Fail-closed checkpoint behavior**
   - if durability cannot be established, do not dispatch new external work.

3. **Unknown-outcome recovery for ambiguous mutation**
   - never equate missing result with safe retry.

4. **Canonical model request assembly**
   - deterministic prompt/tool surface is required for reproducibility and semantic cache keys.

5. **Ordered run facts**
   - useful for recovery evidence, audit and deterministic reconstruction.

### ADAPT

1. **Session event log**
   - DeepSeek: Session is agent interaction authority.
   - DomainHarness: adapt to bounded Node-run facts and existing durable journals; do not create a second application authority beside XState/RuntimeStore.

2. **Tool checkpoint policy**
   - DeepSeek: generic tool runtime.
   - DomainHarness: mutation must remain under DomainHarness durable effect authority; Node Harness tools should normally be read/query tools. If an AI Node can request a mutation, it should emit a proposal/event and let the Workflow/effect layer execute it.

3. **Request reconstruction**
   - DeepSeek stores request header/session facts.
   - DomainHarness should record only behaviorally relevant Node Invocation identity and durable AI operation/result facts needed for replay/cache/recovery.

4. **Cancellation**
   - preserve abort-before-dispatch semantics;
   - lifecycle authority remains DomainHarness/XState, not an independent long-lived Agent object.

### DO NOT COPY

Do not import the following DeepSeek Harness product scope into DomainHarness v0.3:

- generic persistent Agent Session as app authority;
- provider/model routing;
- plugin marketplace/composition platform;
- generic memory/RAG;
- scheduler/jobs;
- sandbox/coding environment;
- subagent orchestration;
- CLI/UI/server product surfaces;
- generic Agent lifecycle replacing Workflow lifecycle;
- hidden chain-of-thought persistence.

## 5. DomainHarness v0.3 boundary after this research

```text
XState
  owns: Domain Workflow state / event / guard / transition

DomainHarness Runtime
  owns: durable message / effect / AI-operation result / recovery / semantic-cache authority

DomainHarness Context Resolver
  owns: canonical node input + selected knowledge/rules/skills/history/tool surface

Node Harness Kernel
  owns: bounded model -> tool -> observation loop, cancellation, step limits, ephemeral run facts

AI Runtime
  owns: model/provider routing, execution policy, provider retry/fallback
```

No layer above may bypass XState transition authority, and Node Harness execution must not become an independent Workflow Runtime.

## 6. Implications for v0.3 L2

### 6.1 Snapshot persistence (#201)

The XState snapshot and AI/tool durable facts have different meanings and must not be collapsed into one opaque snapshot.

Required ordering principle:

```text
record durable invocation/dispatch fact
        -> durability barrier
        -> external model/tool dispatch
        -> durable settled result
        -> Workflow consumes result / advances
```

Crash windows must be specified explicitly:

- crash before dispatch checkpoint: external work did not start;
- crash after durable dispatch fact but before result: outcome may be unknown;
- crash after durable result but before Workflow transition: replay settled result without repeating external work.

This complements the XState persistence spike (#175/#176): restoring an Actor may re-enter an invoke; DomainHarness durable facts decide whether external work is repeated, replayed, or marked ambiguous.

### 6.2 AI Node semantic cache

Semantic cache is distinct from recovery replay.

Before cache lookup, Context Resolver must canonicalize behaviorally relevant inputs. Cache identity should be based on the resolved Node Invocation, not registration order or transient stream frames.

At minimum, behaviorally relevant identity includes:

- Domain package / Workflow / Node identity;
- selected node input/process data;
- relevant rule/knowledge/skill versions or digests;
- canonical visible tool surface;
- structured output contract;
- execution-policy version where policy changes may alter behavior.

A cache hit returns a prior settled result; it must never imply that a business mutation has already been executed.

### 6.3 Node Harness Kernel

The kernel should remain small. This research does **not** justify importing DeepSeek Harness as a runtime dependency. The reusable design is the durability protocol around an already-minimal Node loop.

## 7. Reference rules for future work

Future v0.3 architecture/tasks may cite this document for the following principles:

- checkpoint before external dispatch;
- fail closed when durability barrier fails;
- unknown outcome for ambiguous non-idempotent execution;
- canonical context/tool assembly;
- settled result is durable authority, partial stream is not;
- Agent/Node run facts do not replace Domain Workflow state.

If a future design contradicts one of these principles, the contradiction should be explicit in L2 evidence rather than silently drifting.

## 8. Provenance

Research source is DeepSeek Harness at the exact pinned commit above. This DomainHarness spike is an independent research implementation and does not depend on DeepSeek Harness packages. The purpose is to preserve validated design invariants, not source package structure or product vocabulary.

Upstream materials inspected include:

- `docs/subsystems/core.md`
- `docs/subsystems/session.md`
- `packages/core/system-prompt/README.md`
- `packages/session/session-checkpoint-policy/README.md`

DeepSeek Harness is MIT licensed at the pinned source. Any future direct source copying must preserve applicable license/attribution; this research reference and spike are intended as clean-room behavioral evidence.
