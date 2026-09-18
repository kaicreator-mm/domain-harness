# DomainHarness v0.2 — Node and Expo Host Integration

**Status:** ACTIVE for the v0.2 integration line  
**API audit baseline:** `608d3e67c28d32381949b7fe1597b455147f3a3f`

This guide shows how an application wires an already generated Target Compiled Domain Package into Node or Expo. It starts **after build-time compilation**. Raw Domain Package discovery/compilation does not belong in application startup.

For compiler details, see `docs/technical/DomainHarness_v0.2_SDK_AND_COMPILER.md`.

## 1. Shared startup shape

Node and Expo use the same portable Runtime contract:

```ts
import compiledPackage from './generated/domain-package.js';
import {
  StaticPackageRegistry,
  type RuntimeHostBindings,
  type RuntimeResources,
  type TargetCompiledDomainPackage,
} from '@kaicreator/domain-harness/v2';

const targetPackage = compiledPackage as TargetCompiledDomainPackage;
const packageRegistry = new StaticPackageRegistry(
  [targetPackage],
  targetPackage.manifest.packageId,
);

const resources: RuntimeResources = {
  // runtime-only endpoints, credentials, sessions, connections, handles, etc.
};

declare const bindings: RuntimeHostBindings;
```

The host integration supplies a `RuntimeStore`, host bindings matching the compiled package capabilities, optional Runtime Resources, optional provider-neutral `AIOperationPort`, and optional application-owned business/domain-data snapshot ports.

Do not put authoritative business records into `RuntimeResources`. Business authority remains application/domain-owned.

## 2. Node host

Package: `@kaicreator/domain-harness-node`  
Current engine declaration: Node `>=22`.

Public Node exports used by this guide include:

- `createNodeDomainRuntime()`;
- `NodeSqliteRuntimeStore`;
- `NodeScriptExecutor`;
- Node HTTP JSON remote transport helpers.

### 2.1 RuntimeStore

```ts
import { NodeSqliteRuntimeStore } from '@kaicreator/domain-harness-node';

const store = new NodeSqliteRuntimeStore({
  path: './data/domain-harness.sqlite',
});
```

Close the application-owned store on shutdown:

```ts
store.close();
```

### 2.2 Host bindings

`RuntimeHostBindings` is portable. The application must provide real behavior for every advertised capability.

```ts
import type { RuntimeHostBindings } from '@kaicreator/domain-harness/v2';

const bindings: RuntimeHostBindings = {
  capabilities: targetPackage.manifest.requiredCapabilities,
  sha256: {
    async digestUtf8(value) {
      throw new Error('wire Node SHA-256 binding');
    },
  },
  secureRandom: {
    randomId() {
      throw new Error('wire Node secure-random binding');
    },
  },
  expression: {
    async evaluate(request) {
      throw new Error('wire the target JSONata/expression binding');
    },
  },
};
```

These throws are placeholders for application/host adapters, not fake DomainHarness helpers. Do not advertise a capability unless the corresponding behavior exists.

For Script packages, Node provides `NodeScriptExecutor`. It executes statically registered target-compiled modules; it does not compile Raw TypeScript at runtime.

```ts
import { NodeScriptExecutor } from '@kaicreator/domain-harness-node';

const scriptExecutor = new NodeScriptExecutor({
  // bindingId -> statically generated module descriptor
});

bindings.script = scriptExecutor;
```

### 2.3 Create the Node runtime

```ts
import { createNodeDomainRuntime } from '@kaicreator/domain-harness-node';

const runtime = await createNodeDomainRuntime({
  packageRegistry,
  store,
  bindings,
  resources,
  // ai,
  // businessSnapshots,
  // domainData,
});
```

Node convenience assembly does not change the portable `DomainRuntime` interaction model.

## 3. Expo / React Native host

Package: `@kaicreator/domain-harness-expo`.

Public Expo exports used by this guide include:

- `createExpoDomainRuntime()`;
- `openExpoSqliteRuntimeStore()` and `ExpoSqliteRuntimeStore`;
- `ExpoScriptExecutor`;
- Expo HTTP JSON remote transport helpers.

The Expo binding is designed for Hermes/Expo and does not depend on Node Worker APIs.

### 3.1 RuntimeStore using `expo-sqlite`

```ts
import * as SQLite from 'expo-sqlite';
import { openExpoSqliteRuntimeStore } from '@kaicreator/domain-harness-expo';

const store = await openExpoSqliteRuntimeStore({
  sqlite: SQLite,
  databaseName: 'domain-harness.sqlite',
});
```

