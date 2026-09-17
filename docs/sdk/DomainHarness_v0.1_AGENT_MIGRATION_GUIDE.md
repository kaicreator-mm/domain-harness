# DomainHarness v0.1 — Agent Migration Guide

> Purpose: give a coding Agent enough contract, boundaries and workflow to refactor an existing project onto DomainHarness without moving domain authority into the SDK or relying on private Runtime internals.
>
> Use together with `DomainHarness_v0.1_SDK_REFERENCE.md`.

## 1. Migration goal

A successful migration does **not** mean "rewrite the project as workflows".

It means:

1. preserve the project's domain model, APIs, database and business authority;
2. identify deterministic orchestration that currently lives in controllers/services/jobs/prompts;
3. express only that orchestration through DomainHarness primitives;
4. keep external I/O and side effects behind host Tools;
5. keep AI provider/model routing behind the project's AI Runtime adapter;
6. preserve application-facing contracts unless the project explicitly approves a contract change;
7. migrate incrementally by Critical Journey rather than replacing the whole application at once.

## 2. First decision: should this logic move into DomainHarness?

Use this table before changing code.

| Existing concern | DomainHarness mapping | Keep outside DomainHarness when... |
|---|---|---|
| LLM prompt + structured response | Skill | it is provider/runtime infrastructure rather than domain capability |
| REST/DB/file/queue/payment/etc. call | Tool | never move credentials or client ownership into Harness assets |
| JSON projection/filter/routing expression | Expr / route `when` | it requires external I/O |
| deterministic trusted code | Script | it performs external side effects or needs secret-bearing host context |
| reusable sequential sub-process | Child Workflow | it is actually independent parallel/DAG work |
| human/system approval or external callback | Waiting state + event | the event is merely an implementation detail already resolved synchronously |
| domain entity state machine | usually keep in domain | DomainHarness must not become the authoritative business data model |
| provider/model selection | AI Runtime / host adapter | never encode provider routing in Workflow YAML |
| secret/credential handling | host code | never place secrets in SKILL/resources/Workflow/Run input merely for convenience |

### Strong rule

If the code answers **"what does this business entity mean / what is valid domain state?"**, it probably remains in the domain project.

If the code answers **"what execution step comes next, what should be invoked, how do we wait/recover?"**, it is a candidate for DomainHarness.

## 3. Required inputs for the Agent

Before implementation, gather:

- exact DomainHarness commit SHA to integrate;
- SDK Reference file from that SHA;
- current project architecture and domain authority boundaries;
- one Critical Journey to migrate first;
- current tests for that journey;
- existing AI abstraction/AI Runtime boundary;
- existing external side-effect integrations;
- persistence/transaction ownership rules;
- project coding/CI standards.

Do not start by generating Workflow YAML from source code automatically. First create a migration map and have it reviewed.

## 4. Phase A — inventory the current journey

For one journey, produce a table like:

| Current step | Current implementation | Side effect? | Retry/idempotency | Proposed primitive |
|---|---|---:|---|---|
| classify request | prompt in service | no | replayable | Skill |
| load customer | repository/API | read only | replayable | Tool `effect:none` |
| calculate fields | utility function | no | replayable | Expr or Script |
| create external order | API write | yes | provider supports key | Tool `effect:idempotent` |
| charge legacy system | external irreversible call | yes | no safe dedupe | Tool `effect:non-idempotent` |
| approval | controller polling | external event | n/a | Waiting Event |

The Agent must explicitly justify every Tool `effect` classification.

## 5. Phase B — define the Harness asset root

Recommended project layout:

```text
<project>/
├─ src/
│  ├─ domain/                 # existing domain authority
│  ├─ infrastructure/         # DB/API/queues/etc.
│  └─ harness/
│     ├─ runtime.ts           # SDK assembly/adapters
│     ├─ tools/               # host Tool implementations
│     └─ ai-port.ts           # provider-neutral adapter
├─ harness/
│  ├─ harness.yaml
│  ├─ workflows/
│  ├─ skills/
│  ├─ scripts/
│  └─ schemas/
└─ tests/
```

