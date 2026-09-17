# DomainHarness v0.1 — Agent Migration Guide

> Purpose: give a coding Agent a safe, repeatable path for refactoring an existing project onto `@kaicreator/domain-harness` without moving domain authority into the SDK or depending on private Runtime internals.
>
> Read together with `DomainHarness_v0.1_SDK_REFERENCE.md`.

## 1. Migration objective

A successful migration does **not** mean “rewrite the project as workflows”. It means:

1. preserve the project’s existing domain model, APIs, database and business authority;
2. move only durable orchestration/execution mechanics into DomainHarness;
3. keep external I/O and side effects behind host Tools;
4. keep provider/model routing behind the project’s AI Runtime adapter;
5. keep deterministic calculations in Expr or Script where appropriate;
6. use Waiting Events for durable external/human continuation points;
7. migrate incrementally by Critical Journey rather than replacing the whole project at once.

## 2. Boundary decision table

Before changing code, classify each current concern.

| Existing concern | DomainHarness mapping | Ownership rule |
|---|---|---|
| LLM prompt + structured result | Skill | provider/model routing stays in host AI Runtime |
| REST / DB / file / queue / payment call | Tool | credentials/client ownership stays in host code |
| compact JSON transform/query/routing logic | Expr | no external I/O |
| deterministic trusted code | Script | JSON-in/JSON-out; no business side effects |
| reusable sequential sub-process | Child Workflow | same Harness only in v0.1 |
| approval/callback/external continuation | Waiting state + event | authentication/authorization stays in host API |
| authoritative entity/business state | usually stays in project | DomainHarness must not become the domain database |
| provider/model selection | AI Runtime adapter | never encode provider selection in Workflow YAML |
| secrets/credentials | host code | never store in Harness assets merely for convenience |

Rule of thumb:

```text
“What does this business entity mean?”      → domain project
“What execution step happens next?”         → candidate for DomainHarness
```

## 3. Required inputs for the Agent

Before implementation, the Agent must have:

- an exact DomainHarness commit SHA to integrate;
- `DomainHarness_v0.1_SDK_REFERENCE.md` from that same SHA;
- this migration guide from that same SHA;
- the downstream project’s architecture/development standard;
- the project’s domain-authority boundaries;
- one Critical Journey to migrate first;
- current tests/fixtures for that journey;
- current AI abstraction/AI Runtime boundary;
- current external side-effect integrations;
- persistence and transaction ownership rules.

Do not begin by auto-generating Workflow YAML from source code. First produce a migration map and review it.

## 4. Phase A — inventory one Critical Journey

Create a table before implementation.

| Current step | Existing implementation | Side effect? | Replay/idempotency | Proposed mapping |
|---|---|---:|---|---|
| classify request | prompt/service | no | replayable | Skill |
| load customer | repository/API read | external read | replayable | Tool `effect:none` |
| calculate fields | utility | no | replayable | Expr or Script |
| create external order | API write | yes | provider supports dedupe key | Tool `effect:idempotent` |
| legacy charge | irreversible API | yes | no safe dedupe | Tool `effect:non-idempotent` |
| approval | callback/polling | external continuation | n/a | Waiting Event |

The Agent must justify every Tool `effect` classification with real behavior of the external system.

## 5. Phase B — create the Harness boundary

Recommended shape:

```text
<project>/
├─ src/
│  ├─ domain/                  # existing domain authority
│  ├─ infrastructure/          # existing DB/API/queue clients
│  └─ harness/
│     ├─ runtime.ts            # SDK assembly
│     ├─ ai-port.ts            # AIOperationPort adapter
│     └─ tools/                # host Tool adapters
├─ harness/
│  ├─ harness.yaml
│  ├─ workflows/
│  ├─ skills/
│  ├─ scripts/
│  └─ schemas/
└─ tests/
```

Ownership must stay clear:

```text
Harness assets   = executable orchestration definition
Host TypeScript  = adapters, credentials, external clients, domain services
Domain model     = existing project authority
```

