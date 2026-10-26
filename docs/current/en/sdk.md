# DomainHarness v0.10.2 — SDK API

[Documentation index](index.md) · [中文版本](../zh-CN/sdk.md)

## Exported public packages (Node24)

| Concern | Package root | Boundary |
| --- | --- | --- |
| Shared ABI/types/errors | `@kaicreator/domain-harness-contracts` | Contracts, no K policy |
| External BUILD producer | `@kaicreator/domain-harness-build` | `buildV10App`, `projectSelectedComponents`; **not runtime** |
| Runtime facade | `@kaicreator/domain-harness-microkernel` | `load`; `send/query/subscribe/stop` |
| Optional Node Host | `@kaicreator/domain-harness-host-node` | CAS/SQLite and physical ports |

## Public runtime API (typed illustration, **not** executable by itself)

```ts
import { load, type DomainApp, type LoadAppOptions }
  from '@kaicreator/domain-harness-microkernel';
import type { V10BuiltApp, V10PublicIntent, V10ScopedSnapshotQuery }
  from '@kaicreator/domain-harness-contracts';

declare const app: V10BuiltApp;              // provided by trusted BUILD
declare const options: LoadAppOptions;       // supplied by application Host
declare const intent: V10PublicIntent;       // real domain input
declare const selector: V10ScopedSnapshotQuery; // explicit target

const runtime: DomainApp = await load(app, options);
const receipt = await runtime.send(intent);
const answer = await runtime.query(selector);
const several = await runtime.query([selector]);
const sub = await runtime.subscribe(selector, e => {
  // e: kind / occurrenceId / target / optional snapshot
});
sub.unsubscribe();
runtime.stop(); // sync, idempotent
```

`LoadAppOptions` requires `store: V10DocStore`, with optional `queryAuthority`, `deploymentIdentity` and related Host options. Query/Subscribe require genuine Host-bound scoped caller authority; never invent a principal from user input. Typed error families include `V10BuildError`, `V10ActivationError`, `V10ExternalEffectError`, `V10PortDeniedError` and `V10MultiBQueryError`. Sensitive Host details are removed from public error messages.

`./host-seam` is an exported trusted bootstrap API, **not** an access-control token. Retired Compiler and `src/dist` deep imports are not public APIs. Registry publication is not proven. Use a **complete** fixture in `examples/v0102-package-authoring/`. See the [original public API reference](../../manual/V0102_API_CHEATSHEET.md) and [actual source](https://github.com/kaicreator-mm/domain-harness/blob/v0.10.2/packages/microkernel/src/domain-app.ts).

---

**Version:** immutable tagged runtime `cee14399d9d0af4e20e34b9111861b16a465b690`. RQ **CONDITIONAL** (Full `EXIT1`, root `NOT_RUN` retained). This is post-release explanatory documentation, not a changed ABI.