The exact project layout may vary, but keep this ownership split:

```text
Harness assets = declarative executable definition
Host TypeScript = adapters, side effects, credentials, domain services
Domain model = existing project authority
```

Do not put `.env`, tokens, DB credentials or private client configuration under the Harness root.

## 6. Phase C — create the runtime adapter

Create exactly one application-owned assembly point.

Example:

```ts
import {
  createDomainHarness,
  type AIOperationPort,
  type HarnessTool,
} from '@kaicreator/domain-harness';

import { createProjectAIPort } from './ai-port.js';
import { buildProjectTools } from './tools/index.js';

export async function createProjectHarness() {
  const ai: AIOperationPort = createProjectAIPort();
  const tools: Record<string, HarnessTool> = buildProjectTools();

  return createDomainHarness({
    root: new URL('../../harness', import.meta.url).pathname,
    sqlitePath: process.env.DOMAIN_HARNESS_DB ?? './data/domain-harness.sqlite',
    ai,
    tools,
  });
}
```

This file is the integration seam. Application code should not instantiate Loader, SqliteStore, Runner, XState or other internals itself.

## 7. Phase D — implement Tools as adapters, not new domain layers

A Tool should be thin:

```ts
import type { HarnessTool } from '@kaicreator/domain-harness';
import { customerRepository } from '../../infrastructure/customer-repository.js';

export const loadCustomerTool: HarnessTool<
  { customerId: string },
  { customerId: string; name: string }
> = {
  effect: 'none',
  async execute(input, ctx) {
    ctx.signal.throwIfAborted();
    const customer = await customerRepository.get(input.customerId);
    return {
      customerId: customer.id,
      name: customer.name,
    };
  },
};
```

Do not duplicate domain validation already owned by domain services unless the Tool boundary needs input/output schema validation.

### Idempotent write example

```ts
export const createOrderTool: HarnessTool = {
  effect: 'idempotent',
  async execute(input, ctx) {
    return orderGateway.create(input, {
      idempotencyKey: ctx.idempotencyKey,
      signal: ctx.signal,
    });
  },
};
```

### Non-idempotent write example

```ts
export const legacyChargeTool: HarnessTool = {
  effect: 'non-idempotent',
  async execute(input, ctx) {
    return legacyBilling.charge(input, { signal: ctx.signal });
  },
};
```

Do not add host-side automatic retries around `non-idempotent` Tools unless the domain integration itself provides a proven deduplication contract. Crash replay is deliberately blocked for this class.

## 8. Phase E — adapt AI without leaking providers

The project adapter receives a provider-neutral request and maps it to the project's existing AI Runtime.

```ts
import type {
  AIOperationPort,
  AIOperationRequest,
  JsonValue,
} from '@kaicreator/domain-harness';

export class ProjectAIPort implements AIOperationPort {
  constructor(private readonly runtime: ProjectAIRuntime) {}

  async execute(request: AIOperationRequest): Promise<JsonValue> {
    return this.runtime.executeDomainOperation({
      operationId: request.skillId,
      instructions: request.instructions,
      resources: request.resources,
      input: request.input,
      outputSchema: request.outputSchema,
      profile: request.profile,
      execution: request.identity,
      signal: request.signal,
    });
  }
}
```

The exact host AI Runtime API is project-specific. The invariant is:

```text
DomainHarness knows Skill intent and schema
Host AI Runtime knows provider/model/routing/credentials
```

Never add fields such as `model: gpt-*` or provider API keys to Workflow YAML just because a particular project currently uses that model.

## 9. Phase F — move prompt assets into Skills

For each AI capability:

```text
harness/skills/<skill-id>/
├─ SKILL.md
├─ skill.harness.yaml
├─ output.schema.json
└─ refs/...
```

A migration Agent should preserve domain prompt content before improving it. Separate "move to Skill" from "rewrite the prompt" into different concerns unless prompt change is explicitly required.

