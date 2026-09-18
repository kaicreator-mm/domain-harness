# DomainHarness v0.1 → v0.2 Migration Guide

**Status:** ACTIVE for the v0.2 integration line  
**API audit baseline:** `608d3e67c28d32381949b7fe1597b455147f3a3f`

v0.2 is not a rename of the v0.1 Run API. It changes the application boundary from a Node-only runtime that loads a Raw Harness at startup to a portable Runtime that activates an already Target Compiled Domain Package.

This guide covers application API migration plus the two v0.1 authoring cases most likely to produce false assumptions: `expr` and `script`.

## 1. Migration in one picture

v0.1:

```text
App startup
  -> createDomainHarness({ root, sqlitePath, ai, tools })
  -> Runtime discovers/parses Raw Harness
  -> start/send/wait/resume/cancel/get/listRuns
```

v0.2:

```text
Build / CI
  Raw Domain Package
  -> @kaicreator/domain-harness-compiler
  -> Target Compiled Domain Package

App startup
  generated package import
  + PackageRegistry
  + RuntimeStore
  + RuntimeHostBindings
  + Runtime Resources
  -> createDomainRuntime / createNodeDomainRuntime / createExpoDomainRuntime
  -> openInstance/send/query/subscribe/recover
```

The migration must not reintroduce a compatibility shim that recompiles a Raw Package at application startup.

## 2. Compiler migration

Use the merged compiler package root during build/CI:

```ts
import {
  loadRawDomainPackage,
  compileDomainPackage,
  emitTargetCompiledPackageModule,
} from '@kaicreator/domain-harness-compiler';
```

Do not import compiler `src/**` or `dist/**` paths. The public package root and its exported public types are the supported consumer contract.

Compiler output is an application build artifact. Runtime startup imports that generated Target Compiled Domain Package and never receives a Raw Package root.

## 3. Application API map

| v0.1 | v0.2 | Migration note |
| --- | --- | --- |
| `createDomainHarness({ root, sqlitePath, ai, tools })` | build-time compiler + host store/bindings + `create*DomainRuntime()` | `root` is no longer a Runtime startup option. |
| opaque `runId` | `{ workflowId, instanceKey }` `WorkflowAddress` | Choose a stable business-facing instance key. |
| `start({ workflowId, input })` | `openInstance({ address, correlationId, input, packageId? })` | New instances are package-pinned. |
| `send(runId, { type, payload })` | `send({ messageId, target, type, payload, ... })` | Message acceptance is durable and explicitly deduplicated by caller identity. |
| `wait(runId)` | `query(...)` and/or `subscribe(...)+query(...)` | No blocking “wait until settled” interaction contract. |
| `get(runId)` | `query({ kind: 'instance', target })` | Read by stable Workflow Address. |
| `listRuns()` | no generic public instance-list API | Keep business collections/indexes in the application. |
| `resume(runId)` | no general public resume equivalent | `recover()` is for explicit `recovery_required` handling. |
| `cancel(runId)` | no general public cancel method | Model business cancellation as a declared Durable Domain Message when required. |
| `definitionHash` | `packageId` | v0.2 pins an immutable Target Compiled Package identity. |
| `running/waiting/completed/failed/cancelled` | `active/waiting/recovery_required/completed/failed/cancelled/terminated` | Handle `recovery_required` explicitly. |

## 4. Factory migration

### v0.1

```ts
import { createDomainHarness } from '@kaicreator/domain-harness';

const runtime = await createDomainHarness({
  root: './domain-package',
  sqlitePath: './runtime.sqlite',
  ai,
  tools,
});
```

### v0.2 Node

Compilation happens before this code runs:

```ts
import compiledPackage from './generated/domain-package.node.js';
import {
  StaticPackageRegistry,
  type RuntimeHostBindings,
  type RuntimeResources,
  type TargetCompiledDomainPackage,
} from '@kaicreator/domain-harness/v2';
import {
  createNodeDomainRuntime,
  NodeSqliteRuntimeStore,
} from '@kaicreator/domain-harness-node';

const targetPackage = compiledPackage as TargetCompiledDomainPackage;
const packageRegistry = new StaticPackageRegistry(
  [targetPackage],
  targetPackage.manifest.packageId,
);

const store = new NodeSqliteRuntimeStore({ path: './runtime.sqlite' });
declare const bindings: RuntimeHostBindings;
const resources: RuntimeResources = {};

const runtime = await createNodeDomainRuntime({
  packageRegistry,
  store,
  bindings,
  resources,
  ai,
});
```