Do not put `.env`, API keys, DB credentials or secret-bearing configuration under the Harness root.

## 6. Phase C — create one application-owned Runtime assembly point

Use a single host-owned factory module. On ESM projects, use `fileURLToPath()` instead of `URL.pathname` so the path is correct on Windows as well as Unix-like systems.

```ts
import { fileURLToPath } from 'node:url';
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
    root: fileURLToPath(new URL('../../harness/', import.meta.url)),
    sqlitePath: process.env.DOMAIN_HARNESS_DB ?? './data/domain-harness.sqlite',
    ai,
    tools,
  });
}
```

Application code must not instantiate or import Loader, `SqliteStore`, Runner, XState, recovery internals or raw persistence types.

## 7. Phase D — adapt external behavior through Tools

A Tool should adapt an existing domain/infrastructure capability instead of becoming a new domain layer.

```ts
import type { HarnessTool } from '@kaicreator/domain-harness';

export const loadCustomerTool: HarnessTool<
  { customerId: string },
  { customerId: string; name: string }
> = {
  effect: 'none',
  async execute(input, ctx) {
    ctx.signal.throwIfAborted();
    const customer = await customerRepository.get(input.customerId);
    return { customerId: customer.id, name: customer.name };
  },
};
```

### Idempotent write

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

Only classify a write as `idempotent` when the target system really honors an equivalent deduplication contract.

### Non-idempotent write

```ts
export const legacyChargeTool: HarnessTool = {
  effect: 'non-idempotent',
  async execute(input, ctx) {
    return legacyBilling.charge(input, { signal: ctx.signal });
  },
};
```

Do not wrap a `non-idempotent` Tool in automatic host retries. If the Runtime recovers a persisted `started` non-idempotent Tool Step, v0.1 deliberately refuses automatic replay.

## 8. Phase E — adapt the project AI Runtime

DomainHarness exposes a provider-neutral AI boundary:

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

Invariant:

```text
DomainHarness → Skill intent/schema/orchestration
Host AI Runtime → provider/model/routing/retry/cost/credentials
```

Do not add provider-specific fields or credentials to Workflow YAML or Skill assets.

## 9. Phase F — migrate AI prompt assets into Skills

Typical Skill layout:

```text
harness/skills/<skill-id>/
├─ SKILL.md
├─ skill.harness.yaml
├─ input.schema.json       # optional
├─ output.schema.json      # required
└─ refs/                   # optional resources
```

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

During the first migration, preserve prompt meaning. Moving a prompt into a Skill and rewriting the prompt are separate concerns unless the migration explicitly requires both.

## 10. Phase G — express orchestration in Workflow YAML

Start with a sequential flow.

```yaml
initial: analyze
output: '{"result": steps.decide, "approval": steps.await_approval}'

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
      expr: '{"requestId": input.requestId, "approved": input.score >= 0.8}'
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

Do not reproduce every existing service function as a Workflow state. States should represent durable orchestration steps and decisions.

## 11. Expr vs Script vs Tool

Use **Expr** when the operation is compact, deterministic and naturally expressed over JSON.

Use **Script** when deterministic JSON-in/JSON-out logic is clearer in code than JSONata.

Use **Tool** when the step touches network, filesystem, database, queue, external state, credentials or irreversible business side effects.

Current v0.1 Script execution loads the frozen Script source as JavaScript ESM inside a Worker. Downstream assets should therefore use executable JavaScript/ESM syntax (for example `.mjs`) unless the downstream build explicitly precompiles TypeScript to JavaScript before the Harness is loaded. Do not assume DomainHarness transpiles TypeScript Script assets at runtime.

Script is trusted extension code; it is not a hostile-code sandbox and must not be used as a side-effect escape hatch.

## 12. Waiting Events

Host APIs continue to own authentication and authorization. After authorization, they may continue a waiting Run:

```ts
await harness.send(runId, {
  type: 'approve',
  payload: request.body,
});
```

The event must be declared by the current waiting state. If a schema is declared, DomainHarness validates the payload before accepting the event.

Do not use `resume()` as a replacement for an external event.

## 13. Child Workflows

Extract a Child Workflow only when the sequence is genuinely reusable or independently understandable.

Good:

```text
main → quality_check → approval
```

Avoid creating one Child Workflow for every old function call.

v0.1 Child Workflows are:

- sequential;
- same-Harness only;
- isolated by `workflowInstanceId`;
- statically cycle-checked;
- independently journaled internally;
- represented to the parent as one logical parent Step.

Do not simulate generic DAG/parallel behavior in host wrappers.

## 14. Application integration patterns

### Request/response path

```ts
const started = await harness.start({ workflowId: 'main', input });
const boundary = await harness.wait(started.runId, { timeoutMs: 30_000 });

