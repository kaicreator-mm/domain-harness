# DomainHarness — Harness Technical Specification

> Chinese companion: `HARNESS_TECHNICAL_SPEC.zh-CN.md`.
>
> Status: v0.1 implementation-oriented specification derived from the frozen PRD, frozen L2 architecture and current public SDK/source. Where this document conflicts with frozen authority or executable source/tests, the frozen authority/source contract wins. This document does not add new v0.1 features.

## 1. Purpose

A **Harness** is the domain-owned executable definition consumed by DomainHarness Runtime.

It packages a stable domain workflow and the assets needed to execute it while keeping external side effects, credentials and provider strategy in the Host/AI Runtime.

A Harness is not:

- an entire domain database;
- an arbitrary plugin directory;
- a provider configuration bundle;
- an XState machine definition;
- a generic DAG language;
- a server application.

## 2. Harness root

Recommended layout:

```text
harness/
├─ harness.yaml
├─ workflows/
│  ├─ main.yaml
│  └─ child.yaml
├─ skills/
│  └─ generate/
│     ├─ SKILL.md
│     ├─ skill.harness.yaml
│     ├─ input.schema.json
│     ├─ output.schema.json
│     └─ references/
│        └─ context.md
├─ scripts/
│  └─ normalize.mjs
└─ schemas/
   └─ approval.schema.json
```

Only the manifest/workflow/Skill contract and explicitly referenced assets are semantically part of execution.

All referenced filesystem assets MUST resolve inside the canonical Harness root. Absolute escape, `..` escape after canonicalization and symlink/junction escape are rejected.

## 3. Load pipeline

The Runtime load pipeline is:

```text
filesystem root
→ canonical root validation
→ harness.yaml parsing
→ workflow discovery/parsing
→ Skill discovery/sidecar/resource loading
→ Script source loading/freezing
→ JSON Schema loading/compilation
→ JSONata parse/static inspection
→ Zod structural validation
→ cross-reference/static graph validation
→ normalized Harness AST
→ definitionHash
→ private compilation
```

Invalid definitions fail before normal Runtime use begins.

The Loader is expected to detect, at minimum:

- unknown schema version;
- malformed manifest/workflow/sidecar;
- invalid state identifiers;
- missing initial state;
- invalid transition targets;
- unreachable states;
- no reachable final state;
- missing Skill/Tool/Script/Child Workflow references;
- missing required Skill output schema;
- invalid JSON Schema;
- invalid/forbidden JSONata;
- Child Workflow dependency cycles;
- Child Workflow missing required top-level `output`;
- invalid waiting/executable/final state combinations;
- referenced asset path escaping Harness root.

## 4. `harness.yaml`

v0.1 manifest:

```yaml
schemaVersion: "0.1"
id: my-domain
limits:
  maxSteps: 100
```

Rules:

- `schemaVersion` MUST be exactly `"0.1"`;
- `id` MUST be non-empty and stable for the Harness identity;
- `limits.maxSteps` MUST be a positive integer;
- Workflow and Skill files do not carry independent Runtime schema versions in v0.1.

`maxSteps` bounds accepted logical work, not process retries or CPU instructions. It exists to prevent runaway workflow execution and should be sized to the largest legitimate Critical Journey with reasonable headroom.

## 5. Workflow identity and discovery

Each direct `.yaml` / `.yml` file under `workflows/` defines one Workflow. The filename without extension is the Workflow id.

Example:

```text
workflows/main.yaml     → workflowId = main
workflows/quality.yaml  → workflowId = quality
```

A Workflow contains:

```yaml
initial: <state-id>
output: <optional JSONata expression>
states:
  <state-id>:
    ...
```

A Workflow used as a Child MUST define top-level `output`.

## 6. State identifiers

State ids follow:

```text
^[a-z][a-z0-9_]*$
```

Ids should be stable semantic identifiers such as:

```text
load_context
build_proposal
await_approval
commit
completed
failed
```

Do not use runtime-generated values, timestamps or UUIDs in state ids; state ids participate in durable Step identity and definition semantics.

## 7. State categories

Every state is exactly one of these categories.

### 7.1 Executable state

Declares one `invoke` and at least one `on.done` route.

```yaml
normalize:
  invoke:
    expr: '{"value": input.value}'
  on:
    done:
      - target: completed
```

An executable state may also declare `on.error`.

If `on.error` is omitted, v0.1 normalizes the execution error path to a state named `failed`; authors should therefore normally provide a reachable `failed: { final: true }` when relying on default error routing.

