# DomainHarness

DomainHarness is a portable TypeScript **Domain Runtime SDK** for target-compiled Domain Packages. The current development line is **v0.2**; v0.1 remains the historical shipped baseline.

```text
Build / CI:
Raw Domain Package + Target Host Profile
        -> DomainHarness Compiler
        -> Target Compiled Domain Package

Runtime:
Target Compiled Domain Package
+ RuntimeStore
+ RuntimeHostBindings
+ Runtime Resources
        -> DomainRuntime
```

The v0.2 Runtime startup path never discovers or recompiles a Raw Domain Package.

## v0.2 package layout

This repository is a Git monorepo:

- `@kaicreator/domain-harness` — portable Runtime Core + public contracts;
- `@kaicreator/domain-harness-compiler` — Node/build-time compiler;
- `@kaicreator/domain-harness-node` — Node SQLite/host bindings;
- `@kaicreator/domain-harness-expo` — Expo SQLite/Hermes host bindings.

Runtime Core remains platform-independent TypeScript. Node-specific filesystem, SQLite-driver and Worker behavior belongs in build tooling or the Node host package, not in the portable core.

## v0.2 public Runtime API

Import the portable Runtime contract from the explicit v0.2 entry point:

```ts
import {
  createDomainRuntime,
  StaticPackageRegistry,
  type DomainRuntime,
  type RuntimeHostBindings,
  type RuntimeResources,
  type RuntimeStore,
  type TargetCompiledDomainPackage,
} from '@kaicreator/domain-harness/v2';
```

`DomainRuntime` exposes:

```text
openInstance
send
query
subscribe
recover
invalidateBusinessSnapshot
```

A minimal activation starts from an **already generated** Target Compiled Domain Package:

```ts
import compiledPackage from './generated/domain-package.js';
import {
  StaticPackageRegistry,
  createDomainRuntime,
  type RuntimeHostBindings,
  type RuntimeResources,
  type RuntimeStore,
  type TargetCompiledDomainPackage,
} from '@kaicreator/domain-harness/v2';

const targetPackage = compiledPackage as TargetCompiledDomainPackage;
const packageRegistry = new StaticPackageRegistry(
  [targetPackage],
  targetPackage.manifest.packageId,
);

declare const store: RuntimeStore;
declare const bindings: RuntimeHostBindings;
const resources: RuntimeResources = {};

const runtime = await createDomainRuntime({
  packageRegistry,
  store,
  bindings,
  resources,
});
```

Do **not** replace this with a Raw Package path, loader, or runtime compiler.

## App/UI interaction model

Use one primitive per intent:

```text
state-changing interaction -> Durable Domain Message
read                       -> Query
continuous read            -> Subscription + re-Query
```

Example:

```ts
const target = {
  workflowId: 'order_review',
  instanceKey: 'order:ORD-1001',
};

await runtime.openInstance({
  address: target,
  correlationId: 'order:ORD-1001',
  input: { orderId: 'ORD-1001' },
});

const ack = await runtime.send({
  messageId: 'ui:approve:ORD-1001:1',
  target,
  type: 'APPROVE',
  payload: { actorId: 'user-42' },
});

const disposition = await runtime.query({
  kind: 'message-disposition',
  target,
  messageId: ack.messageId,
});

const unsubscribe = runtime.subscribe(
  { kind: 'instance', target },
  () => {
    void runtime.query({ kind: 'instance', target }).then(console.log);
  },
);
```

A message ACK means durable acceptance/ordering, not successful processing. A Subscription is a change signal, not a durable event log.

## v0.2 integration documentation

Start here:

- `docs/technical/DomainHarness_v0.2_SDK_AND_COMPILER.md` — exact merged SDK/compiler boundary, build workflow, Target Compiled Package, Runtime API examples;
- `docs/integration/DomainHarness_v0.2_HOST_INTEGRATION.md` — Node and Expo host startup, stores/bindings, App/UI Message/Query/Subscription patterns;
- `docs/migration/DomainHarness_v0.1_TO_v0.2.md` — v0.1 API migration plus expression/Script migration rules;
- `docs/product/DomainHarness_v0.2_PRD_FROZEN.md` — frozen product authority;
- `docs/architecture/DomainHarness_v0.2_L2_ARCHITECTURE_EVIDENCE.md` — frozen architecture authority;
- `docs/implementation/DomainHarness_v0.2_TASK_DAG.md` — executable task authority.

