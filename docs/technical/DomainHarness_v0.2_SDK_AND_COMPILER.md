# DomainHarness v0.2 — SDK and Compiler Guide

**Status:** ACTIVE for the v0.2 integration line  
**API audit baseline:** `608d3e67c28d32381949b7fe1597b455147f3a3f`  
**Authority:** Frozen v0.2 PRD, Frozen v0.2 L2, executable public contracts/tests  

This guide documents the merged v0.2 build/runtime boundary. It does not redefine the Frozen PRD/L2 and it does not make internal engine, SQL, XState, journal, or Raw Package loader internals part of the Runtime SDK.

## 1. The boundary to remember

```text
BUILD / CI
Raw Domain Package + Target Host Profile
        ↓
@kaicreator/domain-harness-compiler
        ↓
Target Compiled Domain Package module

APP STARTUP / RUNTIME
Target Compiled Domain Package module
+ RuntimeStore
+ RuntimeHostBindings
+ Runtime Resources
        ↓
createDomainRuntime / host convenience factory
        ↓
DomainRuntime
```

Application startup MUST NOT discover, parse, or recompile a Raw Domain Package. Runtime consumes already target-compiled package objects plus runtime-only host resources.

`Runtime Resources` are handles/values such as endpoints, credentials, sessions, database handles, and host connections. They are not Domain Data and must not become authoritative business truth inside DomainHarness.

## 2. v0.2 package roles

| Package | Role | Runtime dependency? |
| --- | --- | --- |
| `@kaicreator/domain-harness` | portable Runtime Core + public v0.2 contracts | Yes |
| `@kaicreator/domain-harness-compiler` | Node/build-time Raw Package loading, validation, compilation, module emission | Build/CI only |
| `@kaicreator/domain-harness-node` | Node RuntimeStore and Node host bindings/convenience assembly | Node host only |
| `@kaicreator/domain-harness-expo` | Expo SQLite/Hermes host bindings/convenience assembly | Expo host only |

The portable public Runtime API is imported from:

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

The public `DomainRuntime` surface is:

```ts
openInstance(request)
send(message)
query(request)
subscribe(request, listener)
recover(request)
invalidateBusinessSnapshot(request)
```

## 3. Compiler workflow

The compiler package root is the supported build-time API. At the audited baseline, its explicit package `exports` exposes:

```ts
import {
  loadRawDomainPackage,
  compileDomainPackage,
  emitTargetCompiledPackageModule,
  type BindingModuleReference,
  type CompileDomainPackageInput,
  type CompileDomainPackageResult,
  type CompiledPackageManifest,
  type EmitTargetModuleInput,
  type LoadRawDomainPackageOptions,
  type LoadedRawDomainPackage,
  type TargetHostProfile,
} from '@kaicreator/domain-harness-compiler';
```

Do not deep-import `dist/**` or repository `src/**` compiler paths. They are not the public consumer contract.

The build flow is:

1. `loadRawDomainPackage({ root, registeredTools? })`
2. `compileDomainPackage({ raw, domainVersion, target, bindingContents, ... })`
3. `emitTargetCompiledPackageModule({ manifest, bindingModules })`
4. write/bundle the generated Target Compiled Domain Package module as an application build artifact.

The Raw loader currently accepts the v0.1 authoring schema (`harness.yaml.schemaVersion: "0.1"`). This is an authoring/build compatibility path, not a runtime compatibility shim.

For a Raw Package with Tool invokes, use one authoritative build-time Tool-definition set: pass its Tool ids through `registeredTools` while loading, then pass the matching `RawToolDefinition[]` through `tools` when compiling. Registering a Tool name during Raw loading does not by itself create a compiled Tool descriptor.

### 3.1 Package-root build example

The minimal example below assumes the Raw Package contains no Tool invokes. Packages with Tools must additionally follow the Tool-definition rule above.

```ts
import { writeFile } from 'node:fs/promises';
import {
  compileDomainPackage,
  emitTargetCompiledPackageModule,
  loadRawDomainPackage,
  type TargetHostProfile,
} from '@kaicreator/domain-harness-compiler';

const raw = await loadRawDomainPackage({
  root: './domain-package',
});

const target = {
  id: 'node-production@1',
  capabilities: [
    'crypto-hash-sha256@1',
    'compiled-package-module@1',
    'expression-jsonata@1',
  ],
  bindings: {
    'crypto-hash-sha256@1': '@app/bindings/hash',
    'compiled-package-module@1': '@app/bindings/module',
    'expression-jsonata@1': '@app/bindings/expression',
  },
} satisfies TargetHostProfile;

// Immutable build artifacts used to content-address target bindings.
const bindingContents = {
  '@app/bindings/hash': '/* exact immutable module content */',
  '@app/bindings/module': '/* exact immutable module content */',
  '@app/bindings/expression': '/* exact immutable module content */',
};

const { manifest } = compileDomainPackage({
  raw,
  domainVersion: '2026.09.18',
  target,
  bindingContents,
});

const source = emitTargetCompiledPackageModule({
  manifest,
  bindingModules: {
    '@app/bindings/hash': {
      moduleSpecifier: './bindings/hash.js',
      exportName: 'binding',
      content: bindingContents['@app/bindings/hash'],
    },
    '@app/bindings/module': {
      moduleSpecifier: './bindings/module.js',
      exportName: 'binding',
      content: bindingContents['@app/bindings/module'],
    },
    '@app/bindings/expression': {
      moduleSpecifier: './bindings/expression.js',
      exportName: 'binding',
      content: bindingContents['@app/bindings/expression'],
    },
  },
});

await writeFile('./generated/domain-package.node.js', source, 'utf8');
```