### 7.2 Waiting state

Has no `invoke`, is not final and declares one or more external event routes.

```yaml
await_approval:
  on:
    approve:
      schema: schemas/approval.schema.json
      target: completed
    reject:
      target: rejected
```

Waiting states cannot use `done`/`error` routes.

### 7.3 Final state

```yaml
completed:
  final: true
```

A final state has no invoke or transitions.

The final state whose id is exactly `failed` is the single Runtime-failure terminal. Every other reachable final state is a successful Runtime completion, even if the domain outcome is negative, such as `rejected`, `abstained` or `not_recommended`.

## 8. Invocation model

An executable state declares **exactly one** of five invocation kinds.

### 8.1 Skill

```yaml
invoke:
  skill: classify
  input: '{"text": input.text}'
  timeoutMs: 30000
```

### 8.2 Tool

```yaml
invoke:
  tool: load_record
  input: '{"id": input.id}'
```

### 8.3 Script

```yaml
invoke:
  script: scripts/normalize.mjs
  input: "steps.load_record"
```

### 8.4 Expression

```yaml
invoke:
  expr: '{"score": input.a + input.b}'
```

### 8.5 Child Workflow

```yaml
invoke:
  workflow: quality_review
  input: "steps.generate"
```

`invoke.input` is JSONata. If omitted, the current Workflow frame input is passed through.

A state cannot invoke multiple kinds or multiple instances in v0.1.

## 9. Route model

Direct route form:

```yaml
on:
  done:
    target: completed
```

List form:

```yaml
on:
  done:
    - target: review
      when: "output.score < 0.8"
    - target: completed
```

Routes are evaluated in order.

If any route in a route set uses `when`, the final route MUST provide an unconditional fallback.

A `when` expression MUST return a strict boolean; truthy/falsy coercion is not workflow semantics.

Error routes follow the same ordered/fallback model.

## 10. Runtime expression scope

The base JSONata scope is conceptually:

```json
{
  "input": "<current workflow frame input>",
  "steps": {
    "<stateId>": "<latest completed output in this workflow instance>"
  },
  "run": {
    "visits": {
      "<stateId>": 1
    }
  }
}
```

Additional bindings:

- successful route: `output`;
- error route: `error`;
- waiting-event route: `event`.

The Runtime does not expose a general mutable `assign` API. Derived state should be represented explicitly by an `expr` Step or Script result.

## 11. JSONata restrictions

JSONata is used for:

- `invoke.input`;
- `expr` Step bodies;
- route `when`;
- top-level Workflow `output`.

v0.1 restrictions:

```text
$random  → forbidden
$eval    → forbidden
external I/O extensions → not registered
route predicate → strict boolean
$now/$millis → Runtime logical time
```

Expressions are parsed/compiled during Harness loading where applicable and executed behind the Runtime's bounded worker/evaluation boundary.

## 12. Skill contract

A Skill lives at:

```text
skills/<skillId>/
```

Invokable Skill minimum:

```text
SKILL.md
skill.harness.yaml
required output JSON Schema
```

Example sidecar:

```yaml
input:
  schema: input.schema.json
output:
  schema: output.schema.json
resources:
  - references/context.md
profile: high-quality-generation
```

Supported sidecar concepts:

- optional input schema;
- required output schema;
- optional declared resources;
- optional opaque `profile`.

Runtime semantics:

> One Skill Step = one `AIOperationPort.execute()` operation.

The generated request contains a provider-neutral identity, Skill instructions/resources, JSON input, output schema, optional profile and `AbortSignal`.

A Skill MUST NOT hide a durable Tool call, call another Harness Skill, own a nested Workflow or choose arbitrary Workflow transitions.

## 13. AI operation contract

Provider-neutral identity:

```ts
interface AIOperationIdentity {
  runId: string;
  workflowInstanceId: string;
  stepId: string;
  attempt: number;
}
```

The Host supplies:

```ts
interface AIOperationPort {
  execute(request: AIOperationRequest): Promise<JsonValue>;
}
```

AI Runtime/provider logic is outside Harness definition. The returned JSON value must satisfy the Skill output schema before it becomes a valid Step output.

## 14. Tool contract

Host Tools are registered by name in application code.

Public shape:

```ts
interface HarnessTool<I = unknown, O = unknown> {
  input?: JsonSchema;
  output?: JsonSchema;
  effect: 'none' | 'idempotent' | 'non-idempotent';
  execute(input: I, ctx: ToolContext): Promise<O>;
}
```

