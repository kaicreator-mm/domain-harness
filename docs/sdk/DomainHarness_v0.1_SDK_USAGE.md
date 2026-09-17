# DomainHarness v0.1 — Public SDK Usage

## Factory

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

`root` is the immutable Harness asset root loaded and statically validated at startup. `sqlitePath` is the v0.1 SQLite file; this parameter is intentionally not a generic storage-provider abstraction.

## Lifecycle

The public `DomainHarness` contract exposes:

- `start({ workflowId, input })`
- `send(runId, event)`
- `wait(runId, options?)`
- `resume(runId)`
- `cancel(runId)`
- `get(runId)`
- `listRuns(query?)`

Run statuses are exactly:

```text
running | waiting | completed | failed | cancelled
```

`resume()` is for a persisted `running` Run after interruption. A `waiting` Run accepts only a declared event through `send()`. Terminal Runs are observable through `get`/`listRuns`/`wait`; they are not resumed.

Rejected `send()` calls — wrong Run state, undeclared event or invalid event payload — must not persist a state transition or event output.

## Host Tools

Tools are injected by the host and classified as:

```text
none | idempotent | non-idempotent
```

Each invocation receives `ToolContext` containing Run/Workflow/Step identity, `attempt`, a stable `idempotencyKey`, `AbortSignal`, and deterministic `now()`.

The host Tool remains responsible for credentials, external APIs, authorization and domain semantics. Credentials must not be placed into Harness assets, Step journal data or AI requests merely for Runtime convenience.

Recovery semantics depend on `effect`:

- completed journal entries are reused and never re-executed;
- replayable/idempotent work may execute again according to the frozen replay matrix, with stable execution identity/idempotency data;
- a `non-idempotent` Tool interrupted after `started` is not automatically replayed and materializes the frozen interrupted failure path.

## AI boundary

Skill execution uses only the provider-neutral `AIOperationPort`. Runtime sends structured Skill instructions/resources, JSON input, output schema, optional profile, execution identity and cancellation signal. Provider-specific SDKs and credentials stay outside DomainHarness.

Skill output is schema-validated before it is accepted as Step output.

## Expressions and Scripts

JSONata is an internal expression engine. v0.1 requires the patched 2.x line used by the package lock (minimum architectural floor 2.2.2), rejects `$random` and `$eval`, requires route conditions to produce strict booleans, and uses persisted logical time for deterministic `$now()` / `$millis()` behavior.

Scripts execute in a fresh Node Worker per invocation with JSON input/output, timeout/cancel/resource limits and an empty environment surface. Worker isolation is not a hostile-code sandbox and must not be documented as one.

## Child Workflow

A Child Workflow must belong to the same loaded Harness. It executes with an isolated workflow scope and deterministic `workflowInstanceId`, while the parent Workflow invocation remains one logical parent Step journal boundary. Child frames are persisted as part of Run control state and recover independently without replaying completed child internals.

## Definition lock

An active `running`/`waiting` Run carries both `definitionHash` and `executionEngineMajor`. Continuing execution requires compatibility with the currently loaded Harness/engine. Historical terminal Runs remain readable even when a later Harness definition differs.
