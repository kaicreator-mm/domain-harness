# DomainHarness v0.3 Reference — Pi Durable Agent Semantics

Status: **Architecture Evidence / Persistent Research Reference**  
Upstream source: `earendil-works/pi`  
Pinned upstream commit for the initial reference: `d1230ea2000d876b479a69b8b061f9d670f262f5`  
Prior extraction: `research_pi_mini_kernel@cdb7ac0c6fc8aab0f129b3d90fb937386ecd792d` / Issue #184  
Persistent research branch: `research_pi`  

> This document is the durable reference entry for continuing Pi research relevant to DomainHarness v0.3 and later versions. It does **not** modify or reopen any Frozen PRD or Architecture Baseline. Future Pi findings may extend this document or add sibling references on `research_pi`, but production adoption still requires normal Product/Architecture evidence and task flow.

## 1. Question

Issue #184 already proved that the useful Pi agent-loop behavior can be reduced to a small dependency-free mini kernel. Issue #187 then demonstrated that those loop invariants can be expressed as a reusable XState `HarnessMachine` child actor rather than a second Agent Runtime.

The remaining research question is therefore not whether DomainHarness should embed Pi. It should not.

The useful question is:

1. which Pi runtime semantics represent hard-earned production invariants that a minimal DomainHarness HarnessMachine must not accidentally remove;
2. which Pi session/durability ideas should map onto existing DomainHarness journals and XState ownership rather than be copied as an AgentSession product;
3. which boundaries matter for safe model/tool replay, cancellation, context reduction and crash recovery;
4. which Pi semantics should remain research references only until a concrete DomainHarness requirement justifies them.

## 2. Upstream observations

### 2.1 Low-level Agent Loop is ephemeral; Session is a higher durability layer

At the pinned source, `packages/agent/src/agent-loop.ts` owns one active reasoning run:

```text
assistant/model turn
  -> zero or more tool calls
  -> tool results/observations
  -> next assistant/model turn
  -> ...
  -> stop
```

The loop maintains an in-memory `AgentContext` and emits lifecycle events. The higher `coding-agent` `AgentSession` subscribes to those events and integrates persistence, retry, compaction, queueing and session management.

Relevant upstream references:

- `packages/agent/src/agent-loop.ts`
- `packages/agent/src/types.ts`
- `packages/coding-agent/src/core/agent-session.ts`

Useful design essence:

- the reasoning loop does not need to own application durability;
- durable/session concerns can wrap a smaller loop;
- one active run and the persisted application/session record are different concepts.

DomainHarness adaptation:

- `HarnessMachine` owns only one bounded Node reasoning invocation;
- XState Domain Machine remains Workflow authority;
- DomainHarness durable journals remain replay/recovery authority;
- do not introduce Pi-style persistent `AgentSession` as a second application runtime.

### 2.2 A turn is a model response plus the complete tool batch

Pi does not treat the model response alone as a completed reasoning turn. A turn completes only after tool calls from that response have been prepared/executed and their tool-result messages have been appended. `turn_end` is emitted after that barrier.

Relevant upstream reference:

- `packages/agent/src/agent-loop.ts`

This matters because a durable or resumable reasoning system must not report a settled step while some of the model-proposed tool work is still outstanding.

DomainHarness adaptation:

```text
model response
  -> classify response
  -> resolve/validate all proposed tool calls
  -> execute permitted query/tool work
  -> materialize ordered observations
  -> turn barrier reached
  -> next model step may be derived
```

The existing #187 research spike intentionally simplified this to one tool call per model response. That is acceptable research evidence, but production contracts should not freeze single-tool response as a permanent limitation without an explicit reason.

### 2.3 Tool execution has a preflight boundary before the executor body

Pi separates tool handling into stages rather than invoking a tool directly from raw model output:

```text
resolve tool
  -> prepare arguments
  -> schema validation
  -> before-tool policy hook
  -> execute
  -> after-tool normalization
  -> emit observation/result
```

Unknown tools, invalid arguments and policy-blocked calls are converted to explicit error results rather than entering an arbitrary executor.

Relevant upstream references:

- `packages/agent/src/agent-loop.ts`
- `packages/agent/src/types.ts`

DomainHarness adaptation:

- preserve a preflight seam;
- do not copy Pi's generic hook framework;
- production HarnessMachine should conceptually perform:

```text
resolve
  -> schema validate
  -> capability/policy check
  -> durable/replay classification where relevant
  -> execute
  -> normalize observation
```

For mutation-capable business effects, HarnessMachine should still refuse direct execution and return a structured proposal/event to the parent Workflow/effect authority.

### 2.4 Tool replay safety is explicit metadata, not inferred from the tool name

Pi's `AgentTool` contract at the pinned commit includes:

```ts
replay?: "never" | "safe"
```

