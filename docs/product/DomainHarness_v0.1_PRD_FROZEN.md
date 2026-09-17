# DomainHarness v0.1 PRD

**Project:** DomainHarness  
**Formal Product Name:** Domain Harness Runtime  
**Package:** `@kaicreator/domain-harness`  
**Version:** v0.1  
**Status:** **FROZEN**  
**Product Form:** Embedded TypeScript SDK / Runtime + Contract SDK  
**Primary Runtime:** Node.js  
**Primary State Engine:** XState v5 stable  
**Freeze Date:** 2026-09-17  

---

## 1. Product Definition

DomainHarness is the shared runtime and contract SDK used by Domain Harness Products.

A Domain Product is composed of four major parts:

```text
Domain Product
├── Domain Data / Domain Assets
├── Domain Harness Runtime
├── User UI
└── Admin Console
```

DomainHarness only owns the shared execution/runtime layer and common contracts.

Domain-specific data, rules, knowledge, workflows, DAG semantics, user experience, and administrative experience remain owned by the corresponding domain project.

Examples:

- Tally owns software-engineering semantics, TaskDAG semantics, CompletionContract, evidence and engineering authority.
- Formula owns visual/creative semantics, design workflow, quality and render rules.
- Cairn owns knowledge extraction, evidence, assurance, fusion, governance and promotion semantics.
- Forge owns trade content semantics and its Site/Image/Video Harness definitions.
- City Atlas owns local-life task semantics, TaskDefinition, primitives, action rules and publishing governance.

DomainHarness must never contain those domain-specific concepts.

### One-line definition

> DomainHarness is a lightweight, persistent, resumable execution runtime and contract SDK for running structured domain workflows composed of Skills, Tools, Expressions, Scripts and Child Workflows.

---

## 2. Product Problem

AI-native domain products repeatedly implement the same execution infrastructure:

- workflow/state handling;
- AI step invocation;
- deterministic calculation and routing;
- external tool execution;
- script execution;
- schema validation;
- persistence;
- crash recovery;
- waiting for external/human events;
- child-flow orchestration;
- tracing and error normalization.

These execution mechanisms are generic.

By contrast, the following are domain-specific and must remain outside the Runtime:

- TaskDAG meaning;
- trade claim/evidence policy;
- knowledge promotion rules;
- design quality rules;
- task/action semantics;
- domain workflows and domain assets.

Without a shared Runtime, each domain project risks reimplementing the same orchestration and recovery mechanisms.

---

## 3. Product Model

### 3.1 Domain Data / Domain Assets

Domain Data is the long-term domain asset.

It may include:

```text
Domain Data
├── Skills
├── Workflows
├── DAG Definitions
├── Decision / Routing Rules
├── Constraints
├── Validation Rules
├── Domain Schemas
├── Facts / References
├── Technical Patterns
├── Recipes
├── Templates
├── Examples / Counterexamples
└── Tool Usage Policies
```

Not every asset becomes a Runtime primitive.

Most domain knowledge remains ordinary versioned files under `references/` or `assets/`.

### 3.2 Domain Harness Runtime

DomainHarness Runtime answers:

> How is domain execution performed safely, persistently and deterministically?

It owns generic execution semantics only.

### 3.3 User UI

Each domain project owns its User UI.

Examples:

- Tally: project/task/verification/release UI.
- Formula: Studio.
- Cairn: knowledge construction/governance UI.
- Forge: trade content/site/media/RFQ UI.
- City Atlas: consumer task/map/action UI.

DomainHarness does not provide a generic user-facing workflow UI.

### 3.4 Admin Console

Each domain project owns its Admin Console.

The Runtime may expose inspection, validation and tracing APIs, but it does not provide a universal workflow console.

Examples:

- Tally: engineering rule / flow administration.
- Formula: creative / quality / harness administration.
- Cairn: knowledge governance.
- Forge: trade harness administration.
- City Atlas: Task Lab / Domain Operations Workbench.

---

## 4. Product Principles

### P1. Keep Runtime Thin

DomainHarness must not become:

- an Agent Framework;
- an AI Gateway;
- a generic BPM platform;
- a distributed workflow platform;
- a knowledge base;
- a reasoning engine;
- a rule engine;
- a generic admin product.

### P2. Deterministic Before AI

Execution priority:

```text
1. Expression
2. Script
3. Tool
4. Skill → AI Runtime
```

when the problem can be solved deterministically.

### P3. LLM Does Not Own Workflow Authority

LLM output is:

- proposal;
- structured result;
- semantic assessment;
- recommendation.

It does not directly mutate domain authority or arbitrarily choose the next workflow state.

Workflow/state transition authority remains in the Domain Harness.

### P4. Domain Semantics Stay in Domain Projects

