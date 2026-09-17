# DomainHarness v0.1 — SDK Reference

> Audience: application engineers and coding agents integrating `@kaicreator/domain-harness` into another project.
>
> Status: v0.1 implementation contract. The package API/DSL described here is derived from the current `v0.1` source line. Release Qualification is tracked separately and does not change the integration contract below.

## 1. What the SDK is

DomainHarness is an embedded TypeScript/Node.js workflow runtime. A host application supplies domain-owned Tools and a provider-neutral AI operation adapter; DomainHarness loads a filesystem Harness definition and owns durable workflow execution, waiting/resume, journaling and recovery.

The SDK is intentionally **not**:

- a server or HTTP service;
- a generic DAG engine;
- a database abstraction layer;
- an AI provider/router;
- a domain model or business-authority replacement;
- a hostile-code sandbox.

The host/domain project remains authoritative for business rules, credentials, external systems and domain state.

## 2. Runtime requirements and package identity

Package:

```text
@kaicreator/domain-harness
```

Package version:

```text
0.1.0
```

Runtime:

```text
Node.js >= 22
ESM package
```

The package root exports only the supported public SDK. XState, SQLite store classes, Runner internals and recovery implementation types are private.

### 2.1 Pre-release consumption

Until a release tag/package publication is explicitly authorized, downstream projects should pin an **exact DomainHarness commit SHA** and consume a built tarball rather than depending on the moving `v0.1` branch.

Reference build flow:

```bash
git clone https://github.com/kaicreator-mm/domain-harness.git
cd domain-harness
git checkout <DOMAIN_HARNESS_SHA>
npm ci
npm test
npm pack -w @kaicreator/domain-harness
```

Then in the downstream project:

```bash
npm install /absolute/path/to/kaicreator-domain-harness-0.1.0.tgz
```

Record the exact DomainHarness SHA in the downstream repository's integration evidence/lock documentation. Do not silently move a consumer from one DomainHarness candidate SHA to another.

After a formal registry release exists, normal semver installation may replace this tarball flow.

## 3. Public exports

The package root exports:

```ts
DOMAIN_HARNESS_VERSION
createDomainHarness
CreateDomainHarnessOptions

JsonPrimitive
JsonArray
JsonObject
JsonValue
JsonSchema

HARNESS_ERROR_CODES
isHarnessErrorCode
HarnessError
HarnessErrorCode

DomainHarness
ExternalEvent
HarnessRun
ListRunsQuery
RunStatus
StartRunRequest
WaitOptions

HarnessTool
ToolContext
ToolEffect

AIOperationIdentity
AIOperationPort
AIOperationRequest
SkillResource
```

Do not import internal files from `dist/...` or `src/...`. Downstream code must import only from:

```ts
import { ... } from '@kaicreator/domain-harness';
```

## 4. Factory

```ts
import {
  createDomainHarness,
  type AIOperationPort,
  type HarnessTool,
} from '@kaicreator/domain-harness';

const runtime = await createDomainHarness({
  root: '/absolute/path/to/harness',
  sqlitePath: '/absolute/path/to/domain-harness.sqlite',
  ai,
  tools,
});
```

Options:

```ts
interface CreateDomainHarnessOptions {
  root: string;
  sqlitePath: string;
  ai: AIOperationPort;
  tools?: Readonly<Record<string, HarnessTool>>;
}
```

`root` is loaded and statically validated before the SQLite store is opened. Invalid Harness assets therefore fail startup before persistence migration/creation is allowed to become the side effect of a bad definition.

`sqlitePath` is deliberately a SQLite path, not a storage-provider interface. `:memory:` is useful for tests.

v0.1 does not expose a public `close()`/`dispose()` method. A normal host should treat one Runtime instance as process-lifetime infrastructure for its Harness/database rather than repeatedly constructing instances for individual requests.

## 5. Public lifecycle

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

Run statuses are exactly:

```text
running | waiting | completed | failed | cancelled
```

A returned Run has:

```ts
interface HarnessRun {
  runId: string;
  harnessId: string;
  workflowId: string;
  status: RunStatus;
  input: unknown;
  output?: unknown;
  error?: HarnessError;
  definitionHash: string;
  executionEngineMajor: number;
  createdAt: string;
  updatedAt: string;
}
```