This is an important durable-execution insight: even a tool that looks like a query/read operation may not be safe to re-run after an ambiguous crash unless the tool contract says so.

Relevant upstream reference:

- `packages/agent/src/types.ts`

DomainHarness adaptation:

- preserve explicit replay/idempotency metadata on Tool/effect capability definitions;
- DomainHarness durable runtime, not HarnessMachine, decides whether interrupted external work can be re-executed;
- `query` and `replay-safe` are related but not identical concepts;
- ambiguous `replay: never` work must surface recovery/unknown outcome rather than be silently re-run.

This complements the DeepSeek Harness checkpoint/unknown-outcome evidence without requiring the two projects to share implementation vocabulary.

### 2.5 Truncated model output is unsafe tool authority

Pi has a notable fail-safe for model responses terminated by output-length limits. When a response is truncated, Pi refuses to execute tool calls from that response because a tool-call argument payload may be syntactically parseable and even schema-valid while semantically incomplete due to truncation.

Relevant upstream reference:

- `packages/agent/src/agent-loop.ts`

Design essence:

> successful JSON parsing/schema validation is not sufficient evidence that a model-generated tool invocation is complete.

DomainHarness adaptation:

- `ModelPort` / AI Runtime must expose typed completion status, not only a parsed payload;
- `incomplete` / length-truncated model outputs must not authorize Tool execution;
- tool proposals from incomplete responses should become a model/runtime failure or recoverable observation according to explicit policy, but never execute blindly.

A production model outcome taxonomy should distinguish at least:

```text
final
tool_calls
aborted
provider_error
incomplete
invalid_response
```

### 2.6 Sequential versus parallel tool execution is a policy with ordering semantics

Pi supports sequential and parallel tool batches. Even in parallel mode, preparation occurs in a controlled sequence and the system distinguishes execution-completion order from the model-visible order of tool-result message artifacts.

Relevant upstream references:

- `packages/agent/src/agent-loop.ts`
- `packages/agent/src/types.ts`

DomainHarness adaptation:

- v0.3 does not need mandatory parallel Tool execution;
- deterministic sequential execution is a valid minimal baseline;
- if parallel query tools are later added, production contracts must separately define:
  - dispatch order;
  - completion order;
  - observation order visible to the next model request;
  - cancellation semantics;
  - durable identity for each call.

Do not let wall-clock completion order accidentally change semantic cache/replay identity.

### 2.7 Model/runtime termination is typed and distinct from ordinary tool failure

Pi's low-level stream contract distinguishes model outcomes such as normal completion, error and aborted status. Tool exceptions, by contrast, can be normalized into model-visible error observations so the next reasoning step can recover.

Relevant upstream references:

- `packages/agent/src/types.ts`
- `packages/agent/src/agent-loop.ts`

DomainHarness adaptation:

- ordinary recoverable query-tool error may become an observation;
- model/provider failure fails the current Harness invocation unless AI Runtime policy handles retry/fallback;
- cancellation must remain distinguishable from provider error;
- invalid final structured result must fail closed;
- do not collapse all failures into generic exceptions because durable recovery needs typed outcomes.

### 2.8 Low-level `agent_end` and fully settled session state are different barriers

At the pinned commit, the higher coding-agent `AgentSession` adds an `agent_settled` event in addition to the low-level `agent_end`. The session layer can still perform automatic retry, compaction or queued continuation after a low-level run has ended.

Relevant upstream reference:

- `packages/coding-agent/src/core/agent-session.ts`

Useful design essence:

> completion of an inner reasoning run is not automatically equivalent to completion of the enclosing application/session policy.

DomainHarness adaptation:

- HarnessMachine final means the bounded Node reasoning invocation has completed;
- Workflow settlement remains owned by the parent XState Domain Machine;
- AI Runtime retry/fallback policy may finish before HarnessMachine sees a ModelPort result;
- DomainHarness durable commit may be required before a result is considered replay-authoritative;
- do not add a generic `agent_settled` subsystem unless a concrete DomainHarness lifecycle requires it.

### 2.9 Session storage is append-oriented tree history, while LLM context is reconstructed

Pi persists sessions as JSONL entries with `id` / `parentId` tree structure. Entries include messages, model/thinking changes, compactions, branch summaries, usage and custom entries. Session context is rebuilt from durable entries rather than treating one mutable prompt array as the durable source of truth.

Relevant upstream references:

- `packages/coding-agent/src/core/session-manager.ts`
- `packages/coding-agent/docs/sessions.md`

Useful design essence:

- durable facts/history and model-visible context are different layers;
- model context can be reconstructed as a projection;
- branching/compaction need not destructively rewrite historical facts.

DomainHarness adaptation:

- do not copy Pi's generic conversation/session tree as Domain Workflow authority;
- preserve DomainHarness message/effect/AI-operation journals as durable facts;
- Context Resolver may project selected durable/business facts into a bounded Node context;
- model-visible transcript is not automatically recovery authority.