The Runtime may understand generic concepts:

```text
workflow
state
event
dependency
step
output
error
```

It must not understand:

```text
PRD
Architecture
RFQ
CreativeDirection
Fact
POI
BuyerQuestion
ReleaseQualification
```

### P5. XState Is an Internal Implementation Detail

Domain authors never write XState APIs.

### P6. Runtime Must Be Replaceable

Domain assets must not depend on Runtime internals.

### P7. No Duplicate Authority

DomainHarness must not create a second authoritative business state beside the domain product's own authoritative model.

---

## 5. v0.1 Scope

v0.1 supports:

```text
Sequential Workflow
Child Workflow Composition
Skill
Tool
Script
Expression
State / Event
Waiting / Resume
Persistence
Crash Recovery
Schema Validation
```

v0.1 does **not** yet support:

```text
Static Parallel Composition
Generic DAG Execution (evidence-gated)
Dynamic Spawn
Full Hierarchical Statechart DSL
History State
Distributed Execution
```

Static Parallel Composition is a confirmed future Runtime capability required by current domain projects, but it is intentionally deferred from v0.1 implementation to keep the initial contract small and stable.

Generic DAG Execution is **evidence-gated future scope** rather than a committed Runtime primitive. Tally and Cairn own their DAG/readiness semantics; v0.1 and L2 must not pre-design a second DAG state authority. A generic DAG primitive is added only if real domain integration demonstrates that domain-owned readiness logic plus Child Workflow and future Parallel Composition cannot express the required behavior cleanly.

---

## 6. Required Evolution After v0.1

### 6.1 Static Parallel Composition — Required Future Capability

Required by real scenarios such as:

- Forge Site/Image/Video fan-out;
- Formula variant/render/evaluation fan-out;
- Cairn multi-source processing.

Target direction:

```text
Parent Workflow
        ↓
Parallel Child Workflows
        ↓
Join
```

### 6.2 Generic DAG Execution — Evidence-gated Future Capability

Tally and Cairn already contain dependency-driven domain work, but that does not by itself prove that DomainHarness needs a first-class generic DAG Runtime.

The default future composition model is:

```text
Domain-owned DAG / dependency model
        ↓
Domain Script / Tool computes readiness
        ↓
Child Workflow execution
        ↓
Future Static Parallel Composition where useful
```

A generic DAG Runtime may be introduced only after Product Evidence demonstrates real scenarios that cannot be expressed cleanly with those capabilities.

If introduced, the Runtime may own only generic execution mechanics such as:

```text
dependency satisfied
ready
running
done
failed
blocked
```

while node meaning, readiness policy, completion rules, authority rules, re-plan semantics and authoritative domain state remain owned by the domain project.

Example:

```text
Engineering TaskDAG truth / rules → Tally
Possible generic execution projection → DomainHarness
```

v0.1 and L2 must not pre-design a DAG node-state model or include Tally Active TaskDAG in the DomainHarness definition lock.

---

## 7. Technology Baseline

v0.1 baseline:

```text
TypeScript
Node.js
XState v5 stable
JSONata 2.x
SQLite
better-sqlite3
YAML
Zod 4
Ajv
worker_threads
```

Not included:

```text
Mastra
LangGraph
Temporal
JsonLogic
ORM
multi-database abstraction
distributed scheduler
```

---

## 8. XState Policy

### 8.1 v0.1

Use XState v5 stable.

XState v6 alpha is not a production baseline.

### 8.2 Isolation

XState types/configuration must not appear in:

- public SDK API;
- Workflow DSL;
- Skill Contract;
- Tool Contract;
- HarnessRun;
- domain assets.

XState is restricted to internal modules such as:

```text
compiler/
runner/
```

### 8.3 Future v6 Migration

When XState v6 reaches stable, perform a compatibility spike.

Evaluate:

- durable steps;
- backend workflow semantics;
- snapshot migration;
- whether the DomainHarness step journal can be reduced.

Cross-major snapshot migration is not supported in v0.1.

Default migration policy:

```text
drain active v5 runs
→ upgrade engine
→ create new runs on v6
```

---

## 9. Domain Harness Directory

Recommended structure:

```text
harness/
├── harness.yaml
├── workflows/
│   ├── main.yaml
│   └── child-workflow.yaml
└── skills/
    └── generate-prd/
        ├── SKILL.md
        ├── skill.harness.yaml
        ├── references/
        ├── assets/
        └── scripts/
```

Host Tool implementations are injected by application code and are not stored as Runtime executable plugins inside the Harness package.

---

## 10. Harness Manifest

`harness.yaml`:

```yaml
schemaVersion: "0.1"
id: tally

limits:
  maxSteps: 100
```