An already opened compatible database may be passed through `database` instead. Close the store when the application-owned lifetime ends:

```ts
await store.close();
```

### 3.2 Expo host bindings and Script execution

Use the same portable `RuntimeHostBindings` contract, implemented with Expo/Hermes-safe APIs.

```ts
import { ExpoScriptExecutor } from '@kaicreator/domain-harness-expo';

const scriptExecutor = new ExpoScriptExecutor({
  // bindingId -> statically imported compiled function
});

bindings.script = scriptExecutor;
```

`ExpoScriptExecutor` executes statically imported target-compiled functions. It does not evaluate Raw Script source and does not assume Node Worker/Web Worker availability.

### 3.3 Create the Expo runtime

```ts
import { createExpoDomainRuntime } from '@kaicreator/domain-harness-expo';

const runtime = await createExpoDomainRuntime({
  packageRegistry,
  store,
  bindings,
  resources,
  // ai,
  // businessSnapshots,
  // domainData,
});
```

If `http-transport@1` is required, host convenience assembly remains fail-closed: transport is installed only when the capability and required Runtime Resources are present.

## 4. App/UI interaction pattern

Use one interaction primitive per intent:

```text
state-changing interaction -> Durable Domain Message
one-time read              -> Query
continuous UI refresh      -> Subscription + re-Query
```

### 4.1 Durable Message from a UI action

```ts
const target = {
  workflowId: 'order_review',
  instanceKey: `order:${orderId}`,
};

const ack = await runtime.send({
  messageId: `ui:approve:${orderId}:${clientAttemptId}`,
  target,
  type: 'APPROVE',
  payload: { actorId: currentUserId },
  correlationId: `order:${orderId}`,
});
```

Reuse a stable caller message id only when retrying the same logical message. An `accepted`/`duplicate` ACK is an acceptance fact, not processing completion.

### 4.2 Query current state

```ts
const instanceResult = await runtime.query({
  kind: 'instance',
  target,
});

const dispositionResult = await runtime.query({
  kind: 'message-disposition',
  target,
  messageId: `ui:approve:${orderId}:${clientAttemptId}`,
});
```

For derived Dynamic Domain State:

```ts
const projection = await runtime.query({
  kind: 'projection',
  projectionId: 'order_review_summary',
  key: orderId,
});
```

Projection output is derived/non-authoritative. Revalidate authoritative business facts at commit/action boundaries.

### 4.3 Subscribe, then re-query

```ts
const unsubscribe = runtime.subscribe(
  { kind: 'instance', target },
  () => {
    void runtime.query({ kind: 'instance', target }).then(renderInstance);
  },
);

unsubscribe();
```

Subscription is a change signal, not a durable ordered event stream, and may coalesce intermediate changes.

## 5. Package retention and upgrades

A Workflow Instance is pinned to a package id. When deploying a new Target Compiled Package:

1. add the new package to the static registry;
2. keep older package modules still referenced by recoverable instances;
3. choose the new package as default only for new instances when intended;
4. fail closed if a retained pin is missing.

```ts
const packageRegistry = new StaticPackageRegistry(
  [packageV1, packageV2],
  packageV2.manifest.packageId,
);
```

Do not silently reinterpret an existing instance under a different compiled package.

## 6. Business snapshot/domain-data ports

`CreateDomainRuntimeOptions` may accept `businessSnapshots` and `domainData` as application-owned read boundaries for declared Projection dependencies. They do not grant DomainHarness write authority over business systems. Domain Tools remain the explicit effect boundary for business mutations/external I/O.

## 7. Host integration checklist

- [ ] Target Compiled Domain Package is imported statically.
- [ ] No Raw Package loader/compiler is reachable from startup.
- [ ] `StaticPackageRegistry` contains every retained package pin needed by recoverable instances.
- [ ] Store is the correct host implementation.
- [ ] `RuntimeHostBindings.capabilities` reflects real host behavior; no semantic substitution.
- [ ] Required Script/HTTP bindings come only from target-compiled/static code.
- [ ] Runtime Resources contain runtime values/handles, not authoritative Domain Data.
- [ ] Durable Message callers reuse ids only for the same logical message.
- [ ] UI re-queries after Subscription notifications.
- [ ] Host store lifetime is owned/closed by the application.

## 8. Non-goals

This integration does not create a server, broker, global event log, distributed runtime, ORM, generic UI framework, AI Gateway, generic agent loop, or authoritative projection database. Those remain outside the v0.2 product boundary.