The package-root API and its exported public types are covered by a packed clean-consumer test. Deep compiler paths are intentionally not part of the external API.

### 3.2 Compiler failure model

Compilation fails closed when required target capabilities or immutable binding content are missing. Target binding identity is content-addressed. The compiler, not Runtime startup, owns Raw Package loading and source validation.

Secrets, database handles, live sessions, endpoints, and other runtime-only values must not be emitted into the compiled manifest.

## 4. Target Compiled Domain Package

The public Runtime contract is:

```ts
interface TargetCompiledDomainPackage {
  manifest: CompiledPackageManifest;
  bindings: TargetExecutableBindings;
}
```

The generated module exports `manifest`, `bindings`, and a default frozen `{ manifest, bindings }` object. The application imports that generated object statically through its normal Node/Metro build.

Do not construct a runtime from a Raw Package root. Do not place a Raw Package path in `RuntimeResources` as a back door to runtime compilation.

## 5. Portable Runtime startup

```ts
import compiledPackage from './generated/domain-package.node.js';
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

const resources: RuntimeResources = {
  // Runtime-only values/handles. Never authoritative Domain Data.
};

const runtime = await createDomainRuntime({
  packageRegistry,
  store,
  bindings,
  resources,
});
```

For Node and Expo, prefer the host convenience factories described in `docs/integration/DomainHarness_v0.2_HOST_INTEGRATION.md` when useful. They preserve the same portable options contract.

## 6. App/UI interaction examples

Assume `runtime` is an initialized `DomainRuntime`.

### 6.1 Open a persistent Workflow Instance

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
```

The instance is pinned to a Target Compiled Package identity. Retained package modules must remain available while recoverable instances still reference them.

### 6.2 Durable state-changing message

```ts
const ack = await runtime.send({
  messageId: 'ui:approve:ORD-1001:1',
  target,
  type: 'APPROVE',
  payload: { actorId: 'user-42' },
  correlationId: 'order:ORD-1001',
});

console.log(ack.status, ack.targetSequence, ack.packageId);
```

`accepted` means the message was durably accepted and ordered. It does **not** mean workflow processing completed successfully. Use Query to observe disposition/state.

### 6.3 Query current state and message disposition

```ts
const current = await runtime.query({ kind: 'instance', target });

const disposition = await runtime.query({
  kind: 'message-disposition',
  target,
  messageId: 'ui:approve:ORD-1001:1',
});
```

Other public Query forms are `runtime-failure`, `package-pins`, and `projection`.

### 6.4 Subscription for UI refresh

```ts
const unsubscribe = runtime.subscribe(
  { kind: 'instance', target },
  () => {
    void runtime.query({ kind: 'instance', target }).then((result) => {
      // Update application/UI state from the fresh Query result.
      console.log(result);
    });
  },
);

// Later, when the view/scope is disposed:
unsubscribe();
```

A Subscription is a change signal with a revision, not an authoritative durable event log. Applications should re-query the state they need after a notification and must tolerate coalescing.

## 7. Business-data boundary

DomainHarness owns generic runtime mechanics: Workflow Instance state, message acceptance/disposition, effect/recovery facts, package pins, deterministic projections, and subscriptions.

The application/domain project remains authoritative for business entities, credentials, authorization, external systems, and domain-specific business truth.

For projections that read business data, the application supplies `BusinessSnapshotPort`; for compiled domain-data projection dependencies it may supply `CompiledDomainDataPort`. Those ports provide inputs to deterministic projection. They do not move authority into DomainHarness.

## 8. Explicit non-goals carried into SDK usage

Do not use v0.2 as:

- a distributed actor platform;
- a Kafka/Pulsar-style event bus;
- a distributed transaction coordinator;
- an application ORM/business database;
- a generic UI framework or navigation store;
- an AI provider/model router;
- a generic autonomous agent/tool-selection loop;
- a generic materialized-view/index/query platform.

Workflow-to-workflow Domain Messages remain inside one logical Domain Runtime. Projection remains derived, declared-input-only, and non-authoritative.

## 9. API audit checklist

Before copying an example to another project:

1. pin the exact DomainHarness package/repository revision;
2. import portable Runtime contracts from `@kaicreator/domain-harness/v2`;
3. import compiler build APIs only from `@kaicreator/domain-harness-compiler` package root;
4. import only documented Node/Expo host exports from their package roots;
5. start Runtime from imported Target Compiled Packages, never a Raw Package root;
6. keep Runtime Resources separate from compiled package identity and Domain Data;
7. use a stable message id for caller retry/dedup semantics;
8. treat `send()` ACK as acceptance, then Query/Subscribe for processing state;
9. retain package modules required by pinned instances;
10. fail closed on missing package/capability rather than substituting behavior.