v0.1 has one Harness schema version.

Workflow files and Skill sidecars do not carry independent schema versions.

Unknown versions fail loading.

---

## 11. Skill Contract

A Skill is an AI-oriented domain capability package.

It may contain:

```text
instructions
references
assets
input schema
output schema
execution profile
```

Runtime semantics:

> One Skill invocation equals one AI Operation.

A Skill does not own Workflow execution.

A Skill does not call another Skill through DomainHarness.

A Skill does not call Harness Tools.

A Skill does not contain hidden Script or Expression execution flow.

---

## 12. Agent Skills Compatibility

`SKILL.md` remains Agent Skills compatible.

DomainHarness-specific metadata lives in:

```text
skill.harness.yaml
```

Example:

```yaml
input:
  schema: assets/input.schema.json

output:
  schema: assets/output.schema.json

resources:
  - references/product-evidence.md
  - references/examples.md

profile: high-quality-generation
```

Supported sidecar fields:

- `input` — optional JSON Schema;
- `output` — required JSON Schema;
- `resources` — optional resource list;
- `profile` — optional opaque AI execution profile.

Without a DomainHarness sidecar, a Skill may still be useful to development agents, but it is not invokable as a DomainHarness Skill Step.

---

## 13. AI Runtime Boundary

Execution:

```text
DomainHarness
    ↓
AIOperationPort
    ↓
AI Runtime
```

DomainHarness owns:

- domain instructions/resources;
- Skill input/output contract;
- domain validation;
- workflow routing.

AI Runtime owns:

- model/provider selection;
- strong/weak model strategy;
- critic/judge/consensus;
- provider retry/fallback;
- model cost/latency policy.

DomainHarness has no provider-specific dependency.

---

## 14. v0.1 Step Types

v0.1 has five executable Step kinds:

```text
skill
tool
script
expr
workflow
```

A state may invoke at most one Step.

A state with no invoke may act as a waiting state.

---

## 15. Child Workflow Contract

Child Workflow is part of v0.1.

Purpose:

> Allow a domain project to compose reusable domain workflows without exposing nested XState statechart internals.

Example:

```yaml
creative:
  invoke:
    workflow: creative_generation
    input: input.brief

  on:
    done: quality
    error: failed
```

Semantics:

```text
Parent Workflow State
        ↓
Child Workflow Instance
        ↓
Child reaches terminal state
        ↓
successful final → evaluate child workflow.output
failed final     → child_workflow_error
        ↓
Parent step output / Parent on.error
        ↓
Parent transition
```

### Child Scope

v0.1 Child Workflows are resolved **only inside the same Harness**.

Cross-product or cross-service capabilities continue to use Tools.

Child input is exactly the evaluated result of the parent's `invoke.input`.

Child execution scope is isolated:

```text
child.input      = parent invoke.input result
child.steps      = child workflow instance only
child.run.visits = child workflow instance only
```

A Child Workflow cannot directly read parent `steps` or parent `run.visits`. Parent data must be passed explicitly through `invoke.input`.

### Restrictions in v0.1

- child workflow invocation is sequential;
- no parallel child invocation;
- no dynamic workflow spawning;
- no workflow recursion;
- workflow dependency cycles are rejected at load time;
- parent treats child workflow as one logical Step boundary;
- child workflow execution remains independently journaled internally.

---

## 16. Workflow Authoring Model

Workflow is YAML.

Pipeline:

```text
Workflow YAML
→ Zod validation
→ Harness AST
→ static validation
→ XState compiler
→ XState machine
```

Domain authors do not write XState directly.

---

## 17. Workflow v0.1 Supported Subset

Supported:

```text
flat states per workflow
initial state
one invoke per state
done transition
error transition
external event transition
ordered conditional routes
final state
waiting state
child workflow invocation
top-level workflow output expression
```

Not supported:

```text
XState nested-state DSL
parallel state
history
after
always
entry/exit action DSL
multiple invokes
dynamic actors
```

---

## 17.1 Workflow Result Contract

A Workflow may declare a top-level `output` JSONata expression.

Example:

```yaml
output: "steps.result"
```

The expression can read:

```text
input
steps
run
```

Result semantics:

```text
successful final state
→ evaluate workflow.output
→ Workflow Result
```

For the root Workflow:

```text
Workflow Result
→ HarnessRun.output
```

For a Child Workflow:

```text
Workflow Result
→ Parent Step output
→ steps.<parentStateId>
```

A Workflow referenced as a Child **must** declare `output`; this is enforced by static validation.

The Runtime never implicitly exposes the Child's full internal `steps`, and it never treats the last executed Step as the Child result.

### Terminal Classification

The final state with id:

```text
failed
```

is the single Runtime failure terminal.

Semantics:

```text
Root reaches failed
→ HarnessRun.status = failed

Child reaches failed
→ Parent Step fails
→ error.code = child_workflow_error
→ Parent on.error
```

Every other final state is a successful Runtime completion, even when the domain outcome itself is negative, for example:

```text
rejected
abstained
not_recommended
```

Those are successful domain outcomes, not Runtime execution failures.

---

## 18. Workflow Data Model

Every Step output is written to:

```text
steps.<stateId>
```

within the current workflow instance.

Runtime context:

```text
input
steps
run
```

Additional route scope:

```text
output
error
event
```

DomainHarness does not expose general mutable `assign`.

Derived state is represented by an explicit `expr` Step.

---

## 19. Workflow Instance Identity

Because v0.1 includes Child Workflows, persistence identity must include workflow instance scope.

Conceptually:

```text
runId
workflowInstanceId
stateId
visit
```

Root workflow instance uses a stable root identity.

Each Child Workflow invocation receives a deterministic identity derived from:

```text
parentWorkflowInstanceId
parentStateId
parentVisit
```

For example:

```text
root
root/creative#1
root/creative#2
root/creative#1/quality#1
```

Repeated visits to the same parent state therefore create different Child Workflow instances and cannot reuse an earlier invocation's completed journal entries.

This design must not assume that `stateId` is globally unique across all child workflows.

The Tool `idempotencyKey` must be derived from the full Step identity, including at least:

```text
runId
workflowInstanceId
stateId
visit
```

Future Parallel Composition may extend workflow instance identity with a deterministic branch segment without changing the v0.1 identity principle.

---

## 20. Expression Engine

JSONata is the only expression language.

Uses:

- input mapping;
- calculation;
- query/filter;
- aggregation;
- transformation;
- deterministic validation;
- routing.

No JsonLogic.

No custom JSONata external I/O functions.

---

## 21. Expression Slots

### `invoke.input`

Scope:

```text
input
steps
run
```

Returns any JSON value.

### `invoke.expr`

Scope:

```text
input
steps
run
```

Returns the current Step output.

### `on.done[].when`

Adds:

```text
output
```

Must return strict boolean.

### `on.error[].when`

Adds:

```text
error
```

Must return strict boolean.

### `on.<event>[].when`

Adds:

```text
event
```

Must return strict boolean.

Non-boolean result is an `expression_error`.

---

## 22. JSONata / XState Boundary

JSONata never runs directly inside an XState Guard.

Execution order:

```text
input mapping
→ Step execution
→ output validation
→ ordered route evaluation
→ route result
→ XState transition
```

XState only consumes the precomputed route result.

---

## 23. Transition Model

Only `on` is used.

No separate `routes` construct.

Example:

```yaml
on:
  done:
    - when: "output.score >= 80"
      target: architecture
    - when: "run.visits.prd < 3"
      target: prd
    - target: failed
```

Conditional transition lists must end in an unconditional fallback.

No unmatched conditional route may leave a Run silently stuck in `running`.

---

## 24. Error Transition

If a state does not declare `on.error`, the default target is:

```text
failed
```

Every Workflow must have a reachable final state. The final state id `failed` has the fixed Runtime failure semantics defined in §17.1; no alternative failure-terminal policy exists in v0.1.

---

## 25. Waiting State and External Events

A state without `invoke` may wait for external events.

Example:

```yaml
await_approval:
  on:
    approve:
      schema: schemas/approval.schema.json
      target: task_dag

    reject:
      target: failed
```

Rules:

- `on.<external-event>` is allowed only on waiting states in v0.1;
- event payload may declare a JSON Schema;
- payload is validated with Ajv;
- accepted payload is written to `steps.<waitingStateId>`;
- `send()` to a non-waiting Run is rejected;
- undeclared events are rejected;
- rejected `send()` does not mutate the Run.

---

## 26. Static Validation

Harness loading must verify at least:

- initial state exists;
- all transition targets exist;
- state IDs are valid;
- reachable-state checks;
- at least one reachable final state;
- referenced Skills exist;
- referenced Skills have valid sidecars;
- referenced Tools are registered;
- referenced Scripts exist;
- referenced Child Workflows exist in the same Harness;
- every Workflow referenced as a Child declares top-level `output`;
- Child Workflow dependency graph is acyclic;
- top-level Workflow `output` expressions compile;
- JSONata expressions compile;
- JSON Schemas compile;
- all conditional transition lists have an unconditional fallback;
- external event rules are valid.

State ID pattern:

```regex
^[a-z][a-z0-9_]*$
```

---

## 27. JSON Schema Contract

Domain data contracts use:

```text
JSON Schema Draft 2020-12
```

Runtime validator:

```text
Ajv
```

