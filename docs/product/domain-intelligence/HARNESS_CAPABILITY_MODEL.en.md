# DomainHarness — Domain-Bounded Harness Capability Model (Product/L1)

**Status: PRODUCT_L1_ANALYSIS_CANDIDATE / NOT_FROZEN**  
**Analysis entry:** [Issue #1478](https://github.com/kaicreator-mm/domain-harness/issues/1478)  
**Parent Product baseline:** [#1477 Product/L1 Freeze](https://github.com/kaicreator-mm/domain-harness/issues/1477)  
**Current Product/L1 frozen identity:** main@b8135aa801eb38fcae2fa1fce3bada541178d5b9 / tree 4363139334ba5b7e83f888e2dc6ffa7e93445da7  
**v0.10.3 public source baseline:** [v0.10.3+source-repair.1](https://github.com/kaicreator-mm/domain-harness/releases/tag/v0.10.3%2Bsource-repair.1) — commit 896efbcec64132377e05fca7b3f7f6ff6b3c900b / tree 533f46fa07c809c827e2b0c3d902a4e1beaf47df

> This is a Product/L1 capability model and current-state gap assessment, not an SDK implementation design. It does not change the frozen v0.7 Domain App / Component / Kernel authority, introduce a second Runtime, second Scheduler or generic Agent platform, or authorize ABI, source, L2, Task DAG, version, release or deployment work.

## 1. Product conclusion

A **Domain-bounded Harness is a bounded domain execution and problem-solving capability embedded in a Domain App.** It consumes the App's exactly selected Domain Definition, Domain Intelligence, Semantic/Tool Component contracts and runtime context to understand requests, select intelligence, organize context, perform bounded reasoning when needed, invoke declared capabilities, evaluate results and preserve execution continuity within one Domain scope.

The Harness is not an independent Agent Runtime. One Business / Domain Machine still drives business control flow; a Harness Reasoning Episode is a bounded sub-process inside that control flow. The Kernel/Microkernel remains the sole authority for Admission, State, Transition, Effect, Journal and Replay/Recovery. The Host owns physical stores, Providers, external I/O, authorization and physical recovery. Domain Packages provide domain intelligence and declared capabilities, not a generic Runtime.

v0.10.3 already contains many useful building blocks, but **it does not yet form a complete, public, end-to-end Harness product capability**. In particular, Context Retrieval/Refresh, public multi-round Reasoning, the closed LLM Tool Proposal → Admission → Execution → Observation → Model Re-entry loop, and generic Outcome Evaluation still have material integration gaps.

## 2. Exact source and distribution baseline

This analysis binds the actual four-package GitHub SDK Tarball release rather than inferring capabilities from monorepo module names:

- Original immutable v0.10.3 tag: commit 061376f4a023070f215f9feffad5c24d96d503cb.
- Distribution-repair tag v0.10.3+source-repair.1: commit 896efbcec64132377e05fca7b3f7f6ff6b3c900b, tree 533f46fa07c809c827e2b0c3d902a4e1beaf47df.
- The Source Repair release distributes GitHub Release attachments only; it is not an npm Registry publication. Package version remains 0.10.3.
- Four public packages: Contracts, Microkernel, BUILD and Host-Node. Node.js >=24 is required.
- The 12 paths changed between the original tag and Source Repair are package manifests, lockfile, distribution scripts, docs and distribution tests; no Runtime source files changed. The Source Repair tag is therefore the public distribution identity while the original tag remains immutable historical identity.
- The monorepo's internal @kaicreator/domain-harness package remains private at version 0.2.0 and is not one of the four public Tarballs. Its internal HarnessMachine source cannot be counted as a delivered public SDK capability.
- The Release explicitly records that the Windows full npm test previously exited with EXIT=1 (#1471). It claims lint, typecheck, build and tarball-inventory gates passed. This document cites test files as traceable verification evidence; the existence of test files is not treated as proof that every test passed.

Public consumer entrypoints:

| Package | Public responsibility |
|---|---|
| @kaicreator/domain-harness-contracts | ABI, types, errors, LLM DTOs and runtime guards |
| @kaicreator/domain-harness-microkernel | load; /host-seam activation and narrowed Host seam |
| @kaicreator/domain-harness-build | buildV10App and Component projection |
| @kaicreator/domain-harness-host-node | CAS/Memory, Durable Controls, Deployment, Decision Evidence, Meta Feedback and Node Provider Host |

LLM Provider subpaths are exposed by Host-Node as /llm/openai and /llm/anthropic. Standard Feature and Capability modules are Domain Package assets selected by BUILD, not standalone npm SDK packages.

## 3. Harness product capability model

The following are Product responsibility groups, not new Component families, Package layers, ABIs or Runtime tiers.

### 3.1 Domain / Goal Framing

Within the selected Domain Scope and Consumer Profile, the Harness must handle:
- the current goal, relevant objects, inputs and expected outcomes;
- required facts, preconditions, constraints and exclusions;
- known, missing, ambiguous, conflicting, unknown and out-of-scope states;
- which problems selected Domain Intelligence can resolve and which require clarification, waiting, refusal or escalation.

Domain semantics, business intent and final business eligibility remain declared by the Domain Definition / Business Policy. The Harness supplies generic consumption capability; it does not invent business rules for a Domain. Design-time domain discovery by Domain-Forge is not Runtime Goal Understanding.

### 3.2 Intelligence Resolver

Preserve the exact frozen v0.3 decision-source precedence:

1. Deterministic Compiled Domain Intelligence;
2. Exact Semantic Result Reuse;
3. Applicable Promoted Reusable Subworkflow;
4. Bounded HarnessMachine / LLM Fallback.

Do not reorder Exact Reuse and Promoted Subworkflow. Applicability, Schema/Revision/Provenance and exact version mismatches must not produce fuzzy hits. If no qualified intelligence applies, the Harness may return unavailable, clarification, refusal or bounded fallback; it must not call an LLM merely to produce an answer.

### 3.3 Context Engine — planning, acquisition and assembly

The Context Engine organizes authorized source observations into the smallest inspectable context needed for the current decision. It must:
- make Context Scope, source identity, version, Provenance, applicability and freshness explicit;
- obtain current authoritative facts, Memory and external observations through Host / declared Tools;
- perform deterministic selection, ordering, budget control and structured assembly in the Harness;
- identify conflicts, duplicates, stale, missing and unverified material;
- refresh context in a bounded way when new observations arrive instead of accumulating unbounded history;
- minimize sensitive data and never require full private history or hidden chain-of-thought as necessary input.

Retrieval and physical reads are performed by the Host / declared Tools. A Context Feature must not impersonate Host authorization or a real Memory read. This Product/L1 does not prescribe a storage technology.

### 3.4 Bounded Reasoning Episode

Only when deterministic intelligence, exact reuse and promoted subworkflows are insufficient should the Harness start a bounded reasoning episode:

~~~text
prepare context
  → model request
  → structured result / tool proposal
  → schema + identity + policy validation
  → selected capability admission
  → authorized Tool execution
  → observed result
  → bounded context refresh
  → next model request when needed
  → validated final result / clarification / wait / refusal / failure
~~~

The product must define maximum steps, model/tool call budgets, deadlines, cancellation, duplicate-call prevention, unknown external outcomes, failure recovery and termination conditions. A model may propose structured results or Tool Proposals; it cannot decide K State, Transition, Effect Permit, Journal or Promotion. The Episode owns no independent persistent state machine or scheduler.

### 3.5 Capability / Tool / Workflow Orchestration

The Harness uses Semantic / Tool Components and requires/provides contracts already declared by the Domain Definition:
- select capabilities applicable to the current Domain and Consumer Profile;
- validate capability identity, revision, input schema, permissions and effect classification;
- route through existing BUILD-selected routes and K Admission;
- let the Host execute real external operations;
- feed actual outcomes, failures or UNKNOWN results back as observations to the current Episode;
- let only the existing Business / Domain Machine decide the next business transition.

Tool Proposal, Tool Operation, Tool Implementation and Tool Result are different objects. A model returning a Tool Proposal does not mean a Tool has been selected, authorized, executed or verified. Do not dynamically load a model-named Tool or let an LLM bypass K/Host.

### 3.6 Evaluation

The Harness provides generic structural validation and evidence coordination, while Domain-specific correctness remains consumer-defined:
- structure / Schema / ABI / input-output contract;
- Domain Rules, Invariants, applicability and exclusions;
- evidence source, completeness, freshness, Provenance and conflicts;
- whether Tool execution produced a real, verifiable outcome;
- whether current state still permits the decision;
- whether the final outcome should ACCEPT, REVIEW, CLARIFY, WAIT, REFUSE, RETRY (bounded), ESCALATE or FAIL.

Evaluation is not equivalent to “JSON parses” or “the LLM returned completed.” The Harness must not silently adjudicate high-impact conflicts or treat model self-evaluation as authoritative verification.

### 3.7 Continuity / Memory / Recovery

- The Harness manages logical budgets, call correlation, context references and termination semantics for the current Episode.
- The Kernel manages the sole authoritative instance state, transitions, Effects, Journal, UNKNOWN, Replay/Dedup.
- The Host manages physical CAS, Memory, external work, callbacks/deadlines, child invocation, poison recovery and actual Provider cancellation.
- Task-scoped Working Memory and cross-task candidate knowledge must remain separate; runtime observations do not automatically become promoted Domain Intelligence.
- WAIT/RESUME is governed business-workflow continuity, not an indefinite pause of private model chain-of-thought.
- Do not describe caller-driven Host delivery/recovery as an automatic background Scheduler; the caller triggers delivery/recovery while Kernel/Host own idempotency and durable truth.

### 3.8 Model / Provider Utilization

Models are optional bounded fallbacks, not Harness control authorities. Provider Host owns credentials, endpoints, model allowlists, deadlines, protocol adaptation, error classification and UNKNOWN semantics. Domain Intelligence and Business Policy should not depend on provider-private fields.

Provider connectivity, structured output, Tool Proposal, streaming, provider fallback and token/cost budgets are distinct capabilities that must be verified individually. An LLM adapter does not prove complete Harness Reasoning.

### 3.9 Evidence / Meta Feedback

The Harness should produce inspectable structured facts: selected intelligence source/version, input/context source references, call counts, Tool observations, validation findings, actual K receipt summary and final business outcome. Persisting private chain-of-thought must not be required.

Authorized Decision Evidence may feed Meta Feedback to produce bounded Candidate / Proposal records. Candidate, Shadow or one successful execution is not authority for Promotion, BUILD, Activation or production mutation.

## 4. v0.10.3 current-state and evidence matrix

Classification reuses #1478: SUPPORTED / PARTIAL / MISSING / CONSUMER_OWNED / KERNEL_OWNED / FORGE_OWNED / NOT_REQUIRED.

| Capability | Current classification | v0.10.3 fact and boundary |
|---|---|---|
| Domain / Goal Understanding | MISSING (generic public Harness capability); CONSUMER_OWNED (business intent) | The public SDK has no generic natural-language Goal/Domain Recognizer product interface; Business Intent, Domain Scope and domain semantics are supplied by the consumer. |
| Context Assembly | PARTIAL | The selected Context Assembly handles caller-supplied observations only; it validates Scope and Provenance shape, sorts and budgets them. It performs no Memory/Tool/Model read, does not prove Host authorization and labels verification caller-reported. |
| Scoped Memory | SUPPORTED (Host-owned) | Host-Node provides deployment/tenant/app/B/agent/thread-scoped put/get/search/delete, Host authorization, Provenance, TTL and CAS; it is not automatically integrated with Context Assembly retrieval/refresh. |
| Semantic Decision | PARTIAL | The selected Feature supports Rule → Exact Reuse → exact-pinned Procedure → one Model/Tool fallback, with step/call/deadline limits and authority-field rejection. It is not a general multi-round Reasoning Runtime. |
| Public multi-round HarnessMachine | MISSING (public consumer path) | The monorepo private package contains HarnessMachine source that loops Model + prebound read-only Query Capabilities under a step limit; Mutation Capabilities are refused. The package is private and absent from the four public Tarballs, so this is not a released public capability. |
| Tool Proposal | SUPPORTED (data contract) | OpenAI / Anthropic Host can return bounded Tool Proposal data; a Proposal carries no Permit or execution authority. |
| Proposal → Tool → Observation → Model loop | MISSING (generic public loop) | Provider C wraps one Host result as a K External Effect terminal; it does not automatically execute a model-proposed Tool or feed Tool results back into the model. |
| Declared Tool / Capability Route | SUPPORTED | BUILD selects C / Capability, K Admission/Effect Permit controls invocation and Host performs real I/O; routing is static, explicit and governed. |
| Workflow / WAIT / RESUME / Child | PARTIAL | Workflow Control is a pure Proposal Planner; Host Durable Controls + K provide CAS, Callback/Deadline, Child, Replay/Recovery. This is business-workflow continuity, not a general Reasoning Loop Scheduler. |
| Outcome Evaluation | PARTIAL / CONSUMER_OWNED | Schema, Feature Guards, B Policy and K Invariants validate structure and business transitions; evidence sufficiency, domain correctness and final acceptance criteria remain declared by the Domain Consumer. |
| State / Effect / Journal / Replay | KERNEL_OWNED | One K/Microkernel authority; never duplicate it in Harness, Feature, Host or LLM. |
| Provider Transport | SUPPORTED (Node Host) | OpenAI-compatible and Anthropic Messages Host subpaths, neutral LLM DTO, selected C route and K Effect path exist; Node >=24, non-streaming single request, no implicit Provider Fallback. |
| Context/Provider Cost Policy | PARTIAL | DTO/Host support deadlines, token usage and error categories; a unified Harness product for cost policy, dynamic model selection, cross-provider fallback and streaming does not exist. |
| Decision Evidence | SUPPORTED (Host bridge) | DecisionEvidenceObserver can invoke a selected Semantic Feature, read the real K Receipt, Host-measure Model/Tool calls and emit immutable Trace; it is not a general domain-outcome evaluator. |
| Meta Feedback | SUPPORTED (proposal-only) | Host Workflow reads bounded Evidence/Candidate/Shadow, invokes a selected Feature to create bounded Proposals and records them with CAS/stable message identity; no automatic approval, Promotion, Activation or Effect. |
| Domain Intelligence Production | FORGE_OWNED | Source research, knowledge synthesis, candidate production, qualification and promotion belong to Forge/governance, not automatic Runtime learning by the Harness. |

## 5. Key source and test evidence

### 5.1 Context / Memory

- Context Feature: domain-packages/standard/features/context-assembly/modules/sfeature-context-assembly-v1.mjs.
- Context P/N: tests/assembly/v010-t05-context-feature.test.ts.
- Host Memory: packages/host-node/src/scoped-memory.ts.
- Composition example: tests/assembly/v0103-prompt-context-composition.test.ts. This proves a specific Prompt + Context + selected K/Host composition, not a general Retrieval/Refresh Engine.

### 5.2 Semantic Decision / HarnessMachine

- Semantic Decision: domain-packages/standard/features/semantic-decision/modules/sfeature-semantic-decision-v1.mjs.
- Semantic Decision P/N: tests/assembly/v010-semantic-decision-feature.test.ts.
- Private HarnessMachine: packages/domain-harness/src/harness/harness-machine.ts.
- The FR07-S1 single-step query/final surface in domain-packages/standard/basic/standard-sdk-v1.mjs is explicitly marked UNSELECTED; it does not prove public multi-round execution is enabled.

### 5.3 Workflow / K / Host Continuity

- Workflow Planner: domain-packages/standard/features/workflow-control/modules/sfeature-workflow-control-v1.mjs.
- Workflow P/N: tests/assembly/v010-t03-workflow-control-feature.test.ts.
- Host Durable Controls: packages/host-node/src/durable-controls.ts.
- Physical SQLite restart / Callback / RESUME / Child / replay reference: tests/hosts/node/v010-t03-workflow-control-physical.test.ts. This is source-level physical integration evidence and must not be mislabeled as an independent clean packed consumer validation.

### 5.4 Provider / Tool Proposal

- Neutral DTO/Guards: packages/contracts/src/llm-generate-v1.ts and llm-generate-v1-guards.ts.
- Provider Host: packages/host-node/src/llm/providers/openai/client.ts and anthropic/client.ts.
- Selected Capabilities: domain-packages/capabilities/llm-openai-compatible/module.mjs and domain-packages/capabilities/llm-anthropic-messages/modules/capability-llm-anthropic-messages.mjs.
- Provider tests: tests/assembly/v0103-llm-openai-only.test.ts and v0103-llm-anthropic-only.test.ts.
- Clean packed consumer: tests/hosts/node/v0103-llm-selected-packed-consumer.test.ts verifies external installation/import of the four public Tarballs and 0/1/2 Provider selection. Its Tool tests prove Proposal data return, not automatic Proposal execution.

### 5.5 Evidence / Meta Feedback

- Selected Evidence Feature: domain-packages/standard/features/decision-evidence/modules/sfeature-decision-evidence-v1.mjs.
- Host Observer: packages/host-node/src/decision-evidence-observer.ts.
- Evidence P/N: tests/assembly/v010-t06-decision-evidence.test.ts.
- Meta Feature: domain-packages/standard/features/meta-feedback/modules/sfeature-meta-feedback-v1.mjs.
- Host Meta Workflow: packages/host-node/src/meta-feedback-workflow.ts.
- Node24 + SQLite physical Meta test: tests/hosts/node/v010-t09-meta-feedback-workflow.test.ts.

## 6. Target consumer path and authority split

~~~text
UX / Caller
  → selected Domain App + Business Intent
  → Domain Scope / Goal framing (Definition + Consumer Policy)
  → Context Plan / Host-authorized reads
  → Context Assembly
  → Intelligence Resolver
      deterministic compiled
      → exact semantic reuse
      → applicable promoted subworkflow
      → bounded Reasoning Episode (only if needed)
  → structured result / Tool Proposal
  → validate identity + schema + policy
  → selected Capability route
  → K Admission / Effect / Journal
  → Host physical Tool / Provider I/O
  → observed result
  → bounded Context refresh / next reasoning step
  → Domain-specific Evaluation
  → one Business / Domain Machine transition through K
  → Decision Evidence Observer
  → Meta Feedback Candidate (proposal-only)
~~~

Authority split:

- **Domain Definition / Package:** Domain Scope, semantics, rules, Procedures, Workflows, Tool/Capability declarations, input/output contracts, Context source requirements, Evaluation criteria and selected versions.
- **Harness:** generic consumption and coordination; intelligence selection, context assembly, bounded reasoning, capability proposal/validation, observation coordination and result evaluation.
- **Business / Domain Machine:** business control flow, intent and policy; remains the sole business control-flow owner.
- **Kernel / Microkernel:** sole authority for Admission, State, Transition, Effect, Journal, UNKNOWN and Replay/Recovery.
- **Host:** real Providers, credentials, Memory/Data Stores, external Tools, CAS, Durable Controls, Evidence Sink and environment authorization.
- **Domain-Forge / Simulator:** design-time knowledge production, simulation, qualification and candidate improvement; no automatic mutation of active Runtime instances.
- **DIS:** defines exchangeable Intelligence Units, Recognizer, Decision, Procedure, Workflow, Graph, resource closure, qualification and conformance; the Harness consumes selected outputs without duplicating DIS ontology.
- **UX:** interaction, clarification and presentation; no Runtime/Effect authority.

## 7. Main Product gaps and priority

| Priority | Gap | Product impact |
|---|---|---|
| P0 | No public end-to-end Harness consumption loop | Existing Context, Reasoning, Tool and Evaluation building blocks cannot be treated as a complete Harness merely because they exist. |
| P1 | Domain/Goal Framing and DIS Recognizer consumption contract | Without a reusable public contract, each Domain risks implementing its own understanding and ambiguity handling. |
| P1 | Context Retrieval/Refresh and Host Memory composition boundary | The current Context Feature assembles supplied observations only and cannot independently construct trusted task context. |
| P1 | Public bounded multi-round Reasoning Episode | The current single fallback in Semantic Decision and private HarnessMachine are not public multi-round capability. |
| P1 | Safe Tool Proposal → selected Tool route loop | Proposals are not automatically executed today; generic Tool observation/re-entry is missing. |
| P1 | Generic Outcome Evaluation and evidence sufficiency boundary | Structural validation and domain correctness are split across consumers; generic Harness coordination needs definition. |
| P2 | Pause/resume and interruption recovery contract for Reasoning Episode | K/Host already provide external-work recovery, but multi-round Model/Tool Episode continuity is not one coherent consumer model. |
| P2 | Provider streaming, cost/latency policy and optional fallback | Include only when real consumers prove value; do not turn a Provider feature list into mandatory Harness scope. |
| P2 | End-to-end source linkage between Context and Decision Evidence | Current modules provide local evidence but not one unified consumption path. |

P0/P1 are gaps that the Product/L1 model must define; they do not mean the SDK should be modified immediately. P2 items require real consumer ROI before inclusion.

## 8. Product/L1 success criteria

1. The same embedded Harness consumes exact selected Definitions and Intelligence from different Domains without a separate Runtime per Domain.
2. Known problems prefer deterministic intelligence, Exact Reuse and applicable Promoted Subworkflows; common paths need no LLM.
3. Unsupported, ambiguous, conflicting, evidence-deficient and out-of-scope requests are explicit and can clarify, wait, refuse or escalate.
4. Context source, scope, version, Provenance, freshness and budget are inspectable; unauthorized Host data never enters trusted Context.
5. When reasoning is needed, the Harness can complete a bounded Model → Tool Proposal → Admission → Tool → Observation → Model cycle with explicit step/call/deadline/cancel/termination bounds.
6. Tool Proposals never execute directly; every external operation uses a selected Capability, K Admission/Effect and Host.
7. Intermediate and final results are evaluated using Schema, Domain Policy, Evidence and current state; model self-evaluation is not authoritative.
8. WAIT/RESUME, cancellation, Replay and UNKNOWN do not duplicate Effects; no second Journal, Scheduler or Runtime is introduced.
9. Runtime evidence traces selected intelligence, Context source, actual call counts and K Receipt without depending on hidden chain-of-thought.
10. Meta Feedback produces Candidates/Proposals only; future versions can select them only after independent validation and explicit Promotion; active instances retain exact pins.
11. Providers are optional and replaceable; no-model mode remains viable, with no implicit provider switch or permission relaxation.
12. SDK self-bootstrap, Domain Intelligence self-bootstrap and Forge Seed bootstrap are evaluated separately; merely loading one's own Package does not prove complete self-bootstrap.

## 9. Boundaries with adjacent Product work

- **#1477:** the frozen overall Domain Intelligence Product/L1, Domain App, Component, Kernel and self-bootstrap boundaries; this document does not reopen them.
- **#1476:** Domain Package Semantic Knowledge identity, query/access and optional data-resource contract; this document defines only how the Harness consumes Host/Package-provided context.
- **#1480:** Domain Package structure, K/S/B, Primary/Extension, Dependency, Hook, Boot/KDP candidate model; this document does not redefine Package ontology. The #1480 KDP migration proposal is not frozen authority; Harness remains within the existing Microkernel boundary from #1477.
- **#1481 DIS 0.1.0:** specifies Intelligence Units, Recognizer, Decision, Procedure, Workflow, Composition Graph, resource closure, qualification and conformance; this document defines Harness consumption capability without duplicating DIS Schema or Graph specifications.
- **#1398:** preserves original v0.3 four-source decision order and separates Task/Meta evolution.
- **#1395:** supplies a concrete pre-generated-first, LLM-on-demand, dynamic-step and recovery consumer scenario; it is not the generic Harness product model.

## 10. Explicit non-goals of this Product/L1 model

This document does not freeze:
- a concrete HarnessMachine state machine, Actor model, API, ABI or directory;
- a new SDK Package, Component family, Package layer or second Runtime;
- an LLM Provider, model, vector database, SQLite, Graph DB, RAG technology or Memory vendor;
- Streaming, automatic Provider Fallback, automatic retries or automatic Tool execution;
- a generic Agent, multi-agent, free-form planning, unbounded loop or autonomous scheduler;
- Domain-specific Rules, final business decisions or domain knowledge bases;
- automatic learning, automatic Promotion, automatic Activation or silent pin replacement of active instances;
- v0.10.4 or any successor SDK version, L2, Task DAG, source implementation, Release or Deployment.

## 11. Current status and next gate

~~~ini
PARENT_PRODUCT_L1=#1477
PARENT_PRODUCT_FREEZE=YES
HARNESS_CAPABILITY_MODEL=ANALYSIS_CANDIDATE
V0103_SOURCE_BASE=v0.10.3+source-repair.1
V0103_SOURCE_COMMIT=896efbcec64132377e05fca7b3f7f6ff6b3c900b
V0103_SOURCE_TREE=533f46fa07c809c827e2b0c3d902a4e1beaf47df
CURRENT_PUBLIC_HARNESS=PARTIAL
PUBLIC_MULTI_ROUND_REASONING=MISSING
GENERIC_TOOL_PROPOSAL_LOOP=MISSING
PRODUCT_FREEZE=NO
L2=NOT_STARTED
TASK_DAG=NOT_AUTHORIZED
IMPLEMENTATION_AUTHORIZED=NO
VERSION_TARGET=UNASSIGNED
RELEASE_AUTHORITY=NONE
~~~

This candidate requires Fresh Independent Exact-SHA Product/L1 Review. Only after a passing review may the Controller record a Product/L1 Freeze Checkpoint for #1478. Whether to start L2 and how to divide it from DIS/#1480 still require a separate decision; this analysis does not itself authorize implementation.