### 2.10 Compaction is context reduction, not replacement of durable history

Pi compaction summarizes older context and appends a `CompactionEntry` carrying summary, kept-boundary identity, token information and, at the pinned commit, a complete system/tool state checkpoint for the compaction boundary. The underlying session history remains the source from which context is reconstructed.

Relevant upstream references:

- `packages/coding-agent/docs/compaction.md`
- `packages/coding-agent/src/core/session-manager.ts`

DomainHarness adaptation:

- generic coding-agent compaction is **not** a v0.3 HarnessMachine requirement;
- if long-running Node reasoning later requires context reduction, it should be an explicit Context Resolver / Node-run mechanism with stable identity and provenance;
- a compacted summary must not silently replace behaviorally relevant Domain facts for semantic-cache identity;
- context reduction should happen only at a safe turn boundary after prior tool observations are settled.

## 3. Current executable evidence already available

Pi research does not need a second clone to establish the basic loop shape.

Existing DomainHarness evidence:

- Issue #184 / `research_pi_mini_kernel`
  - clean-room mini kernel;
  - 228 LOC;
  - zero new runtime dependencies;
  - model -> tool -> observation -> model -> final;
  - tool failure observation;
  - cancellation;
  - max steps;
  - structured final validation.

- Issue #187 / `research_harness_machine`
  - one XState Actor System;
  - reusable HarnessMachine child actor;
  - no second Agent Runtime;
  - ModelPort seam;
  - query-only tool boundary;
  - cancellation and max-step fail-closed;
  - structured DomainDecision returned to parent;
  - parent XState guard/transition remains business authority.

This reference adds production-semantics constraints around those successful spikes rather than replacing them.

## 4. ADOPT / ADAPT / DO NOT COPY

### ADOPT

1. **Turn barrier**
   - a model turn is not complete until its allowed tool batch has settled into observations.

2. **Tool preflight before execution**
   - resolve -> validate -> capability/policy check -> execute.

3. **Typed model termination**
   - distinguish normal final/tool proposal from aborted/provider-error/incomplete/invalid outcomes.

4. **Truncation fail-safe**
   - never execute tool calls sourced from an incomplete/truncated model response.

5. **Explicit tool replay metadata**
   - recovery safety must be declared, not guessed.

6. **Durable facts versus model-visible context separation**
   - model context is a projection; it is not automatically durable authority.

7. **Context reduction only at safe boundaries**
   - do not compact across unresolved tool work.

### ADAPT

1. **Multiple tool calls per model turn**
   - Pi supports batches and parallelism;
   - DomainHarness production should support a batch-shaped response contract, while sequential execution is sufficient as the initial deterministic policy.

2. **Session tree**
   - Pi uses a persistent Agent Session tree;
   - DomainHarness should adapt only the fact/projection separation and keep Workflow/journal ownership in existing runtime layers.

3. **`agent_end` / `agent_settled` distinction**
   - preserve the concept of inner-run completion versus enclosing runtime settlement;
   - map it onto HarnessMachine final, AI Runtime execution completion, durable commit and parent Workflow progression rather than creating a Pi session lifecycle.

4. **Compaction**
   - preserve bounded-context and explicit-boundary principles;
   - do not adopt generic session compaction until Node reasoning duration makes it necessary.

5. **Parallel tool execution**
   - keep as future evidence; require explicit ordering/durability contracts before adoption.

### DO NOT COPY

Do not import the following Pi product scope into DomainHarness v0.3:

- coding-agent CLI/TUI;
- bash/edit/filesystem coding tools;
- generic persistent AgentSession as application authority;
- steering/follow-up queues;
- generic session branching UX;
- provider/API-key/model registry;
- coding-specific compaction prompts/file tracking;
- extension/plugin product surface;
- mandatory tool parallelism;
- hidden chain-of-thought persistence;
- workflow/state-machine responsibility outside XState.

## 5. DomainHarness v0.3 boundary after this research

```text
XState Domain Machine
  owns:
    business state / legal events / guards / transitions / parent-child lifecycle

HarnessMachine (XState child)
  owns:
    one bounded reasoning invocation
    typed model outcome handling
    query-tool preflight/execution
    ordered observations
    hard step/turn limits

DomainHarness Context Resolver
  owns:
    selected/canonicalized Domain Data
    behaviorally relevant context projection
    stable model-facing tool/context surface

DomainHarness durable runtime
  owns:
    message/effect/AI-operation identity
    dispatch/result journals
    replay/recovery authority
    tool replay-safety enforcement
    semantic-cache authority

AI Runtime / ModelPort
  owns:
    provider/model execution
    provider retry/fallback
    typed completion metadata
    explicit incomplete/aborted/error result semantics
```