JSON Schema is used for:

- Skill input/output;
- Tool input/output;
- external event payload;
- public portable domain-data boundaries.

All schemas are compiled during Harness loading.

---

## 28. Zod Responsibility

Zod is used for DomainHarness's own configuration/DSL contracts and TypeScript inference.

Examples:

- `harness.yaml`;
- workflow config;
- Skill sidecar config.

Domain data contracts use JSON Schema, not Zod, as their portable canonical form.

---

## 29. JSONata Determinism

The Runtime must prevent nondeterministic expression behavior.

Policy:

```text
$random → forbidden
$eval   → forbidden
$now    → Runtime-provided deterministic clock
$millis → Runtime-provided deterministic clock
```

Business code never imports JSONata directly.

All evaluation goes through internal `ExpressionRuntime`.

---

## 30. Tool Contract

Tool is the exclusive boundary for host/external I/O and side effects.

Conceptual contract:

```ts
interface HarnessTool<I = unknown, O = unknown> {
  input?: JSONSchema;
  output?: JSONSchema;

  effect:
    | "none"
    | "idempotent"
    | "non-idempotent";

  execute(
    input: I,
    ctx: ToolContext
  ): Promise<O>;
}
```

ToolContext conceptually includes:

```ts
interface ToolContext {
  runId: string;
  workflowInstanceId: string;
  stepId: string;
  attempt: number;
  idempotencyKey: string;
  signal: AbortSignal;
  now(): Date;
}
```

---

## 31. Tool Boundary

Examples of Tool work:

- GitHub;
- HTTP;
- file-system mutation;
- database access;
- external job start/status;
- Cairn calls from other products;
- dx-service;
- Formula;
- HyperFrames;
- external system actions.

Credentials remain in Host-owned Tool closures.

Credentials must never enter:

- Harness YAML;
- step input/output;
- journal;
- AI request;
- domain asset files.

---

## 32. Skill / Tool Boundary

Skill:

```text
AI semantic capability
```

Tool:

```text
I/O / side effect / external capability
```

A Skill does not invoke Harness Tools in v0.1.

If external data is needed:

```text
Tool Step
→ Step output
→ Skill input
```

This keeps tool side effects visible, auditable and recoverable.

---

## 33. Script Contract

Script is a trusted deterministic extension.

Use cases:

- graph traversal;
- complex scoring;
- parsing;
- complex deterministic validation;
- algorithms unsuitable for JSONata.

Script must not own external I/O.

Input/output must be JSON-serializable.

Conceptual module:

```ts
export default async function execute(
  input: unknown
): Promise<unknown>
```

---

## 34. Script Worker

Each Script invocation creates a Worker.

v0.1 does not implement a Worker Pool.

Worker requirements:

- timeout;
- termination on timeout/cancel;
- resource limits;
- `env: {}`;
- JSON-only boundary.

Worker is not a hostile-code security sandbox.

---

## 35. Run Lifecycle

Run status:

```text
running
waiting
completed
failed
cancelled
```

Public Runtime operations:

```text
start
send
wait
resume
cancel
get
listRuns
```

Detailed TypeScript signatures are frozen in L2, not PRD.

---

## 36. Start / Wait Semantics

Product semantics:

- `start` persists the new Run before returning;
- execution continues under Runtime control;
- `wait` resolves when the Run reaches either:
  - waiting;
  - completed;
  - failed;
  - cancelled.

Exact API typing and scheduling mechanics are L2 concerns.

---

## 37. Persistent Execution Semantics

v0.1 guarantees:

```text
at-least-once execution
+
journal-based deduplication
```

It does not claim exactly-once execution.

---

## 38. Step Journal

Step identity conceptually includes:

```text
runId
workflowInstanceId
stateId
visit
```

Before execution:

```text
started
```

After successful execution:

```text
completed
+
normalized JSON output
```

Child Workflow internal Steps use their own workflowInstanceId.

---

## 39. Recovery Rules

### Completed Step

Return persisted output.

Never automatically rerun.

### Started Expression

May rerun.

### Started Script

May rerun.

### Started Skill

May rerun.

### Tool: `effect=none`

May rerun.

### Tool: `effect=idempotent`

May rerun with the same idempotency key.

### Tool: `effect=non-idempotent`

Must not automatically rerun.

Convert to:

```text
error.code = interrupted
```

and route through workflow error handling.

---

## 40. Child Workflow Recovery

A Child Workflow is not persisted as one opaque operation only.

The parent sees it as one logical Step, but the Runtime must preserve sufficient internal child state/journal information to resume the child rather than restart the entire child from the beginning.

The exact snapshot/journal representation is an L2 design issue.

---

## 41. Definition Lock

Each Run stores:

```text
definitionHash
executionEngineMajor
```

`definitionHash` covers at least:

- workflow definitions;
- Child Workflow dependency structure;
- Skill sidecars;
- referenced JSON Schemas.

If either:

```text
definitionHash mismatch
executionEngineMajor mismatch
```

then resume is rejected.

v0.1 does not implement definition migration.

---

## 42. External Long-running Work

Do not keep a Tool Promise alive for hours.

Pattern:

```text
Tool starts external job
→ returns job id
→ Workflow enters waiting state
→ Host receives callback/event
→ send()
→ Workflow continues
```

---

## 43. Cancellation

Cancellation propagates through AbortSignal where applicable.

Targets:

- Tool;
- AI Operation;
- Script Worker;
- active Child Workflow.

Cancelled Run ends with:

```text
status = cancelled
```

---

## 44. Limits

v0.1 must support:

- `maxSteps`;
- per-step timeout;
- expression resource protection;
- child-workflow depth limit.

When `maxSteps` is exceeded:

```text
status = failed
error.code = step_limit_exceeded
```

Workflow recursion is prohibited, but a depth limit remains a defensive runtime control.

---

## 45. Unified Error Model

Minimum error codes:

```text
timeout
cancelled
interrupted
step_limit_exceeded
invalid_input
invalid_output
expression_error
script_error
tool_error
ai_error
child_workflow_error
```

DomainHarness does not provide generic automatic retry policy.

Retries/repair are explicitly represented in domain workflow, except provider-level retries inside AI Runtime.

---

## 46. SQLite Persistence

v0.1 persistence:

```text
SQLite
+
better-sqlite3
```

No storage abstraction in v0.1.

No PostgreSQL adapter in v0.1.

---

## 47. Store Model

Core logical tables:

```text
runs
steps
```

The SQLite schema is internal implementation.

Hosts must not depend on SQLite tables directly.

All access goes through DomainHarness APIs.

This protects future XState/runtime/store changes from leaking into domain products.

---

## 48. SQLite Policy

Use:

```text
journal_mode=WAL
synchronous=FULL
busy_timeout
```

Migration:

```text
PRAGMA user_version
+
ordered SQL migrations
```

No ORM.

---

## 49. Single-process Ownership

v0.1 assumes:

> one SQLite file is actively driven by one DomainHarness process instance.

No:

- distributed lease;
- multi-process scheduler;
- cluster runtime.

Operations on the same Run are serialized in-process.

---

## 50. Domain Asset Model

Runtime primitives in v0.1:

```text
Workflow / State
Child Workflow
JSON Schema validation
Skill execution
Tool execution
Script execution
Expression execution
Persistence / recovery
```

Most domain assets remain files:

```text
Facts
Patterns
Recipes
Templates
Examples
Counterexamples
Reference Knowledge
```

---

## 51. Decision Model

No standalone Decision Runtime.

Use:

```text
simple deterministic decision
→ JSONata

complex deterministic decision
→ Script

semantic decision/recommendation
→ Skill → AI Runtime

complex cross-knowledge reasoning
→ Tool → dx-service
```

LLM output may influence routing only through validated structured output and domain-defined routing logic.

---

## 52. Validation Model

Structural validation:

```text
Ajv + JSON Schema
```

Domain deterministic validation:

```text
expr
or
script
```

Semantic quality validation:

```text
Skill → AI Runtime
```

No standalone Validator Runtime.

---

## 53. Knowledge Boundary

Small, stable, code-versioned knowledge:

```text
Skill references/assets
```

Knowledge requiring governance, retrieval, evolution or shared authority:

```text
Cairn
```

accessed by other domain products through Tools.

DomainHarness is not a knowledge base.

---

## 54. Generic DAG Boundary

Generic DAG execution is an **evidence-gated optional future Runtime capability**. DAG semantics and authoritative DAG state remain domain-owned.

### Tally example

Tally owns:

```text
Task
Task dependency meaning
Readiness rules
CompletionContract
Engineering authority
Evidence requirements
Re-plan semantics
```

Tally Active TaskDAG is authoritative runtime domain data and is not part of the DomainHarness Workflow definitionHash.

The default integration direction is that Tally computes readiness/completion/re-plan decisions using its own domain rules, while DomainHarness executes the resulting Workflow/Child Workflow work.

Only if real integration proves this insufficient may DomainHarness later add a generic execution projection such as:

```text
dependency satisfied
ready
running
done
failed
blocked
```

That projection must never become the authoritative source of Tally engineering truth.

### Cairn example

Cairn owns:

```text
EvidenceNeed
Source semantics
Extraction assurance
Fusion
Proposal
Promotion
```