### 5.1 Typical host flow

```ts
const started = await runtime.start({
  workflowId: 'main',
  input: { orderId: 'ORD-001' },
});

const settled = await runtime.wait(started.runId, { timeoutMs: 30_000 });

if (settled.status === 'waiting') {
  const next = await runtime.send(settled.runId, {
    type: 'approve',
    payload: { approvedBy: 'user-123' },
  });
  console.log(next.status, next.output);
}
```

### 5.2 Lifecycle rules

- `start()` creates a new root Run and starts driving it.
- `wait()` returns when the Run becomes `waiting` or terminal; it is not an external event API.
- `send()` is the only public way to satisfy a waiting state's declared external event.
- `resume()` is for persisted `running` work after interruption/restart; do not use it to simulate external events.
- `cancel()` persists terminal cancellation and propagates cancellation to active Tool/AI/Worker execution.
- `get()` and `listRuns()` are observation APIs.
- Rejected events must not be turned into ad-hoc transitions by host code.

## 6. Harness filesystem layout

A practical Harness root looks like:

```text
my-harness/
├─ harness.yaml
├─ workflows/
│  ├─ main.yaml
│  └─ quality_check.yaml
├─ skills/
│  └─ draft/
│     ├─ SKILL.md
│     ├─ skill.harness.yaml
│     ├─ input.schema.json        # optional
│     ├─ output.schema.json
│     └─ refs/
│        └─ context.md            # optional resource
├─ scripts/
│  └─ normalize.mjs
└─ schemas/
   └─ approval.schema.json
```

All referenced filesystem assets must remain inside the canonical Harness root. Absolute references and symlink/junction escapes are rejected.

## 7. `harness.yaml`

Schema:

```yaml
schemaVersion: "0.1"
id: my-domain
limits:
  maxSteps: 100
```

Rules:

- `schemaVersion` must be exactly `"0.1"`.
- `id` is a non-empty Harness identity.
- `limits.maxSteps` is a positive integer.
- `maxSteps` is a deterministic runaway-workflow bound; do not set it to an arbitrary huge value merely to hide loops.

## 8. Workflow files

Every `.yaml` / `.yml` file directly under `workflows/` becomes a Workflow. The filename without extension is its Workflow id.

Example:

```yaml
initial: draft
output: '{"result": steps.normalize, "approval": steps.await_approval}'

states:
  draft:
    invoke:
      skill: draft
      input: "input"
    on:
      done:
        - target: enrich

  enrich:
    invoke:
      tool: enrich_record
      input: "steps.draft"
    on:
      done:
        - target: normalize
      error:
        - target: failed

  normalize:
    invoke:
      script: scripts/normalize.mjs
      input: "steps.enrich"
    on:
      done:
        - target: quality

  quality:
    invoke:
      workflow: quality_check
      input: "steps.normalize"
    on:
      done:
        - target: await_approval

  await_approval:
    on:
      approve:
        schema: schemas/approval.schema.json
        target: completed

  completed:
    final: true

  failed:
    final: true
```

### 8.1 State ids

State ids must match:

```text
^[a-z][a-z0-9_]*$
```

Use stable semantic names. Do not embed timestamps, generated UUIDs or runtime data into state ids.

### 8.2 State categories

A state is one of:

1. **Executable state** — declares `invoke`.
2. **Waiting state** — no `invoke`, not final, declares one or more external events.
3. **Final state** — `final: true`, no invoke/transitions/events.

Executable states must declare at least one `on.done` route.

Waiting states cannot declare `done` or `error` routes.

External events are allowed only on waiting states.

Final states cannot invoke or transition.

At least one final state must be reachable. Unreachable states and invalid targets fail load-time validation.

### 8.3 `invoke`

Exactly one of the following is allowed:

```yaml
invoke:
  skill: some_skill
```

```yaml
invoke:
  tool: some_tool
```

```yaml
invoke:
  script: scripts/task.mjs
```

```yaml
invoke:
  expr: '{"value": input.value * 2}'
```

```yaml
invoke:
  workflow: child_workflow
```

Optional fields shared by invocation types:

```yaml
invoke:
  tool: some_tool
  input: '{"id": input.id}'
  timeoutMs: 10000
```

`input` is a JSONata expression. If omitted, the current Workflow frame input is passed through.

### 8.4 Routes

Direct route:

```yaml
on:
  done:
    target: completed
```

Route list:

```yaml
on:
  done:
    - target: retry
      when: "output.score < 0.8"
    - target: completed
```

When any route in a route set is conditional, the final route must be an unconditional fallback.

Conditions must evaluate to a strict boolean. Do not use truthy/falsy coercion as control-flow semantics.

For executable states, if `on.error` is omitted, v0.1 normalizes the error path to target a state named `failed`. Therefore the recommended Workflow convention is to declare:

```yaml
failed:
  final: true
```

If a Workflow needs domain-specific recoverable error behavior, declare an explicit `on.error` route instead.

## 9. JSONata expression scope

JSONata is used for:

- `invoke.input` mapping;
- `expr` Steps;
- route `when` expressions;
- Workflow top-level `output`.

### 9.1 Base scope

The base scope contains:

```json
{
  "input": "<current workflow frame input>",
  "steps": {
    "<stateId>": "<latest completed output for this workflow instance>"
  },
  "run": {
    "visits": {
      "<stateId>": 1
    }
  }
}
```

Examples:

```text
input.orderId
steps.lookup.customerId
run.visits.retry_state
```

### 9.2 Expression-Step scope

For an `expr` Step, `input` is the already mapped Step input. `steps` and `run.visits` remain available.

### 9.3 Route scope

A successful Step route additionally receives:

```text
output
```

An error route additionally receives:

```text
error
```

Example:

```yaml
on:
  done:
    - target: review
      when: "output.score < 0.8"
    - target: completed
```

### 9.4 Waiting-event route scope

Waiting event route expressions additionally receive:

```json
{
  "event": {
    "type": "approve",
    "payload": {}
  }
}
```

### 9.5 Determinism restrictions

- `$random` is forbidden.
- `$eval` is forbidden.
- `$now()` / `$millis()` use Runtime logical time for deterministic replay behavior.
- Route conditions must return a boolean.

Do not put external I/O inside expressions. External I/O belongs in Tools.

## 10. Skills

A Skill is a directory under `skills/<skillId>/`.

Required:

```text
SKILL.md
skill.harness.yaml
output schema
```

Example `skill.harness.yaml`:

```yaml
input:
  schema: input.schema.json
output:
  schema: output.schema.json
resources:
  - refs/context.md
profile: balanced
```

`input` is optional. `output` is required.

`resources` is a list of text files relative to the Skill directory.

`profile` is an optional provider-neutral string forwarded to the AI boundary. DomainHarness does not interpret it as a provider/model id.

### 10.1 AI adapter

The host provides:

```ts
interface AIOperationPort {
  execute(request: AIOperationRequest): Promise<JsonValue>;
}
```

Request:

```ts
interface AIOperationRequest {
  identity: {
    runId: string;
    workflowInstanceId: string;
    stepId: string;
    attempt: number;
  };
  skillId: string;
  instructions: string;
  resources: readonly { path: string; content: string }[];
  input: JsonValue;
  outputSchema: JsonSchema;
  profile?: string;
  signal: AbortSignal;
}
```

Adapter skeleton:

```ts
import type {
  AIOperationPort,
  AIOperationRequest,
  JsonValue,
} from '@kaicreator/domain-harness';

export class ProjectAIPort implements AIOperationPort {
  async execute(request: AIOperationRequest): Promise<JsonValue> {
    // Map this provider-neutral request to the project's AI Runtime/client.
    // Keep provider/model credentials and routing outside DomainHarness.
    // Honor request.signal.
    throw new Error('implement host AI adapter');
  }
}
```

The returned value is validated against the Skill output JSON Schema before it is accepted as Step output.

## 11. Tools

Tools are host code registered by id:

```ts
const tools = {
  load_customer: {
    effect: 'none',
    input: {
      type: 'object',
      required: ['customerId'],
      properties: {
        customerId: { type: 'string' },
      },
      additionalProperties: false,
    },
    output: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string' },
      },
      additionalProperties: false,
    },
    async execute(input, ctx) {
      ctx.signal.throwIfAborted();
      return { name: 'Example' };
    },
  },
} satisfies Record<string, HarnessTool>;
```

