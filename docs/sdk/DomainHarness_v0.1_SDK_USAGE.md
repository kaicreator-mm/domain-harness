# DomainHarness v0.1 — SDK Usage Entry Point

This is the short entry point for consumers of `@kaicreator/domain-harness`.

For full implementation details, use:

- **`DomainHarness_v0.1_SDK_REFERENCE.md`** — authoritative consumer-facing API/DSL/reference guide.
- **`DomainHarness_v0.1_AGENT_MIGRATION_GUIDE.md`** — step-by-step migration playbook and handoff prompt for coding Agents refactoring an existing project onto DomainHarness.

## Minimal factory

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

`root` is the business-owned Harness asset root. `sqlitePath` is the v0.1 SQLite file and intentionally is not a generic storage abstraction.

## Public lifecycle

```text
start / send / wait / resume / cancel / get / listRuns
```

Run statuses:

```text
running | waiting | completed | failed | cancelled
```

Use `send()` only for an event declared by the current waiting state. Use `resume()` for compatible persisted `running` work after interruption; it is not an external-event substitute.

## Integration ownership

DomainHarness owns:

- execution order/control;
- Step journaling;
- waiting/resume/cancel lifecycle;
- definition lock;
- crash recovery;
- Skill/Tool/Expr/Script/Child Workflow dispatch.

The consuming project owns:

- domain semantics and authoritative domain state;
- databases/business repositories;
- authentication/authorization;
- credentials and external clients;
- Tool implementations;
- AI provider/model/routing through `AIOperationPort`.

## Harness primitives

```text
Skill          AI-backed domain capability
Tool           host external I/O / side-effect boundary
Expr           deterministic JSONata transformation/query
Script         trusted deterministic JSON-in/JSON-out Worker code
Child Workflow reusable sequential subflow in the same Harness
Waiting Event  durable external/human/system continuation point
```

Do not use Script as a side-effect escape hatch, do not import Runtime internals, and do not move domain authority into Workflow YAML.

## Recovery-sensitive Tool effects

```text
none | idempotent | non-idempotent
```

A `non-idempotent` Tool found persisted as `started` after interruption is **not** automatically replayed. An idempotent Tool must use a real deduplication contract such as the stable `ToolContext.idempotencyKey`.

## AI boundary

Skill execution crosses only the provider-neutral `AIOperationPort`. Provider SDKs, credentials and model routing remain in the consuming project/AI Runtime.

## Before an Agent migration

Give the Agent:

1. the exact DomainHarness commit SHA;
2. `DomainHarness_v0.1_SDK_REFERENCE.md`;
3. `DomainHarness_v0.1_AGENT_MIGRATION_GUIDE.md`;
4. the downstream project's own architecture/development standard;
5. one Critical Journey to migrate first.

Do not tell the Agent simply to "convert the project to DomainHarness". Require it to first map every current step to `Skill / Tool / Expr / Script / Child Workflow / Waiting Event / stays outside Harness` and justify Tool effect classification.