Cairn may use Script/Tool logic plus Child Workflow and future Parallel Composition to execute dependency-ready work. A generic DAG primitive is added only if those mechanisms are proven insufficient; DomainHarness never decides knowledge truth.

---

## 55. Parallel Boundary

Static Parallel Composition is a required future capability.

It is not implemented in v0.1.

Future public API should remain domain-oriented, e.g.:

```yaml
invoke:
  parallel:
    site:
      workflow: site_generation
    image:
      workflow: image_generation
    video:
      workflow: video_generation

join: all
```

rather than exposing raw XState parallel-region syntax.

---

## 56. Non-goals

v0.1 explicitly does not provide:

- Agent Framework;
- autonomous agent loop;
- Multi-Agent Runtime;
- AI Gateway;
- Model Router;
- Knowledge Base;
- standalone Reasoning Engine;
- custom State Machine Engine;
- distributed Workflow Platform;
- generic BPM;
- static Parallel Composition;
- generic DAG Execution;
- dynamic spawn;
- full hierarchical XState DSL;
- history states;
- multiple databases;
- server;
- generic Admin Console;
- visual workflow designer;
- third-party untrusted plugin sandbox;
- arbitrary XState passthrough.

---

## 57. Success Criteria

### SC-01 — SDK Embedding

A business project can import:

```ts
import {
  createDomainHarness
} from "@kaicreator/domain-harness";
```

and load its own Harness.

### SC-02 — Asset Loading

Can load:

```text
harness.yaml
workflows/*.yaml
SKILL.md
skill.harness.yaml
references/
assets/
scripts/
JSON Schema
```

### SC-03 — Workflow

Workflow YAML validates, lowers and runs through XState v5.

### SC-04 — Step Types

Workflow can execute:

```text
skill
tool
script
expr
workflow
```

### SC-05 — Expressions

JSONata supports:

- input mapping;
- calculation;
- query;
- transformation;
- deterministic validation;
- conditional routing.

### SC-06 — Script Isolation

Script executes inside Worker and timeout/cancel terminates execution.

### SC-07 — Crash Recovery

After forced process termination:

- Run can resume;
- completed Steps do not rerun;
- idempotent Tools reuse idempotency key;
- non-idempotent interrupted Tools are not replayed;
- Child Workflow resumes without replaying completed internal Steps;
- incompatible definition/engine refuses resume.

### SC-08 — AI Runtime

Skill can execute through AIOperationPort and returned output is validated by DomainHarness.

### SC-09 — Provider Independence

No domain Harness depends on a specific LLM provider/model.

### SC-10 — XState Independence

Domain assets and host code do not require XState internal APIs/types/snapshot knowledge.

### SC-11 — Second Domain Validation

Before v0.1 Contract Finalization / Release Qualification, validate at least two clearly different domain projects.

Reference 1:

```text
Software Engineering / Tally-like
```

Reference 2:

```text
City Atlas
or another non-software-development domain
```

Second Harness must live outside the DomainHarness Runtime repository.

It must contain at least:

- 1 Skill;
- 1 Tool;
- 1 Expression or Script;
- 1 Waiting Event;
- 1 Child Workflow.

It must run without changing DomainHarness public contracts.

If a second domain requires domain-specific Runtime APIs, product contracts must be reviewed before release.

---

## 58. Cross-project Validation Targets

The Runtime architecture must be checked against these current domain patterns.

### Tally

Target fit:

```text
Domain Data
├── Active TaskDAG
├── EngineeringNode
├── CompletionContract
├── Evidence / Authority rules
└── Engineering Skills

Runtime
└── DomainHarness
```

v0.1 validates reusable Engineering Workflows / Nodes.

Generic DAG execution is future required work.

### Formula

Target fit:

```text
Generate / Refine / Adapt / Evaluate / Render
        ↓
Child Professional Workflows
        ↓
Creative / Semantic / Quality / Render
```

LLM outputs are structured proposals/results; Formula workflow retains authority.

### Cairn

Target fit:

```text
Knowledge Goal
→ EvidenceNeed
→ Extraction
→ Assurance
→ Fusion
→ Proposal
→ Review
→ Promotion
```

Child Workflow composition is expected to be useful immediately.

Parallel execution is a future required capability for multi-source workflows. Generic DAG execution remains evidence-gated and is not assumed by the v0.1 architecture.

### Forge

Target fit:

```text
Trade Content Harness
→ approved TradeCreativeBrief
→ Site / Image / Video Harnesses
```

v0.1 can compose individual workflows.

Static Parallel Composition is a future required capability for Site/Image/Video fan-out.

### City Atlas

Target fit:

```text
TaskDefinition
→ Primitive Composition
→ Ordered Workflow
→ Deterministic Decision
→ Action
```

This is the primary non-software-development v0.1 validation candidate.