Example sidecar:

```yaml
input:
  schema: input.schema.json
output:
  schema: output.schema.json
resources:
  - refs/domain-policy.md
profile: default
```

Skill output should be structured and schema-validatable. Avoid Skills whose only output is unstructured prose if downstream control flow depends on that prose.

## 10. Phase G — convert orchestration to Workflow YAML

Start with the simplest correct sequential flow.

Example:

```yaml
initial: analyze
output: '{"decision": steps.decide, "approval": steps.await_approval}'

states:
  analyze:
    invoke:
      skill: analyze_request
      input: "input"
    on:
      done:
        target: load_context

  load_context:
    invoke:
      tool: load_context
      input: "steps.analyze"
    on:
      done:
        target: decide
      error:
        target: failed

  decide:
    invoke:
      expr: >-
        {
          "requestId": input.requestId,
          "approved": input.score >= 0.8
        }
      input: "steps.load_context"
    on:
      done:
        - target: await_approval
          when: "output.approved = false"
        - target: completed

  await_approval:
    on:
      approve:
        schema: schemas/approval.schema.json
        target: completed
      reject:
        target: rejected

  completed:
    final: true
  rejected:
    final: true
  failed:
    final: true
```

Do not mechanically reproduce every old service method as a state. Workflow states should correspond to durable orchestration decisions/steps, not implementation trivia.

## 11. Phase H — choose Expr vs Script deliberately

Use Expr when:

- transformation is compact;
- data is JSON;
- logic is naturally declarative;
- no side effect exists.

Use Script when:

- deterministic logic is clearer in code;
- JSONata would become difficult to review;
- the operation remains pure/trusted and JSON-in/JSON-out.

Use Tool when:

- network/filesystem/DB/queue/external state is touched;
- credentials are needed;
- an irreversible business side effect occurs.

### Anti-pattern

Do not place `fetch()`, database clients or secrets inside Scripts to avoid writing a Tool. Script Worker isolation is not a business integration boundary.

## 12. Phase I — convert callbacks/approvals to waiting events

Old code often uses:

- polling flags;
- database "pending" jobs;
- ad-hoc callback endpoints;
- controller-level state booleans.

After migration, the domain-facing callback may remain an HTTP endpoint, but its orchestration action should become:

```ts
await harness.send(runId, {
  type: 'approve',
  payload: request.body,
});
```

The HTTP/API layer remains responsible for authentication and authorization **before** sending the event.

DomainHarness validates the event declaration/schema and owns the durable workflow transition; it does not authenticate the human/system actor.

## 13. Phase J — Child Workflow extraction

Extract a Child Workflow only when a sequence is genuinely reusable or independently understandable.

Good:

```text
main → quality_check → await_approval
```

Bad:

```text
main → child_for_every_single_function_call
```

Child Workflows are sequential composition in v0.1. Do not simulate parallel fan-out/fan-in with multiple Child Workflows and hidden host coordination.

## 14. Application API migration patterns

### Pattern A — synchronous caller that may reach waiting

```ts
const started = await harness.start({ workflowId: 'main', input });
const boundary = await harness.wait(started.runId, { timeoutMs: 30_000 });

return {
  runId: boundary.runId,
  status: boundary.status,
  output: boundary.output,
};
```

### Pattern B — async background process

Store the `runId` in the project's domain/application record and observe with `get()`/`wait()`. Do not copy DomainHarness journal tables into project-owned tables.

### Pattern C — external callback

```ts
await authorizeCallback(actor, runId);
return harness.send(runId, {
  type: 'provider_callback',
  payload,
});
```

### Pattern D — process restart

On startup, project recovery logic may identify persisted `running` Runs and call `resume(runId)` under the same compatible Harness definition. Do not call `resume()` on arbitrary waiting Runs as a substitute for an event.

## 15. Migration safety rules for Agents

A coding Agent MUST NOT:

1. change DomainHarness public API to make one project migration easier without a separate upstream contract decision;
2. import XState or internal DomainHarness store/runner/compiler classes in the consumer;
3. write directly into DomainHarness SQLite tables;
4. move provider/model routing into Harness assets;
5. move project credentials into Harness assets;
6. relabel unsafe writes as `idempotent` without evidence;
7. implement static parallelism, generic DAG or dynamic spawn in consumer wrappers;
8. use Script as an unreviewed side-effect escape hatch;
9. duplicate the project's authoritative domain state into Workflow YAML;
10. delete the old implementation before equivalent tests/Critical Journey validation passes.

## 16. Incremental migration strategy

Recommended order:

### M0 — contract-only integration

- add package/tarball dependency pinned to exact SHA;
- add runtime assembly file;
- add fake/adapter AI port;
- no production path switched yet.

### M1 — one low-risk journey

Choose a sequential journey with:

- limited external writes;
- existing tests;
- clear start/end;
- at most one waiting boundary.

Run old and new implementations against the same fixtures when possible.

### M2 — side-effect journey

Add idempotent/non-idempotent Tool classification and crash/recovery tests.

### M3 — approval/callback journey

Move existing callback/polling state to a waiting state + `send()` integration.

### M4 — reusable Child Workflows

Extract shared sequential subflows only after multiple migrated journeys prove the reuse boundary.

Do not start by migrating the project's most complicated workflow.

## 17. Required test matrix for a downstream migration

At minimum, create tests for:

### Definition load

- valid Harness loads;
- missing Tool registration fails startup;
- invalid Skill schema/resource fails startup;
- invalid target/unreachable state fails startup.

### Happy path

- `start → completed` for a no-wait journey;
- output matches existing application contract.

### Waiting path

- `start → waiting`;
- invalid event rejected;
- invalid payload rejected;
- valid `send()` continues exactly once;
- final output correct.

### Tool effects

- `none` Tool returns expected output;
- idempotent Tool receives stable `idempotencyKey` during replay test;
- non-idempotent interrupted case does not duplicate external effect.

### AI

- Skill request contains expected instructions/resources/input/schema;
- fake AI output violating schema is rejected;
- provider-specific configuration remains outside Harness assets.

### Script/Expr

- JSON boundary enforced;
- deterministic output;
- timeout/error route behavior.

### Restart/recovery

- persisted `running` Run resumes under same definition;
- changed definition refuses continuation;
- completed work is not duplicated.

### Domain authority

- existing domain invariants still pass outside DomainHarness;
- no new DomainHarness table/Workflow file becomes the authoritative source for domain entities.

## 18. Migration acceptance checklist

A migration concern is complete only when all applicable statements are true:

- [ ] Exact DomainHarness SHA is recorded.
- [ ] Dependency is reproducible from clean checkout.
- [ ] One application-owned Runtime assembly point exists.
- [ ] AI provider/model routing remains outside DomainHarness.
- [ ] Every external side effect is a Tool.
- [ ] Every Tool has reviewed effect classification.
- [ ] Credentials/secrets remain outside Harness assets/journal inputs.
- [ ] Skills have output schemas.
- [ ] Workflow loads with no static-validation errors.
- [ ] Conditional routes have unconditional fallback.
- [ ] Waiting events have explicit schema where payload structure matters.
- [ ] Child Workflows are same-Harness sequential subflows only.
- [ ] No internal SDK import exists.
- [ ] Old journey tests still pass or have equivalent replacements.
- [ ] Crash/recovery behavior is tested for write paths.
- [ ] Domain authority remains in the original project.
- [ ] Migration evidence includes changed files, tests and Critical Journey result.

## 19. Recommended Git/Task structure for downstream projects

For a substantial migration, do not use one giant branch.

Suggested issue/PR sequence:

```text
DH-01 dependency + runtime assembly
DH-02 AI port adapter
DH-03 Tool adapters for journey A
DH-04 Harness assets for journey A
DH-05 application integration switch for journey A
DH-06 recovery/negative tests
DH-07 validation + old-path removal
```

Dependencies should be explicit in the downstream Task DAG/Issues.

