# @kaicreator/domain-harness

Portable DomainHarness v0.2 Runtime Core and Contract SDK.

The package root is the portable v0.2 public surface. It does not require Node built-ins, `better-sqlite3`, filesystem discovery, Worker Threads, or Raw Domain Package compilation at application startup.

## Installation (exact git pin)

The package is consumed by pinning an exact repository revision — there is no npm release. The built `dist/` tree is committed to the repository, so a git install delivers a usable package without lifecycle scripts:

```sh
pnpm add "github:kaicreator-mm/domain-harness#<exact-sha>&path:packages/domain-harness"
```

- Pin `<exact-sha>` to the full commit SHA you validated against; record it as your dependency fact.
- The subdirectory (`&path:`) form is required because this package lives in a monorepo; pnpm supports it (npm does not resolve git subdirectory dependencies).
- Use the same exact SHA for `@kaicreator/domain-harness-compiler` (its runtime peer dependency is satisfied by this package) and for the host packages if you consume them.

```ts
import {
  createDomainRuntime,
  StaticPackageRegistry,
  type DomainRuntime,
  type RuntimeHostBindings,
  type RuntimeStore,
  type TargetCompiledDomainPackage,
} from '@kaicreator/domain-harness';
```

`@kaicreator/domain-harness/v2` remains an alias for the same v0.2 portable surface for consumers that adopted the explicit subpath during development.

## Host bindings

The portable core owns runtime mechanics and contracts. Host-specific implementations live outside this package:

- `@kaicreator/domain-harness-node` — Node RuntimeStore and Node host bindings;
- `@kaicreator/domain-harness-expo` — Expo/Hermes RuntimeStore and host bindings;
- `@kaicreator/domain-harness-compiler` — build-time Raw Domain Package compilation.

Application startup supplies an already Target Compiled Domain Package plus RuntimeStore/host bindings/resources. The v0.2 runtime does not rediscover or compile a Raw Domain Package.

## v0.1 compatibility

v0.1 is a frozen release baseline with a Node-bound embedded runtime API (`createDomainHarness`, filesystem loader, SQLite journal, Script/Expression host execution). That API is intentionally **not re-exported from the v0.2 package root**, because doing so would make the v0.2 Runtime Core transitively depend on Node-only infrastructure and violate the v0.2 portability contract.

Applications that still require the v0.1 API must remain pinned to the v0.1 release/baseline while migrating to the v0.2 Runtime/host-package model.

## Public boundary

Public callers depend on portable Runtime contracts, Workflow Address / Domain Message semantics, Query/Subscription/Projection, package pinning, recovery and host-binding interfaces. SQLite rows, host driver types, compiler internals, private workflow-engine representation and Raw Package loader internals are not public v0.2 SDK contracts.