---

## 59. Architecture Direction

```text
Domain Product
├── Domain Data
├── User UI
├── Admin Console
└── DomainHarness Runtime
      │
      ├── Loader
      │    ├── YAML
      │    ├── Zod
      │    ├── SKILL.md
      │    ├── Skill sidecar
      │    ├── Ajv / JSON Schema
      │    └── JSONata compile
      │
      ├── Compiler
      │    └── AST → XState v5
      │
      ├── Runner
      │    ├── start
      │    ├── send
      │    ├── wait
      │    ├── resume
      │    ├── cancel
      │    ├── get
      │    └── listRuns
      │
      ├── Step Executor
      │    ├── skill    → AI Runtime
      │    ├── tool     → Host Tool
      │    ├── script   → Worker
      │    ├── expr     → JSONata
      │    └── workflow → Child Workflow
      │
      └── Store
           └── SQLite
               ├── runs
               └── steps
```

---

## 60. Design Decisions and Reasons

### D1 — Domain Product has four layers

Decision:

```text
Domain Data
+ Domain Harness Runtime
+ User UI
+ Admin Console
```

Reason:

This reflects how existing domain products are actually structured and prevents the Runtime from absorbing domain semantics or UI concerns.

### D2 — Domain Data is broader than Skill

Reason:

Skill is only the AI capability unit.

Domain knowledge also includes workflows, DAGs, schemas, rules, constraints, patterns and validation.

### D3 — Skill remains atomic AI Operation

Reason:

Allowing Skill to contain Workflow/Tool/Skill recursion would create a second hidden orchestration/Agent framework.

### D4 — Child Workflow is added to v0.1

Reason:

Existing products already contain reusable domain subflows:

- Formula professional subflows;
- Cairn extraction/assurance subflows;
- Forge media harnesses;
- Tally engineering node flows.

Composition is already a real current requirement, not speculative future scope.

### D5 — Full nested XState DSL is still excluded

Reason:

Domain authors need reusable Workflows, not XState implementation concepts.

Child Workflow gives domain composition without leaking statechart internals.

### D6 — Parallel is required future scope but not v0.1

Reason:

Forge, Formula and Cairn have real parallel fan-out requirements.

However, parallel execution changes waiting/event/recovery/journal/output aggregation semantics substantially.

It is therefore intentionally staged after v0.1.

### D7 — Generic DAG Execution is evidence-gated future scope

Reason:

Tally and Cairn demonstrate dependency-driven domain work, but that does not yet prove the need for a first-class generic DAG Runtime.

Domain-owned readiness logic, Child Workflow and future Static Parallel Composition are the preferred baseline. A generic DAG primitive is introduced only after real integration provides evidence that these are insufficient.

Tally Active TaskDAG remains authoritative domain data and must not become a second DomainHarness state authority.

### D8 — LLM does not own transition authority

Reason:

Across Tally, Formula, Cairn, Forge and City Atlas, AI output is proposal/recommendation/content, while domain rules/governance retain authority.

### D9 — XState v5 stable is used now

Reason:

v6 remains a changing major line.

Keeping XState private makes later engine migration possible without changing Domain Harness contracts.

### D10 — Ajv + JSON Schema

Reason:

Domain contracts must be portable across:

- Runtime;
- AI Runtime;
- Tools;
- APIs;
- host applications.

### D11 — SQLite + journal

Reason:

XState snapshot alone does not guarantee safe side-effect recovery.

Step journal + Tool effect/idempotency semantics are required.

### D12 — Domain Admin Console is not part of DomainHarness

Reason:

A generic workflow console cannot replace domain-specific administration.

Runtime should expose inspection/trace/validation APIs; each domain product builds the proper admin UX.

---

## 61. Freeze Record

**Status: FROZEN — 2026-09-17**

The final delta adversarial review returned:

```text
GO — PRD 可以冻结
```

The final freeze incorporates:

1. explicit Workflow result contract using top-level JSONata `output`;
2. fixed terminal classification: `failed` is the only Runtime failure final;
3. Root output → `HarnessRun.output`;
4. Child output → Parent Step output;
5. deterministic per-invocation `workflowInstanceId` including parent visit identity;
6. idempotency keys derived from full Step identity;
7. same-Harness Child Workflow resolution and isolated Child `steps` / `run.visits`;
8. Static Parallel Composition retained as a required future capability;
9. Generic DAG Execution changed to evidence-gated optional future scope;
10. Tally Active TaskDAG explicitly retained as authoritative domain runtime data rather than DomainHarness definition state.

No remaining Blocking Issue is known at PRD level.

Next phase:

```text
DomainHarness v0.1 PRD — FROZEN
→ L2 Architecture Evidence
```