Keep each PR one concern. Do not combine SDK adoption with unrelated business feature work.

## 20. Agent handoff prompt template

Copy and adapt this prompt into the downstream project's coding-agent issue/task.

```text
You are migrating <PROJECT>/<JOURNEY> to DomainHarness v0.1.

DomainHarness source of truth:
- repository: https://github.com/kaicreator-mm/domain-harness
- exact SHA: <DOMAIN_HARNESS_SHA>
- SDK reference: docs/sdk/DomainHarness_v0.1_SDK_REFERENCE.md
- migration guide: docs/sdk/DomainHarness_v0.1_AGENT_MIGRATION_GUIDE.md

Project source of truth:
- repository: <PROJECT_REPO>
- project development standard: <PINNED_STANDARD_OR_AGENTS_MD>
- domain authority: <FILES/MODULES/SERVICES THAT MUST REMAIN AUTHORITATIVE>

Goal:
Refactor only <JOURNEY> so DomainHarness owns execution orchestration while the project keeps domain semantics, persistence authority, credentials and external integrations.

Required mapping before implementation:
1. inventory current steps;
2. classify each as Skill / Tool / Expr / Script / Child Workflow / Waiting Event / stays outside Harness;
3. identify every external side effect;
4. assign Tool effect none/idempotent/non-idempotent with evidence;
5. identify AI provider/runtime boundary;
6. identify current domain-authoritative state that must NOT move into Harness.

Hard constraints:
- import only from @kaicreator/domain-harness package root;
- no XState/Store/Runner/internal imports;
- no direct writes to DomainHarness SQLite tables;
- no provider/model routing in Harness assets;
- no credentials/secrets in Harness assets;
- no static parallel/DAG/dynamic spawn in v0.1;
- Script is deterministic trusted JSON-in/JSON-out code, not an external-I/O escape hatch;
- all external I/O is through host Tools;
- waiting states continue only through declared send() events;
- preserve existing public/domain contracts unless this task explicitly authorizes a change;
- do not delete the old path until equivalent validation passes.

Implementation order:
A. add/pin SDK dependency;
B. create one Runtime assembly point;
C. implement AI adapter;
D. implement Tools;
E. create Harness assets;
F. integrate one application entry path;
G. add happy/negative/recovery tests;
H. run Critical Journey validation;
I. only then remove superseded orchestration code.

Required evidence in the PR/issue:
- exact DomainHarness SHA;
- mapping table;
- changed files;
- Tool effect classifications;
- test commands/results;
- recovery test result for side-effect journey;
- confirmation that no SDK internal import exists;
- confirmation that domain authority is unchanged;
- any upstream DomainHarness contract gap as a separate issue rather than a local internal hack.
```

## 21. Upstream-gap rule

If the consumer project cannot implement a legitimate orchestration requirement using the public contract:

1. stop before importing internals;
2. create a focused issue in `kaicreator-mm/domain-harness`;
3. include the concrete domain-neutral scenario;
4. include expected vs actual public-contract behavior;
5. include why Tool/Skill/Expr/Script/Child/waiting cannot express it;
6. include downstream project/version and test evidence;
7. continue unrelated migration work if the gap is not a dependency blocker.

Do not solve an upstream contract gap by permanently forking Runtime internals inside the consuming project.

## 22. Definition of a good downstream architecture

After migration, the dependency direction should look like:

```text
Domain Project
  ├─ domain model / DB / APIs / permissions / business rules
  ├─ Tool implementations ─────────────┐
  ├─ AI Runtime adapter ───────────────┤
  ├─ Harness assets                    │
  │   ├─ workflows                     │
  │   ├─ skills                        │
  │   ├─ scripts                       │
  │   └─ schemas                       │
  └─ application lifecycle ───────┐    │
                                  v    v
                         @kaicreator/domain-harness
                         execution / persistence / recovery
```

DomainHarness should make orchestration more explicit and recoverable while leaving the domain project recognizably in control of its own product semantics.