For Expo, replace the host package/store/factory with `openExpoSqliteRuntimeStore()` + `createExpoDomainRuntime()`; the portable Runtime interaction API stays the same.

## 5. Identity migration: `runId` → `WorkflowAddress`

Prefer a stable application-owned instance key:

```ts
const target = {
  workflowId: 'order_review',
  instanceKey: `order:${orderId}`,
};

await runtime.openInstance({
  address: target,
  correlationId: `order:${orderId}`,
  input: { orderId },
});
```

The application/domain layer still owns what `orderId` means and where the authoritative order is stored.

## 6. Event migration: v0.1 `send` → Durable Domain Message

v0.1:

```ts
await runtime.send(run.runId, {
  type: 'approve',
  payload: { approvedBy: userId },
});
```

v0.2:

```ts
const messageId = `ui:approve:${orderId}:${clientAttemptId}`;

const ack = await runtime.send({
  messageId,
  target,
  type: 'APPROVE',
  payload: { approvedBy: userId },
  correlationId: `order:${orderId}`,
});
```

Migration rules:

- generate/reuse a stable `messageId` for retries of the same logical message;
- treat `accepted`/`duplicate` as durable acceptance, not successful processing;
- Query message disposition or Workflow Instance state to observe the result;
- do not recreate Durable Domain Message as a generic event bus/topic system.

## 7. Read/wait migration

One-time read:

```ts
const result = await runtime.query({ kind: 'instance', target });
```

Continuous UI observation:

```ts
const unsubscribe = runtime.subscribe(
  { kind: 'instance', target },
  () => {
    void runtime.query({ kind: 'instance', target }).then(renderInstance);
  },
);
```

Subscription is a change signal and may coalesce. Never rebuild authoritative state by replaying subscription callbacks.

## 8. v0.1 `expr` migration

### 8.1 What remains compatible

The v0.2 build-time Raw loader understands v0.1 authoring `invoke.expr`, and the compiler emits a compiled expression invoke. Runtime executes that expression through `RuntimeHostBindings.expression`.

```yaml
normalize:
  invoke:
    expr: '{"value": input.value * 2}'
  on:
    done:
      - target: completed
```

No Raw YAML is parsed at Runtime startup.

### 8.2 Expression scope must be reviewed

Do **not** assume a syntactically valid v0.1 JSONata expression is semantically unchanged.

Common v0.1 scope included:

```text
input
steps.<stateId>
run.visits.<stateId>
output
event
error
```

The merged v0.2 Runtime scope is centered on the persistent Workflow Instance:

```text
input
result
state.stateId
state.data
state.lastMessage
state.lastResult
address.workflowId
address.instanceKey
correlationId
packageId
stateRevision
message
error
```

Audit and rewrite references such as `steps.*`, `run.visits.*`, `output.*`, and `event.*` against the v0.2 Workflow model. Do not mechanically rewrite `steps.*` to `result`; v0.2 does not expose the old accumulated Step-output map. If later states require earlier data, model that data explicitly.

Expression migration checklist:

- expression parses during build-time validation;
- every referenced scope name exists in v0.2;
- route predicates still return strict booleans;
- no external I/O is introduced into expression evaluation;
- deterministic logical-time behavior is preserved;
- representative message/route behavior is tested.

## 9. v0.1 `script` migration

### 9.1 No direct top-level Script runtime compatibility

A v0.1 Workflow may contain:

```yaml
normalize:
  invoke:
    script: scripts/normalize.mjs
    input: "input"
  on:
    done:
      - target: completed
```

The v0.2 Raw loader can freeze that source during build, but the portable v0.2 Runtime does not execute top-level `kind: 'script'` invokes. Script execution belongs behind a target-compiled **Domain Tool**.

Do not ship a compiled package that relies on a top-level Script invoke and assume runtime compatibility.

### 9.2 Convert the Script to a Domain Tool

Compiler-side tool shape:

```ts
const normalizeTool = {
  toolId: 'normalize_record',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  effect: 'none',
  executionKind: 'script',
  requiredCapabilities: ['script-execution@1'],
  bindingCapability: 'script-execution@1',
} as const;
```

Change Workflow authoring from top-level `script` to `tool`:

```yaml
normalize:
  invoke:
    tool: normalize_record
    input: "input"
  on:
    done:
      - target: completed
```