return {
  runId: boundary.runId,
  status: boundary.status,
  output: boundary.output,
};
```

### External callback

```ts
await authorizeCallback(actor, runId);
return harness.send(runId, {
  type: 'provider_callback',
  payload,
});
```

### Process restart

A project may identify persisted `running` Runs and call `resume(runId)` under the same compatible Harness definition. Waiting Runs require their declared event instead.

### Domain record linkage

Store the DomainHarness `runId` in an application record when needed for lookup. Do not duplicate the DomainHarness journal or directly update its SQLite tables.

## 15. Definition-lock rule during project refactors

Active Runs store `definitionHash` and `executionEngineMajor`. A changed Harness definition may therefore refuse continuation of an older active Run.

Before deploying changed Harness assets, the downstream project must choose an explicit active-run policy, for example:

- drain active Runs before switching definitions; or
- keep the previous application/Harness deployment available until those Runs finish.

Do not mutate assets in place and assume old active Runs will transparently continue.

## 16. Agent prohibitions

A migration Agent MUST NOT:

1. change the DomainHarness public API merely to make one consumer easier to migrate;
2. import DomainHarness internal files or XState types;
3. write directly to DomainHarness SQLite tables;
4. move provider/model routing into Harness assets;
5. put credentials/secrets into Harness assets or journal inputs for convenience;
6. claim an unsafe write is idempotent without evidence;
7. implement static parallelism, generic DAG or dynamic spawn in consumer wrappers;
8. use Script for external side effects;
9. move authoritative domain state into Workflow YAML;
10. delete the old path before equivalent validation passes.

## 17. Incremental migration sequence

### M0 — contract-only integration

- pin an exact DomainHarness SHA/tarball;
- add one Runtime assembly point;
- add AI adapter and Tool registry;
- do not switch production behavior yet.

### M1 — one low-risk Critical Journey

Choose a sequential journey with existing tests, clear start/end and limited side effects. Run old/new behavior against the same fixtures when practical.

### M2 — side-effect journey

Add reviewed Tool effect classifications plus replay/crash tests.

### M3 — approval/callback journey

Move ad-hoc polling/callback orchestration into a waiting state + `send()`.

### M4 — reusable Child Workflow extraction

Extract shared sequential subflows only after real reuse is demonstrated.

Do not start with the project’s most complicated journey.

## 18. Required migration tests

At minimum, cover:

- valid Harness load;
- missing Tool registration fails startup;
- invalid Skill/resource/schema fails startup;
- invalid transition/unreachable state fails startup;
- `start → completed` happy path;
- `start → waiting → send → completed` path;
- invalid/undeclared waiting event rejection;
- Tool effect behavior and stable idempotency key where applicable;
- non-idempotent interruption without duplicate external effect;
- Skill request construction and output-schema rejection;
- Expr/Script deterministic output and error/timeout behavior;
- persisted `running` Run recovery under same definition;
- changed definition refusing continuation;
- completed Step output not being duplicated;
- existing domain invariants remaining authoritative outside DomainHarness.

## 19. Migration acceptance checklist

A migrated concern is complete only when all applicable statements are true:

- [ ] Exact DomainHarness SHA/tarball is recorded.
- [ ] Clean dependency installation is reproducible.
- [ ] One application-owned Runtime assembly point exists.
- [ ] Domain authority remains in the downstream project.
- [ ] AI provider/model routing remains outside DomainHarness.
- [ ] Every external side effect is a Tool.
- [ ] Every Tool has reviewed `effect` classification.
- [ ] Credentials/secrets remain outside Harness assets.
- [ ] Skills have valid output schemas.
- [ ] Workflow loads with no static-validation errors.
- [ ] Conditional route sets end in an unconditional fallback.
- [ ] Waiting events are authenticated/authorized by the host before `send()`.
- [ ] Happy-path tests pass.
- [ ] Waiting/event tests pass.
- [ ] Crash/recovery tests pass for side-effecting journeys.
- [ ] Old implementation is removed only after equivalent journey validation passes.
- [ ] No downstream code imports DomainHarness internals.

## 20. What to do when DomainHarness appears insufficient

Do **not** immediately patch or fork the Runtime inside the consumer project.

Instead:

1. capture the real scenario;
2. record expected vs actual behavior;
3. minimize reproduction assets;
4. classify whether the gap is product scope, SDK contract, Runtime defect or documentation gap;
5. open an upstream DomainHarness Issue;
6. keep downstream workaround code explicit and temporary if one is unavoidable.

A consumer-specific convenience is not automatically a Runtime primitive.

## 21. Agent handoff prompt template

Use this as the starting prompt for Codex/Claude Code/another coding Agent. Fill every placeholder before execution.

```text
You are refactoring <PROJECT> to consume @kaicreator/domain-harness.