ToolContext provides:

```text
runId
workflowInstanceId
stepId
attempt
idempotencyKey
signal
now()
```

The Tool implementation must honor the declared contract.

### `effect:none`

No externally visible side effect. Interrupted execution may be replayed.

### `effect:idempotent`

A repeated execution using the same logical identity/idempotency key must be safe according to the Tool's external semantics.

### `effect:non-idempotent`

If the Runtime crashes after `started` but before a terminal journal result, automatic replay is forbidden because the external effect may already have happened.

## 15. Script contract

Script is trusted deterministic code for complex logic unsuitable for JSONata.

Current v0.1 executable asset is JavaScript ESM, commonly `.mjs`:

```js
export default async function execute(input) {
  return { ...input, normalized: true };
}
```

Requirements:

- default export is callable;
- input/output are JSON-serializable;
- source is loaded/frozen with the Harness definition;
- no external I/O by domain contract;
- each invocation gets a fresh Worker;
- bounded timeout/resource behavior;
- `AbortSignal` termination;
- `env: {}` worker environment;
- Runtime does not transpile TypeScript Script files at execution time.

Worker isolation is not a hostile-code sandbox. Scripts are trusted repository code.

## 16. Expression Step contract

Expression is preferred for simple deterministic JSON transformations and checks.

```yaml
invoke:
  expr: '{"total": input.price * input.quantity}'
```

Expression Step input is first mapped through `invoke.input` if provided. The `expr` body then evaluates against the Step input with `steps`/`run` context available according to Runtime scope rules.

Use Script instead when the deterministic algorithm becomes difficult to audit in JSONata.

## 17. Child Workflow contract

Child Workflow is sequential same-Harness composition.

Rules:

- referenced Workflow must exist in the same Harness;
- referenced Workflow must define top-level `output`;
- child input is exactly the evaluated parent `invoke.input`;
- child scope is isolated from parent `steps`;
- no recursive/cyclic Workflow dependencies;
- no dynamic spawn;
- no parallel child execution in v0.1.

Child identity is deterministic from parent workflow instance, parent state and visit.

The parent sees Child Workflow as one logical Step, while child internal Steps remain separately journaled for recovery.

## 18. Workflow output

Top-level:

```yaml
output: '{"result": steps.commit}'
```

On a successful final state:

```text
workflow.output expression
→ Workflow Result
```

For root Workflow:

```text
Workflow Result → HarnessRun.output
```

For Child Workflow:

```text
Workflow Result → Parent workflow Step output
```

The Runtime does not implicitly expose the child's full internal `steps` and does not assume the last Step output is the Workflow result.

## 19. Waiting event contract

An external event is accepted only when:

- Run status is `waiting`;
- current state declares that event type;
- optional event payload schema validates;
- route evaluation succeeds.

Accepted event payload becomes the output of the waiting state and is persisted atomically with the transition.

Rejected sends MUST cause zero durable mutation.

Host applications should perform domain authorization before calling `send()`; DomainHarness validates workflow/event contract, not product user permissions.

## 20. Logical time

Deterministic time prevents recovery from changing route results.

Evaluation clock:

- executable Step visit: persisted `started_at`;
- accepted waiting event: persisted event acceptance timestamp;
- Workflow output: frame `lastDecisionAt`;
- initially-final Workflow: Run creation time fallback.

`ToolContext.now()` and deterministic expression time are Runtime-controlled logical time surfaces, not a guarantee that the host wall clock never changes.

## 21. Step identity and visits

Logical identity:

```text
(runId, workflowInstanceId, stateId, visit)
```

`visit` increments for each accepted logical visit to a state. It is not the same as execution `attempt`.

`attempt` may increase when replayable work is actually retried. A completed Step reused after recovery remains the same logical Step.

This distinction is required for stable idempotency and `maxSteps` accounting.

## 22. `maxSteps`

`limits.maxSteps` counts accepted logical work/visits according to Runtime semantics, including accepted waiting-event visits. It is not a retry counter.

When exceeded, Runtime uses:

```text
step_limit_exceeded
```

Authors should fix accidental loops instead of simply increasing the limit without evidence.

## 23. Persistence model

Conceptual tables:

```text
runs
steps
```

Run durability includes:

- status;
- input/output/error;
- definitionHash;
- executionEngineMajor;
- portable control/frame state;
- timestamps.

