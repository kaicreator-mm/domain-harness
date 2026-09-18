# DomainHarness v0.2 — Node and Expo Host Integration

**Status:** ACTIVE for the v0.2 integration line  
**API audit baseline:** `7a5736a1deea6bc165da6b9e1d36fc3be4ccc2bf`

This guide shows how an application wires an already generated Target Compiled Domain Package into Node or Expo. It deliberately starts **after build-time compilation**. Raw Domain Package discovery/compilation does not belong in application startup.

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

The host integration supplies:

- a `RuntimeStore` implementation;
- `RuntimeHostBindings` matching the capabilities advertised by the compiled package;
- optional `RuntimeResources`;
- optional provider-neutral `AIOperationPort`;
- optional application-owned business/domain-data snapshot ports.

Do not put authoritative business records into `RuntimeResources` merely to make them reachable by projections or workflows. Business authority remains application/domain-owned.

## 2. Node host

Package: `@kaicreator/domain-harness-node`  
Current engine declaration: Node `>=22`.

Public Node exports include:

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

The store configures/migrates its v0.2 SQLite schema on construction. Close the host store when the application shuts down:

```ts
store.close();
```

### 2.2 Host bindings

`RuntimeHostBindings` is a portable contract. The application must provide real implementations for the capabilities its Target Compiled Package declares.

Minimal shape:

```ts
import type { RuntimeHostBindings } from '@kaicreator/domain-harness/v2';

const bindings: RuntimeHostBindings = {
  capabilities: targetPackage.manifest.requiredCapabilities,
  sha256: {
    async digestUtf8(value) {
      // Use the host's SHA-256 implementation and return its canonical digest string.
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
      // Evaluate the compiled expression against request.input/logicalTime.
      throw new Error('wire the target JSONata/expression binding');
    },
  },
};
```

The placeholder methods above are intentionally not fake DomainHarness helpers. Replace them with application/host adapters. Do not advertise a capability in `bindings.capabilities` unless the corresponding behavior is actually available.

For Script packages, the Node host exports `NodeScriptExecutor`. It executes statically registered target-compiled modules through a Worker-based binding; it does not compile Raw TypeScript at runtime.

```ts
import { NodeScriptExecutor } from '@kaicreator/domain-harness-node';

const scriptExecutor = new NodeScriptExecutor({
  // bindingId -> statically generated module descriptor
});

bindings.script = scriptExecutor;
```

If the compiled package requires `http-transport@1`, `createNodeDomainRuntime()` can install the Node HTTP JSON remote transport when the capability is advertised and required Runtime Resources are supplied. If required resources are absent, activation fails rather than silently changing semantics.

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

`createNodeDomainRuntime()` delegates to the portable Runtime assembly. Node-specific convenience does not change the `DomainRuntime` interaction model.

## 3. Expo / React Native host

Package: `@kaicreator/domain-harness-expo`.

Public Expo exports include:

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

You may instead pass an already opened compatible database through `database`.

Close it when the application-owned lifetime ends:

```ts
await store.close();
```

### 3.2 Expo host bindings

Use the same portable `RuntimeHostBindings` interface as Node, but implement it with Expo/Hermes-safe APIs.

For Script execution, v0.2 exposes `ExpoScriptExecutor`. Its registry contains statically imported target-compiled functions; it never evaluates Raw Script source and does not assume Node Worker/Web Worker availability.

```ts
import { ExpoScriptExecutor } from '@kaicreator/domain-harness-expo';

const scriptExecutor = new ExpoScriptExecutor({
  // bindingId -> statically imported compiled function
});

bindings.script = scriptExecutor;
```

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

If `http-transport@1` is required, the Expo convenience assembly follows the same fail-closed rule as Node: it only installs the host transport when capability/resource requirements are satisfied.

## 4. App/UI interaction pattern

The application should use one interaction primitive per intent:

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

Persist/reuse a stable caller message id across a retry when the caller means “the same message”. A returned `accepted`/`duplicate` ACK is an acceptance fact, not a processing-completion result.

### 4.2 Query for the current view model

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

For derived Dynamic Domain State, use a declared projection:

```ts
const projection = await runtime.query({
  kind: 'projection',
  projectionId: 'order_review_summary',
  key: orderId,
});
```

Projection output is derived/non-authoritative. The application must revalidate authoritative business facts at commit/action boundaries.

### 4.3 Subscribe, then re-query

```ts
const unsubscribe = runtime.subscribe(
  { kind: 'instance', target },
  () => {
    void runtime.query({ kind: 'instance', target }).then(renderInstance);
  },
);

// UI unmount / scope disposal:
unsubscribe();
```

A subscription listener receives a change signal/revision. It is not a durable ordered event stream and may coalesce intermediate changes. Keep UI truth in the application's queried/authoritative state, not in a replay of subscription callbacks.

## 5. Package retention and upgrades

A Workflow Instance is pinned to a package id. When deploying an application build with a new Target Compiled Package:

1. add the new package to the static registry;
2. keep older package modules still referenced by recoverable instances;
3. choose the new package as default only for new instances when intended;
4. allow startup/preflight to fail closed if a retained pin is missing.

Example:

```ts
const packageRegistry = new StaticPackageRegistry(
  [packageV1, packageV2],
  packageV2.manifest.packageId,
);
```

Do not silently reinterpret an existing instance under a different compiled package.

## 6. Business snapshot/domain-data ports

`CreateDomainRuntimeOptions` optionally accepts:

```text
businessSnapshots

domainData
```

Use these only as application-owned read boundaries for declared Projection dependencies. They do not grant DomainHarness write authority over business systems. Domain Tools remain the explicit effect boundary for business mutations/external I/O.

## 7. Host integration checklist

- [ ] Generated Target Compiled Package is imported statically.
- [ ] No Raw Package loader/compiler is reachable from startup.
- [ ] `StaticPackageRegistry` contains every retained package pin needed by recoverable instances.
- [ ] Store is the correct host implementation (`NodeSqliteRuntimeStore` or Expo store).
- [ ] `RuntimeHostBindings.capabilities` reflects real host behavior; no semantic substitution.
- [ ] Required Script/HTTP bindings are registered only from target-compiled/static code.
- [ ] Runtime Resources contain only runtime values/handles, not authoritative Domain Data.
- [ ] Durable Message callers reuse ids only for the same logical message.
- [ ] UI uses Query after Subscription notifications.
- [ ] Shutdown owns/closes host stores outside the portable Runtime contract.

## 8. What this guide does not introduce

This integration does not create a server, broker, global event log, distributed runtime, ORM, generic UI framework, AI Gateway, generic agent loop, or authoritative projection database. Those remain outside the v0.2 product boundary.