DomainHarness source:
- repo: https://github.com/kaicreator-mm/domain-harness
- exact SHA: <DOMAIN_HARNESS_SHA>
- SDK reference: docs/sdk/DomainHarness_v0.1_SDK_REFERENCE.md
- migration guide: docs/sdk/DomainHarness_v0.1_AGENT_MIGRATION_GUIDE.md

Project authority:
- repository: <PROJECT_REPO>
- development standard/version: <STANDARD>
- frozen PRD/architecture authorities: <PATHS>
- domain authority remains in: <MODULES/DB/SERVICES>

Migration target:
- Critical Journey: <JOURNEY>
- current entrypoint: <ENTRYPOINT>
- current tests/fixtures: <TEST_PATHS>

Required process:
1. Read the project authority and the two DomainHarness SDK documents before editing code.
2. Produce a migration map: each current step → Skill / Tool / Expr / Script / Child Workflow / Waiting Event / stays outside Harness.
3. Identify every external side effect and justify Tool effect classification.
4. Preserve existing external API/domain contracts unless explicitly approved otherwise.
5. Create one project-owned DomainHarness assembly point; do not import Runtime internals.
6. Migrate only the named Critical Journey first.
7. Keep provider/model routing and credentials outside Harness assets.
8. Add tests for happy path, waiting/event behavior, schema failure, relevant crash/replay behavior and domain-authority preservation.
9. Run the project’s required local/CI validation.
10. If DomainHarness itself appears deficient, do not silently fork it. Open an upstream issue with reproduction/evidence.

Hard prohibitions:
- no XState/internal DomainHarness imports;
- no direct writes to DomainHarness SQLite tables;
- no generic DAG/parallel emulation;
- no Script side-effect escape hatch;
- no unproven idempotent classification;
- no deletion of the old path before equivalent validation passes.

Deliverables:
- migration map;
- changed-file summary;
- Harness assets;
- host Tool/AI adapters;
- tests and execution evidence;
- remaining risks/blockers;
- upstream DomainHarness issue(s), if any.
```

## 22. Source of truth

For downstream integration behavior, use this precedence:

```text
exact pinned DomainHarness source/contracts/tests
→ DomainHarness_v0.1_SDK_REFERENCE.md
→ this Agent Migration Guide
→ downstream project authority
```

The frozen DomainHarness PRD and architecture remain upstream product/architecture authority. A consumer must not reinterpret this migration guide as permission to expand v0.1 scope.