HarnessMachine must not become an independent persistent Agent Runtime.

## 6. Implications for v0.3 L2 / production contracts

### 6.1 Production `ModelResponse` should be batch-capable

Do not freeze the #187 single-tool research response shape as the permanent production contract.

Preferred conceptual shape:

```text
ModelOutcome =
  | final(structuredResult)
  | tool_calls(call[])
  | aborted
  | provider_error
  | incomplete
  | invalid_response
```

Initial execution policy may remain sequential for determinism.

### 6.2 Tool preflight is a first-class safety boundary

Before any Node-visible Tool executes:

```text
resolve identity
  -> schema validate
  -> capability allowlist/policy
  -> replay/idempotency classification
  -> durable dispatch policy if external
  -> execute
  -> normalized observation/result
```

Mutation-capable business effects remain outside HarnessMachine.

### 6.3 Durable replay must not be inferred from `query`

A Tool/effect contract should carry explicit recovery metadata. Naming a Tool `query` is insufficient evidence for blind replay after a crash.

A production design should distinguish concepts such as:

```text
replay-safe / idempotent
replay-never / ambiguous
```

and let DomainHarness durable runtime apply the recovery policy.

### 6.4 Incomplete model output must fail before Tool execution

AI Runtime / ModelPort must preserve provider completion metadata. Structured parser success cannot erase a provider-level incomplete/length-truncated status.

This is a required safety invariant for any model-generated Tool proposal.

### 6.5 Context compaction must preserve identity semantics

If context reduction is introduced later:

- reduction happens only at a settled turn boundary;
- provenance and source-range identity must be retained;
- behaviorally relevant Domain facts must remain identifiable for Node Invocation / semantic cache invalidation;
- summary text alone must not become the only cache/recovery identity.

### 6.6 Harness completion is not Workflow completion

HarnessMachine final only provides a Node reasoning result. Parent XState must still validate the proposed Domain event/result, evaluate guards, and perform the legal business transition. Durable runtime may also need to commit the settled AI result before replay authority is established.

## 7. Persistent `research_pi` rules

`research_pi` exists as a long-lived architecture-research branch for Pi. It should not become a shadow product branch.

Future Pi research on this branch should follow these rules:

1. pin every studied upstream Pi commit;
2. separate **upstream observation** from **DomainHarness recommendation**;
3. prefer design invariants and executable behavioral evidence over copying source structure;
4. do not merge Pi product dependencies into DomainHarness core merely for research convenience;
5. use sibling `*_REFERENCE.md` documents for substantial new topics instead of endlessly growing one file;
6. record whether a finding is:
   - already proven by DomainHarness executable research;
   - upstream-only evidence;
   - future hypothesis needing a spike;
7. production adoption still goes through v0.3 PRD/L2/Task evidence and must not be inferred from presence on `research_pi`;
8. periodically refresh against newer Pi commits and explicitly record semantic changes rather than silently updating the pinned source.

Suggested future Pi research topics, only when relevant to an actual DomainHarness question:

- tool batch ordering and bounded parallel query execution;
- replay/idempotency metadata evolution;
- context-window reduction/checkpoint identity;
- cancellation and shutdown settlement races;
- model incomplete/abort/error taxonomy;
- session reconstruction patterns that may improve observability without creating a second authority.

Do not spend research effort on Pi UI, editor, coding-agent ergonomics or product integrations unless a DomainHarness requirement directly depends on them.

## 8. Reference rules for future work

Future DomainHarness architecture/tasks may cite this document for the following principles:

- a model turn settles only after its permitted tool batch settles;
- Tool execution requires a preflight boundary;
- replay safety is explicit contract metadata, not an assumption;
- truncated/incomplete model output cannot authorize Tool execution;
- low-level reasoning completion is different from enclosing Workflow/durable settlement;
- persistent facts and model-visible context are separate layers;
- context reduction is a projection and must preserve provenance/identity;
- the Pi AgentSession product is reference evidence, not a DomainHarness runtime dependency.

If a future production design contradicts these principles, the contradiction should be explicit in architecture evidence rather than introduced as implementation drift.

## 9. Provenance

Initial research authority is Pi at exact commit `d1230ea2000d876b479a69b8b061f9d670f262f5`, MIT licensed.

Primary upstream materials inspected for this reference:

- `packages/agent/src/agent-loop.ts`
- `packages/agent/src/types.ts`
- `packages/coding-agent/src/core/agent-session.ts`
- `packages/coding-agent/src/core/session-manager.ts`
- `packages/coding-agent/docs/sessions.md`
- `packages/coding-agent/docs/compaction.md`

The prior DomainHarness mini-kernel was a clean-room behavioral extraction and introduced no Pi runtime dependency. This reference likewise preserves design invariants rather than source package identity. Any future direct source copying or substantial adaptation must preserve applicable MIT notices and attribution.