### Compiler build-time API

Use the compiler package root. The merged public package explicitly exports the Raw Package loader, compiler, module emitter, and their public authoring/target/result types:

```ts
import {
  loadRawDomainPackage,
  compileDomainPackage,
  emitTargetCompiledPackageModule,
} from '@kaicreator/domain-harness-compiler';
```

Compiler deep paths such as `src/**` or `dist/**` are not the external API. Compilation stays in build/CI; application Runtime startup consumes only the generated Target Compiled Domain Package plus Runtime Resources.

## Node and Expo hosts

Node:

```ts
import {
  createNodeDomainRuntime,
  NodeSqliteRuntimeStore,
} from '@kaicreator/domain-harness-node';
```

Expo:

```ts
import {
  createExpoDomainRuntime,
  openExpoSqliteRuntimeStore,
} from '@kaicreator/domain-harness-expo';
```

Both host packages assemble the same portable Runtime contract. Host-specific SQLite, Script execution, hashing, random, transport, and other bindings must preserve the compiled package capability contract; unsupported capabilities fail closed rather than being semantically substituted.

## Business/domain authority boundary

DomainHarness owns generic execution mechanics:

- persistent Workflow Instances;
- durable Domain Message acceptance/disposition;
- deterministic serialized mutation per Workflow Instance;
- durable Domain Tool/effect recovery facts;
- Query/Subscription;
- deterministic declared-input Projection;
- package pinning and recovery mechanics.

The application/domain project remains authoritative for:

- business entities and business database state;
- authentication/authorization;
- credentials and live sessions;
- external systems/clients;
- domain-specific business models;
- AI provider/model routing.

Projection is derived/non-authoritative. Runtime Resources are runtime-only values/handles, not a place to move business truth into DomainHarness.

## Explicit non-goals

v0.2 is not a distributed actor platform, generic event bus, distributed transaction coordinator, ORM/business database, generic query engine/materialized-view platform, generic UI framework, AI Gateway/model router, or generic autonomous agent loop.

Workflow-to-workflow messaging stays inside one logical Domain Runtime.

## v0.1 migration warning

Do not assume the v0.1 Run API maps 1:1 to v0.2.

Notable changes:

- `runId` -> stable `WorkflowAddress` (`workflowId` + `instanceKey`);
- `start()` -> `openInstance()`;
- v0.1 `send(runId, event)` -> durable `send(DomainMessage)` with stable `messageId`;
- `wait()/get()` observation -> Query and Subscription + re-Query;
- no generic public v0.2 `listRuns`, arbitrary `resume`, or arbitrary `cancel` equivalent;
- v0.1 expression scope must be audited against the new persistent Instance scope;
- top-level v0.1 Script invokes must be migrated to target-compiled Script Domain Tools.

See `docs/migration/DomainHarness_v0.1_TO_v0.2.md` before porting a downstream project.

## Canonical development commands

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Task/PR CI is concern-local. A green task PR is not v0.2 Release Qualification; expensive cross-host/Hidden Validation and release closure remain version-level gates.

## v0.1 historical documentation

v0.1 remains available as historical frozen authority and migration input:

- `docs/DomainHarness_v0.1_INDEX.md`;
- `docs/product/DomainHarness_v0.1_PRD_FROZEN.md`;
- `docs/architecture/DomainHarness_v0.1_L2_ARCHITECTURE_EVIDENCE.md`;
- `docs/sdk/DomainHarness_v0.1_SDK_USAGE.md`;
- `docs/sdk/DomainHarness_v0.1_SDK_REFERENCE.md`;
- `docs/sdk/DomainHarness_v0.1_AGENT_MIGRATION_GUIDE.md`.

v0.2 does not retroactively redefine v0.1 behavior, and it does not require arbitrary active v0.1 Run state to become active v0.2 Workflow Instance state.