Supply the tool definition to the compiler and provide the target's actual script binding artifact/module. At Runtime, Node may use `NodeScriptExecutor`; Expo may use `ExpoScriptExecutor`. Both execute statically registered target-compiled code rather than compiling/evaluating Raw TypeScript source at startup.

### 9.3 Choose effect semantics deliberately

```text
none            -> no external side effect
idempotent      -> repeated logical invocation can be externally deduplicated/repeated safely
non-idempotent  -> ambiguous interruption enters recovery_required; no blind retry
```

Do not copy `effect: none` unless it is true for the domain operation.

## 10. v0.1 host Tool migration

v0.1 registered host functions directly in `createDomainHarness({ tools })`. v0.2 separates:

```text
Domain Tool contract/semantics
        -> compiled package
Host mechanism/binding
        -> target host binding
Runtime endpoint/credential/session
        -> Runtime Resources
```

Move tool schemas/effect semantics into compile-time Domain Tool definitions while keeping live clients, tokens, database handles, and endpoints outside the compiled package.

## 11. Child Workflow note

v0.1 supported top-level `invoke.workflow`. The portable v0.2 Runtime does not execute top-level child-Workflow invokes. Cross-Workflow interaction is modeled as a durable Domain Message effect to another addressed Workflow Instance.

Treat existing child workflows as an explicit workflow-model migration rather than assuming compiler output alone preserves behavior.

## 12. Persistence/state migration

v0.2 does not require arbitrary active v0.1 Run state to become an active v0.2 Workflow Instance.

Recommended approach:

1. retain v0.1 persisted data for historical/audit needs according to application policy;
2. create v0.2 storage through the selected host RuntimeStore;
3. start new v0.2 Workflow Instances with stable addresses and compiled package pins;
4. migrate business state in the authoritative business system, not into DomainHarness persistence;
5. add bespoke historical conversion tooling only for a concrete domain requirement.

Do not make v0.2 startup read/upgrade a Raw v0.1 Harness as an implicit runtime migration step.

## 13. Package pin migration/deployment

v0.2 instances persist `packageId`. On upgrade:

- keep every Target Compiled Package still required by recoverable instances in `StaticPackageRegistry`;
- select the intended new default package for newly opened instances;
- fail closed if a retained package pin is missing;
- do not reinterpret old instance state under the newest package automatically.

## 14. Migration verification checklist

### Build

- [ ] Raw Package is compiled during build/CI, not app startup.
- [ ] compiler imports come from `@kaicreator/domain-harness-compiler` package root.
- [ ] no compiler `src/**` or `dist/**` deep import is used as public API.
- [ ] target capabilities and immutable binding artifact content are checked.
- [ ] generated package contains no credentials/runtime handles.

### Application API

- [ ] `runId` usage is replaced with a stable `WorkflowAddress` mapping.
- [ ] state changes use Durable Domain Messages with stable caller message ids.
- [ ] `wait/get` flows are replaced with Query/Subscription as appropriate.
- [ ] no fake v0.2 `listInstances`, general `resume`, or general `cancel` API was invented.
- [ ] UI handles `recovery_required` explicitly.

### Expressions

- [ ] all v0.1 `steps.*`, `run.visits.*`, `output`, and `event.*` references were audited.
- [ ] representative expressions/routes have executable tests.

### Scripts

- [ ] every v0.1 top-level Script invoke was migrated to an explicit Script Domain Tool or redesigned.
- [ ] effect semantics are correct.
- [ ] target-compiled/static script module is registered for the selected host.
- [ ] no runtime TypeScript compilation/Raw Script discovery remains.

### Authority boundary

- [ ] business records remain in the business/domain system.
- [ ] Projection output is treated as derived/non-authoritative.
- [ ] credentials/endpoints/sessions remain Runtime Resources or application-owned host state.

## 15. Migration anti-patterns

Reject these patterns:

```text
createDomainRuntime({ rawRoot: ... })
runtime.loadHarness(...)
runtime.compile(...)
startup -> scan workflows/*.yaml
startup -> compile scripts/*.ts
@kaicreator/domain-harness-compiler/dist/...
subscription callbacks -> treated as durable ordered event history
Projection -> writes authoritative business state
latest package -> silently used for all retained instances
v0.1 script invoke -> assumed executable in v0.2 without Domain Tool conversion
```

Migration is complete when build-time compilation and runtime activation are cleanly separated, application interaction uses the v0.2 Instance/Message/Query/Subscription contracts, and no business-authority or generic-platform scope leaks into DomainHarness.