Contract:

```ts
interface HarnessTool<I = unknown, O = unknown> {
  input?: JsonSchema;
  output?: JsonSchema;
  effect: 'none' | 'idempotent' | 'non-idempotent';
  execute(input: I, ctx: ToolContext): Promise<O>;
}
```

Context:

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

### 11.1 Tool-effect choice

Use `none` when executing the Tool again is safe because it does not create an external side effect.

Use `idempotent` when the Tool may create an effect but the external API can deduplicate repeated execution using `ctx.idempotencyKey` or equivalent durable identity.

Use `non-idempotent` when automatic replay after an uncertain crash could duplicate an irreversible effect. If Runtime recovers a `started` non-idempotent Tool, it will not automatically call the Tool again; the Step materializes `interrupted` and follows its error route.

Do not falsely label a non-idempotent operation as idempotent merely to make recovery automatic.

Credentials, authorization checks, API clients and domain transactions stay in host Tool code.

## 12. Scripts

Script refs are files inside the Harness root, for example:

```yaml
invoke:
  script: scripts/normalize.mjs
  input: "steps.load"
```

A Script must default-export an async/sync function receiving one JSON value and returning a JSON value:

```js
export default async function execute(input) {
  return {
    ...input,
    normalized: true,
  };
}
```

Requirements:

- input/output must be portable JSON;
- `undefined`, `BigInt`, `NaN`, `Infinity`, functions and non-plain object values are invalid boundaries;
- each invocation runs in a fresh Node Worker;
- Worker environment is empty (`env: {}`);
- timeout/cancellation terminate the Worker;
- Scripts are trusted deterministic extensions, **not** a security sandbox.

Runtime execution uses the Script source frozen when the Harness was loaded and definition-hashed. Modifying the file after load does not change what that already-loaded Runtime executes; load a new Harness/Runtime definition when assets change.

Scripts should not become a hidden alternative Tool system. External I/O and irreversible side effects belong in Tools.

## 13. Expression Step

Use an `expr` Step for deterministic JSON transformations that are clearer in JSONata than in a Script:

```yaml
normalize:
  invoke:
    expr: >-
      {
        "id": input.id,
        "name": $trim(input.name),
        "visit": run.visits.normalize
      }
    input: "steps.load"
  on:
    done:
      target: completed
```

Prefer Expr over Script when the operation is a compact declarative projection/query/transformation. Prefer Script for deterministic logic that is materially clearer as code.

## 14. Child Workflow

```yaml
quality:
  invoke:
    workflow: quality_check
    input: "steps.normalize"
  on:
    done:
      target: completed
    error:
      target: failed
```

Rules:

- child Workflow must exist in the same Harness;
- child Workflow must declare top-level `output`;
- child dependency cycles are rejected at load time;
- Runtime also has recursion/depth defensive checks;
- child state/journal identity is isolated by deterministic `workflowInstanceId`;
- completed child internals are recovered/reused rather than restarted from scratch.

Use Child Workflow for reusable **sequential** subflows. Do not use it to emulate unsupported static parallelism or a generic DAG.

## 15. Waiting states and external events

Waiting state:

```yaml
await_approval:
  on:
    approve:
      schema: schemas/approval.schema.json
      target: completed
    reject:
      target: rejected
```

The corresponding host code is:

```ts
const run = await runtime.wait(runId);

if (run.status === 'waiting') {
  await runtime.send(runId, {
    type: 'approve',
    payload: { actorId: 'user-123' },
  });
}
```

Rules:

- only declared events are accepted;
- event payload is JSON Schema validated when a schema is declared;
- an accepted event is durably journaled as the waiting state's Step output;
- route selection and event acceptance are handled atomically;
- invalid/undeclared events must not be converted into host-side state changes.

## 16. Errors

Frozen error codes:

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

Shape:

```ts
interface HarnessError {
  code: HarnessErrorCode;
  message: string;
  details?: JsonValue;
}
```

Do not branch application logic on human-readable `message`. Use `code` and domain-specific Workflow outputs/events where appropriate.