Step durability includes:

- logical identity;
- kind/status/attempt;
- started/completed time;
- normalized input/output/error;
- stable idempotency key.

SQLite transaction boundaries never wrap Tool/AI/Worker execution.

## 24. Recovery matrix

| Journal state | Step kind | v0.1 behavior |
|---|---|---|
| terminal completed | all | reuse; never execute again |
| started | expr | replay allowed |
| started | script | replay allowed |
| started | skill | replay allowed |
| started | tool `none` | replay allowed |
| started | tool `idempotent` | replay using stable identity/key |
| started | tool `non-idempotent` | no auto-replay; `interrupted` error path |
| active child | workflow | resume persisted child frame/journal, do not restart child from beginning |

Exactly-once is not claimed.

## 25. Definition lock

Active Runs store:

```text
definitionHash
executionEngineMajor
```

`definitionHash` covers Runtime-relevant definition content, including Workflow/Skill/schema/resource/Script content, while excluding deployment absolute paths and host Tool implementation code.

Continuation mismatch is rejected. There is no v0.1 automatic active-run migration.

## 26. Cancellation

`cancel(runId)`:

- serializes with other mutations for the same Run;
- propagates cancellation through `AbortSignal` to active Tool/AI/Worker paths where supported;
- persists terminal `cancelled`;
- fences later executor completion from overwriting terminal Run state.

Cancellation is a Runtime lifecycle outcome, not a domain final state authored in YAML.

## 27. Public lifecycle API

```ts
interface DomainHarness {
  start(request: StartRunRequest): Promise<HarnessRun>;
  send(runId: string, event: ExternalEvent): Promise<HarnessRun>;
  wait(runId: string, options?: WaitOptions): Promise<HarnessRun>;
  resume(runId: string): Promise<HarnessRun>;
  cancel(runId: string): Promise<HarnessRun>;
  get(runId: string): Promise<HarnessRun | null>;
  listRuns(query?: ListRunsQuery): Promise<HarnessRun[]>;
}
```

Statuses:

```text
running
waiting
completed
failed
cancelled
```

XState/Store/Runner/recovery internals are not public SDK.

## 28. Error contract

Public normalized error codes are exactly:

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

Public error shape:

```ts
interface HarnessError {
  code: HarnessErrorCode;
  message: string;
  details?: JsonValue;
}
```

Domain-specific negative outcomes SHOULD normally be successful final states/outputs rather than inventing Runtime error codes.

## 29. v0.1 exclusions

The Harness language does not support:

- Static Parallel Composition;
- generic DAG execution;
- dynamic spawn;
- full hierarchical XState DSL;
- history state;
- `after`/`always`/entry/exit action DSL;
- multiple invokes per state;
- distributed execution;
- cross-Harness Child Workflow;
- general mutable context assignment;
- arbitrary plugin execution model.

Do not emulate excluded features through undocumented internals.

## 30. Compatibility rules

Downstream projects should pin the DomainHarness package/source version used to validate a Harness.

A compatible rollout must consider:

```text
Runtime package version
executionEngineMajor
Harness definitionHash
Host Tool behavior compatibility
active Run population
```

Because Tool implementation code is not included in `definitionHash`, Host owners must drain/cancel active Runs or preserve behaviorally compatible Tools when deploying a breaking Tool implementation change.

## 31. Technical validation checklist

Before using a Harness in a real project:

- manifest loads with schemaVersion `0.1`;
- all Workflows are statically valid and reachable;
- all referenced Skills/Tools/Scripts/Child Workflows exist;
- every Child Workflow declares output;
- JSON Schemas compile;
- JSONata parses and contains no forbidden functions;
- Tool effects are classified correctly;
- Script assets are trusted and deterministic by contract;
- waiting event schemas/routes are validated;
- root Workflow has expected output semantics;
- `maxSteps` covers legitimate flow without hiding loops;
- one normal Critical Journey passes;
- one failure route passes;
- one waiting/send path passes;
- crash recovery is tested for important Tool effect classes;
- definition mismatch behavior is understood;
- downstream code imports package root only.

## 32. Related documents

- `HARNESS_AUTHORING_GUIDE.md`
- `../architecture/DomainHarness_ARCHITECTURE.md`
- `../domain-data/DOMAIN_DATA_SPEC.md`
- `../sdk/DomainHarness_v0.1_SDK_REFERENCE.md`
- `../operations/DomainHarness_v0.1_STORAGE_RECOVERY.md`