## 17. Definition lock and deployment

Every Run persists:

```text
definitionHash
executionEngineMajor
```

The definition hash covers runtime-relevant Harness assets, including Workflow/Skill/schema/resource/Script content. Deployment filesystem location itself is not the semantic identity.

Implications for host projects:

- do not mutate Harness assets in place underneath a long-running Runtime;
- create/restart the Runtime with the new definition when changing assets;
- active persisted Runs may only continue under a compatible definition/engine;
- terminal historical Runs remain readable after definitions change;
- store the Harness assets in source control and review them like executable code.

## 18. SQLite ownership and recovery boundary

v0.1 uses one SQLite file actively driven by one DomainHarness process. It is not a multi-process distributed scheduler.

Host recommendations:

- allocate a dedicated SQLite path per Harness/runtime deployment;
- do not open the same file from multiple active DomainHarness processes as a coordination mechanism;
- keep the SQLite file on a real local filesystem appropriate for SQLite;
- back it up together with the exact Harness definition/release identity used to produce active Runs.

DomainHarness uses journal identity and effect classification for at-least-once recovery semantics. It does **not** claim universal exactly-once external effects.

## 19. Full minimal example

### `harness.yaml`

```yaml
schemaVersion: "0.1"
id: example-domain
limits:
  maxSteps: 50
```

### `workflows/main.yaml`

```yaml
initial: plan
output: '{"work": steps.normalize, "approval": steps.await_approval}'

states:
  plan:
    invoke:
      skill: planner
      input: "input"
    on:
      done:
        target: save

  save:
    invoke:
      tool: save_draft
      input: "steps.plan"
    on:
      done:
        target: normalize
      error:
        target: failed

  normalize:
    invoke:
      expr: '{"id": input.id, "title": $trim(input.title)}'
      input: "steps.save"
    on:
      done:
        target: await_approval

  await_approval:
    on:
      approve:
        schema: schemas/approval.schema.json
        target: completed

  completed:
    final: true

  failed:
    final: true
```

### `skills/planner/skill.harness.yaml`

```yaml
output:
  schema: output.schema.json
resources:
  - refs/policy.md
```

### Host assembly

```ts
import {
  createDomainHarness,
  type AIOperationPort,
  type HarnessTool,
} from '@kaicreator/domain-harness';

const ai: AIOperationPort = {
  async execute(request) {
    // delegate to host AI Runtime
    return { id: 'draft-1', title: 'Draft title' };
  },
};

const saveDraft: HarnessTool = {
  effect: 'idempotent',
  async execute(input, ctx) {
    // Pass ctx.idempotencyKey to the external write API when supported.
    return input;
  },
};

const harness = await createDomainHarness({
  root: new URL('./harness', import.meta.url).pathname,
  sqlitePath: './data/domain-harness.sqlite',
  ai,
  tools: {
    save_draft: saveDraft,
  },
});

const run = await harness.start({
  workflowId: 'main',
  input: { request: 'Create draft' },
});

const boundary = await harness.wait(run.runId);
if (boundary.status === 'waiting') {
  const finalRun = await harness.send(run.runId, {
    type: 'approve',
    payload: { actorId: 'user-123' },
  });
  console.log(finalRun.status, finalRun.output);
}
```

## 20. What downstream projects must not depend on

Do not depend on:

- XState machine objects/snapshots;
- SQLite table layout as an application API;
- Runner/Store/compiler classes;
- private child-frame representation;
- Worker bootstrap implementation;
- internal journal row shape;
- undocumented imports under package internals.

If a downstream integration appears to require one of those, first redesign it around the public SDK contract. If that is impossible, raise a DomainHarness contract issue rather than importing internals.

## 21. v0.1 deliberate non-goals

Do not ask an integration Agent to implement these inside a consuming project as "missing SDK pieces":

- static parallel composition;
- generic DAG scheduling;
- dynamic task spawn;
- distributed execution;
- PostgreSQL/storage abstraction;
- server/admin console;
- visual Workflow designer;
- full XState DSL passthrough;
- hostile-code sandboxing.

If a downstream project genuinely requires one of these, treat it as a new product/architecture decision rather than an integration workaround.
